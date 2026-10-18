"""社团报名 API（Module D-2）。

重要隔离规则：社团报名 ≠ 学校身份验证 —— 报名表单填写的学校信息
不会自动开启 identity_school_verified，学校身份必须独立走人工审核流程。

校验策略（宽松，兼容尚未录入系统的新生）：
- college_id 必须为启用学院；major_id 必须归属选中的学院且启用；
- 入学年份 4 位数字；班号后缀大写 A-Z 允许空；
- **不校验**年级+专业+班号是否存在 sys_class 班级库；
- 学号：11 位纯数字 + 后端年份区间校验（以后端服务器系统时间为准）；
  完整班级字符串由后端拼接 {入学年份后两位}{专业}{班号后缀} 写入 class 字段，
  前端仅做只读预览，不可直接编辑完整班级文本。
"""
from datetime import datetime, timezone
import hashlib
import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.background_tasks import launch
from app.core.config import get_settings
from app.core.kv import get_kv
from app.core.mailer import send_email
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.rate_limit import rate_limit
from app.core.security import require_role, Role
from app.core.user_message import push_user_message
from app.db.models import ClubApplyRecord, ClubDepartment, SysCollege, SysMajor, User
from app.db.session import get_db
from app.schemas.club_apply import (
    ClubApplyGuestSubmit,
    ClubApplyOut,
    ClubApplyPublicSendCodeRequest,
    ClubApplyReviewRequest,
    ClubApplySubmit,
    ClubDepartmentIn,
    ClubDepartmentUpdate,
    MyClubApplyOut,
)
from app.schemas.common import SubmitReceiptOut
from app.utils.receipt import unique_receipt_code
from app.api.school_verify import validate_student_id_year

logger = logging.getLogger("gdueca")
settings = get_settings()

router = APIRouter(prefix="/api/club-apply", tags=["club-apply"])
admin_router = APIRouter(prefix="/api/admin/club-apply", tags=["club-apply-admin"])

_apply_limit = rate_limit("club_apply.submit", limit=10, window_seconds=600)
_guest_apply_limit = rate_limit("club_apply.guest_submit", limit=5, window_seconds=600)


def _reject_break_glass(user: dict) -> None:
    if user.get("break_glass"):
        raise HTTPException(status_code=403, detail="Break-Glass 会话不支持此操作")


def _apply_dict(r: ClubApplyRecord) -> dict:
    """ORM → Out dict（class 为 SQL 保留字，ORM 属性为 class_）。"""
    return {
        "id": r.id,
        "user_id": r.user_id,
        "real_name": r.real_name,
        "phone": r.phone,
        "email": r.email,
        "applicant_type": r.applicant_type,
        "student_id": r.student_id,
        "college_id": r.college_id,
        "major_id": r.major_id,
        "enroll_year": r.enroll_year,
        "class_suffix": r.class_suffix,
        "college": r.college,
        "major": r.major,
        "class_name": r.class_,
        "departments": r.departments or [],
        "intro": r.intro,
        "status": r.status,
        "admin_note": r.admin_note,
        "created_at": r.created_at,
        "reviewed_at": r.reviewed_at,
        "username": getattr(r, "username", None),
        "display_name": getattr(r, "display_name", None),
    }


async def _fill_users(db: AsyncSession, rows: list[ClubApplyRecord]) -> None:
    if not rows:
        return
    users = {u.id: u for u in (await db.execute(
        select(User).where(User.id.in_({r.user_id for r in rows if r.user_id is not None}))
    )).scalars().all()}
    for r in rows:
        u = users.get(r.user_id)
        r.username = u.username if u else None
        r.display_name = (u.display_name or u.username) if u else None


async def _fill_school_fields(
    db: AsyncSession, row: ClubApplyRecord, req: ClubApplySubmit
) -> None:
    """学院/专业/学号校验 + 报表文本字段拼接（登录版与访客免注册版共用）。"""
    # 本校在读学生：学院/专业/入学年份/学号必填，宽松校验（不查 sys_class）
    college = await db.get(SysCollege, req.college_id)
    if not college or college.is_disabled:
        raise HTTPException(status_code=400, detail="所选学院不存在或已停用")
    major = await db.get(SysMajor, req.major_id)
    if not major or major.is_disabled or major.college_id != req.college_id:
        raise HTTPException(status_code=400, detail="所选专业不存在、已停用或不属于该学院")
    # 学号年份区间校验（后端服务器时间；不解析学院/专业，不覆盖 enroll_year）
    validate_student_id_year(req.student_id)

    row.student_id = req.student_id
    row.college_id = req.college_id
    row.major_id = req.major_id
    row.enroll_year = req.enroll_year
    row.class_suffix = req.class_suffix
    # 报表文本字段
    row.college = college.college_name
    row.major = major.major_name
    # 完整班级由后端拼接：{入学年份后两位}{专业}{班号后缀}（用户不可直接编辑）
    row.class_ = f"{req.enroll_year % 100:02d}{major.major_name}{req.class_suffix or ''}"


# ============================================================
# 用户端
# ============================================================
@router.get("/mine", response_model=list[MyClubApplyOut])
async def list_my_applications(
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """当前用户自己的报名记录（含历史）。"""
    _reject_break_glass(user)
    rows = (await db.execute(
        select(ClubApplyRecord)
        .where(ClubApplyRecord.user_id == int(user["user_id"]))
        .order_by(ClubApplyRecord.created_at.desc(), ClubApplyRecord.id.desc())
    )).scalars().all()
    return [
        MyClubApplyOut(
            receipt_code=r.receipt_code,
            status=r.status,
            departments=r.departments or [],
            college=r.college,
            major=r.major,
            class_name=r.class_,
            reject_reason=r.admin_note if r.status == "reject" else None,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at,
        )
        for r in rows
    ]


@router.post("", response_model=SubmitReceiptOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(_apply_limit)])
async def submit_club_apply(
    req: ClubApplySubmit,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """提交社团报名（pending；审核中禁止重复提交）。

    成功仅返回回执码与提交时间（与活动报名 / Bug 反馈一致）：内部主键 / user_id /
    审核字段 / 回显个人信息一律不外泄；凭回执码可在 /api/query/{code} 查进度。
    """
    _reject_break_glass(user)
    uid = int(user["user_id"])
    u = await db.get(User, uid)
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")

    pending = (await db.execute(
        select(func.count()).select_from(ClubApplyRecord).where(
            ClubApplyRecord.user_id == uid,
            ClubApplyRecord.status == "pending",
        )
    )).scalar_one()
    if pending:
        raise HTTPException(status_code=409, detail="已有报名正在审核中，请等待审核结果后再提交")

    row = ClubApplyRecord(
        receipt_code=await unique_receipt_code(db),
        user_id=uid,
        real_name=req.real_name,
        phone=req.phone,
        email=req.email,
        applicant_type="school",
        departments=req.departments,
        intro=req.intro,
        status="pending",
    )
    await _fill_school_fields(db, row, req)

    db.add(row)
    await db.flush()
    log_action(db, user, "club_apply.submit",
               detail=f"application:{row.id} type:{req.applicant_type}",
               ip=get_client_ip(request),
               target=f"user:{uid}")
    await db.commit()
    return SubmitReceiptOut(receipt_code=row.receipt_code, submitted_at=row.created_at)


# ============================================================
# 访客免注册报名（V0.5.9 需求5：邮箱验证码 + user_id=NULL）
# ============================================================
def _guest_email_hash(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()


async def _consume_guest_code(email: str, code: str) -> None:
    """核销访客报名邮箱验证码（一次性）：错误/过期/尝试超限统一 400 模糊提示。"""
    ehash = _guest_email_hash(email)
    kv = get_kv()
    code_key = f"clubapply:code:{ehash}"
    att_key = f"clubapply:att:{ehash}"
    raw = await kv.get(code_key)
    if not raw:
        raise HTTPException(status_code=400, detail="验证码无效或已过期")
    attempts = await kv.incrby(att_key, 1)
    if attempts > settings.EMAIL_CODE_MAX_ATTEMPTS:
        await kv.delete(code_key, att_key)
        raise HTTPException(status_code=400, detail="验证码无效或已过期")
    if raw != hashlib.sha256(code.encode()).hexdigest():
        raise HTTPException(status_code=400, detail="验证码无效或已过期")
    await kv.delete(code_key, att_key, f"clubapply:sent:{ehash}")


@router.get("/departments")
async def list_public_departments(
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """报名意向部门选项（V0.6.0 Issue6 动态化）：仅返回启用项，按 sort_order 排序。

    报名表单从本接口加载选项；失败时前端回落内置列表兜底。
    """
    rows = (await db.execute(
        select(ClubDepartment)
        .where(ClubDepartment.enabled.is_(True))
        .order_by(ClubDepartment.sort_order.asc(), ClubDepartment.id.asc())
    )).scalars().all()
    return {"departments": [_dept_out(d) for d in rows]}


def _dept_out(d: ClubDepartment) -> dict:
    return {
        "id": d.id,
        "name_zh": d.name_zh,
        "name_en": d.name_en,
        "enabled": d.enabled,
        "sort_order": d.sort_order,
    }


@router.post("/public/send-code")
async def public_send_code(req: ClubApplyPublicSendCodeRequest, request: Request):
    """访客报名第一步：向报名邮箱发送 6 位验证码。

    V0.6.0（Issue5）：同步投递并等待结果，发送失败明确返回 ok:false；
    冷却键与验证码仅在发送成功后写入，失败不锁重发。
    限流：同一 IP 1 分钟 ≤3 次（KV clubapply:ip:{ip}，首次创建挂 60s 过期）；
    同邮箱 60 秒冷却（clubapply:sent:{sha256(email)}）。
    冷却 / 限流 / 邮箱非法均返回 ok:false（HTTP 200），不抛 HTTP 异常。
    """
    client_ip = get_client_ip(request) or "unknown"
    email = req.email.strip()
    kv = get_kv()

    # 同一 IP 1 分钟最多 3 次
    ip_key = f"clubapply:ip:{client_ip}"
    ip_hits = await kv.incrby(ip_key, 1)
    if ip_hits == 1:
        await kv.expire(ip_key, 60)
    if ip_hits > 3:
        return {"ok": False, "message": "请求过于频繁，请稍后再试"}

    # 裸 str 入参，非法邮箱在此统一 ok:false（不抛 422）
    if len(email) > 128 or "@" not in email:
        return {"ok": False, "message": "请输入有效的邮箱地址"}

    ehash = _guest_email_hash(email)
    sent_key = f"clubapply:sent:{ehash}"
    code_key = f"clubapply:code:{ehash}"
    att_key = f"clubapply:att:{ehash}"
    # 同一邮箱 60 秒最多 1 次：冷却未到明确 ok:false
    if await kv.exists(sent_key):
        return {"ok": False, "message": "验证码发送间隔未到，请稍后再试"}

    code = f"{secrets.randbelow(1000000):06d}"
    body = (
        "您正在报名加入 GDUE-CA 社团。\n\n"
        f"验证码：{code}\n"
        f"{max(settings.EMAIL_CODE_TTL_SECONDS // 60, 1)} 分钟内有效，"
        "请勿泄露给他人。若非本人操作，请忽略本邮件。\n"
    )

    # 同步投递并等待结果（mailer 内部已捕获全部异常，失败仅返回 False）
    sent = await send_email(email, "GDUE-CA 社团报名验证码", body)
    if not sent:
        logger.warning("社团报名验证码发送失败（SMTP未配置或投递失败）邮箱=%s", email)
        return {"ok": False, "message": "邮件发送失败，请稍后重试"}

    # 发送成功才写冷却与验证码：失败不锁重发
    await kv.set(sent_key, "1", ttl_seconds=settings.EMAIL_CODE_RESEND_INTERVAL_SECONDS)
    await kv.setex(code_key, settings.EMAIL_CODE_TTL_SECONDS,
                   hashlib.sha256(code.encode()).hexdigest())
    await kv.setex(att_key, settings.EMAIL_CODE_TTL_SECONDS, "0")
    return {"ok": True, "message": "验证码已发送，请查收"}


@router.post("/public/submit", response_model=SubmitReceiptOut,
             status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(_guest_apply_limit)])
async def public_submit_club_apply(
    req: ClubApplyGuestSubmit,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """访客免注册社团报名（邮箱验证码一次性核销；同邮箱 pending 去重）。

    成功仅返回回执码与提交时间（与登录版一致）；记录 user_id=NULL。
    """
    email = str(req.email).strip()
    # 核销一次性邮箱验证码（错误/过期/尝试超限统一 400 模糊提示）
    await _consume_guest_code(email, req.code)

    pending = (await db.execute(
        select(func.count()).select_from(ClubApplyRecord).where(
            func.lower(ClubApplyRecord.email) == email.lower(),
            ClubApplyRecord.status == "pending",
        )
    )).scalar_one()
    if pending:
        raise HTTPException(status_code=409, detail="已有报名正在审核中，请等待审核结果后再提交")

    row = ClubApplyRecord(
        receipt_code=await unique_receipt_code(db),
        user_id=None,
        real_name=req.real_name,
        phone=req.phone,
        email=email,
        applicant_type="school",
        departments=req.departments,
        intro=req.intro,
        status="pending",
    )
    await _fill_school_fields(db, row, req)

    db.add(row)
    await db.flush()
    log_action(db, None, "club_apply.submit_guest",
               detail=f"application:{row.id} type:school guest",
               ip=get_client_ip(request),
               target=None)
    await db.commit()
    return SubmitReceiptOut(receipt_code=row.receipt_code, submitted_at=row.created_at)


# ============================================================
# 管理端
# ============================================================
@admin_router.get("/list", response_model=dict)
async def admin_list_applies(
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    user: dict = Depends(require_permission("recruitment", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """社团报名审核队列。"""
    stmt = select(ClubApplyRecord)
    if status_filter in ("pending", "accept", "reject"):
        stmt = stmt.where(ClubApplyRecord.status == status_filter)
    if q:
        like = f"%{q}%"
        uids = (await db.execute(
            select(User.id).where(
                (User.username.like(like)) | (User.display_name.like(like))
            )
        )).scalars().all()
        from sqlalchemy import or_
        stmt = stmt.where(or_(
            ClubApplyRecord.user_id.in_(uids),
            ClubApplyRecord.real_name.like(like),
            ClubApplyRecord.student_id.like(like),
            ClubApplyRecord.phone.like(like),
            ClubApplyRecord.college.like(like),
            ClubApplyRecord.major.like(like),
        ))
    total = (await db.execute(
        select(func.count()).select_from(stmt.subquery())
    )).scalar_one()
    rows = (await db.execute(
        stmt.order_by(ClubApplyRecord.created_at.desc(), ClubApplyRecord.id.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    await _fill_users(db, rows)
    return {"total": total, "items": [ClubApplyOut.model_validate(_apply_dict(r)) for r in rows]}


@admin_router.post("/{apply_id}/review", response_model=ClubApplyOut)
async def review_club_apply(
    apply_id: int,
    req: ClubApplyReviewRequest,
    request: Request,
    user: dict = Depends(require_permission("recruitment", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """接纳 / 拒绝报名（备注必填于拒绝时）；处理完成发送站内信通知申请人。

    注意：审核动作不会改动用户的学校身份字段（与学校验证流程完全隔离）。
    """
    row = await db.get(ClubApplyRecord, apply_id)
    if not row:
        raise HTTPException(status_code=404, detail="报名记录不存在")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="该报名已处理，不能重复审核")
    if req.action == "reject" and not (req.admin_note or "").strip():
        raise HTTPException(status_code=400, detail="拒绝时必须填写备注")

    row.status = req.action
    row.admin_note = req.admin_note
    row.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    row.reviewed_by = int(user["user_id"])

    now_str = row.reviewed_at.strftime("%Y-%m-%d %H:%M")
    # 站内信仅对有账号的报名（user_id 非空）；访客报名走邮件通知
    if row.user_id is not None:
        if req.action == "accept":
            await push_user_message(
                db, row.user_id,
                title="社团报名已通过",
                content=f"恭喜！你提交的社团报名已审核通过，欢迎加入。审核时间：{now_str}。",
                link="/join",
                kind="club_apply",
            )
        else:
            note = req.admin_note.strip()
            await push_user_message(
                db, row.user_id,
                title="社团报名未能通过",
                content=f"你提交的社团报名未通过审核。备注：{note}。欢迎调整后再次报名。",
                link="/join",
                kind="club_apply",
            )
    log_action(db, user, f"club_apply.{req.action}",
               detail=f"application:{apply_id} user:{row.user_id} note:{req.admin_note or ''}",
               ip=get_client_ip(request),
               target=f"user:{row.user_id}" if row.user_id is not None else None)
    await db.commit()
    # V0.5.9 需求5：审核完成（commit 之后）异步邮件通知申请人邮箱（不阻塞审核响应）
    if row.email:
        _launch_review_email(
            to=row.email, real_name=row.real_name, action=req.action,
            admin_note=req.admin_note, reviewed_at=now_str,
        )
    await db.refresh(row)
    await _fill_users(db, [row])
    return ClubApplyOut.model_validate(_apply_dict(row))


def _launch_review_email(
    *, to: str, real_name: str, action: str,
    admin_note: str | None, reviewed_at: str,
) -> None:
    """后台异步发送报名审核结果邮件（accept 告知通过 + 审核时间；reject 附拒绝理由）。"""
    if action == "accept":
        subject = "GDUE-CA 社团报名审核通过"
        body = (
            f"您好，{real_name}：\n\n"
            "恭喜！你提交的 GDUE-CA 社团报名已审核通过，欢迎加入。\n"
            f"审核时间：{reviewed_at}。\n"
        )
    else:
        subject = "GDUE-CA 社团报名审核结果通知"
        body = (
            f"您好，{real_name}：\n\n"
            "你提交的 GDUE-CA 社团报名未通过审核。\n"
            f"拒绝理由：{(admin_note or '').strip()}\n"
            "欢迎调整后再次报名。\n"
        )

    async def _notify() -> None:
        sent = await send_email(to, subject, body)
        if not sent:
            logger.warning("社团报名审核结果邮件未成功投递（仅限开发环境排查）邮箱=%s", to)

    launch(_notify())


@admin_router.get("/export")
async def admin_export_applies(
    format: str = Query(default="csv", pattern="^(csv|xlsx)$"),
    status_filter: str | None = Query(default=None, alias="status"),
    user: dict = Depends(require_permission("recruitment", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """报名数据导出（文本字段冗余存储即为本用途）。"""
    stmt = select(ClubApplyRecord)
    if status_filter in ("pending", "accept", "reject"):
        stmt = stmt.where(ClubApplyRecord.status == status_filter)
    rows = (await db.execute(
        stmt.order_by(ClubApplyRecord.created_at.desc())
    )).scalars().all()
    log_action(db, user, f"club_apply.export_{format}",
               detail=f"rows:{len(rows)}", ip=None, target=None)

    headers = [
        ("ID", "id"),
        ("账号", "username"),
        ("姓名", "real_name"),
        ("手机号", "phone"),
        ("邮箱", "email"),
        ("报名身份", "applicant_type"),
        ("学号", "student_id"),
        ("学院", "college"),
        ("专业", "major"),
        ("入学年份", "enroll_year"),
        ("班级", "class_"),
        ("意向部门", "departments"),
        ("自我介绍", "intro"),
        ("状态", "status"),
        ("管理员备注", "admin_note"),
        ("提交时间", "created_at"),
        ("审核时间", "reviewed_at"),
    ]
    from app.utils.export import to_csv, to_xlsx
    if format == "xlsx":
        data = to_xlsx(rows, headers, text_columns={"student_id", "phone"},
                       sheet_title="社团报名记录")
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="club_apply_records.xlsx"'},
        )
    data = to_csv(rows, headers,
                  free_text_keys={"real_name", "college", "major", "intro", "email", "admin_note"})
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="club_apply_records.csv"'},
    )


# ---------- V0.6.0 Issue6：意向部门选项后台管理 ----------
@admin_router.get("/departments")
async def admin_list_departments(
    user: dict = Depends(require_permission("recruitment", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """选项全量列表（含停用），按 sort_order + id 排序。"""
    rows = (await db.execute(
        select(ClubDepartment)
        .order_by(ClubDepartment.sort_order.asc(), ClubDepartment.id.asc())
    )).scalars().all()
    return {"departments": [_dept_out(d) for d in rows]}


@admin_router.post("/departments", status_code=status.HTTP_201_CREATED)
async def admin_create_department(
    req: ClubDepartmentIn,
    request: Request,
    user: dict = Depends(require_permission("recruitment", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """新增意向部门选项。"""
    d = ClubDepartment(
        name_zh=req.name_zh, name_en=req.name_en,
        enabled=req.enabled, sort_order=req.sort_order,
    )
    db.add(d)
    await db.flush()
    log_action(db, user, "club_department.create",
               detail=f"dept:{d.id} zh:{d.name_zh}", ip=get_client_ip(request))
    await db.commit()
    return _dept_out(d)


@admin_router.put("/departments/{dept_id}")
async def admin_update_department(
    dept_id: int,
    req: ClubDepartmentUpdate,
    request: Request,
    user: dict = Depends(require_permission("recruitment", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """编辑意向部门选项（历史报名存文本快照，改名不影响老记录）。"""
    d = await db.get(ClubDepartment, dept_id)
    if not d:
        raise HTTPException(status_code=404, detail="部门选项不存在")
    if req.name_zh is not None:
        d.name_zh = req.name_zh
    if req.name_en is not None:
        d.name_en = req.name_en
    if req.enabled is not None:
        d.enabled = req.enabled
    if req.sort_order is not None:
        d.sort_order = req.sort_order
    await db.flush()
    log_action(db, user, "club_department.update",
               detail=f"dept:{d.id} zh:{d.name_zh} enabled:{d.enabled}",
               ip=get_client_ip(request))
    await db.commit()
    return _dept_out(d)


@admin_router.delete("/departments/{dept_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_department(
    dept_id: int,
    request: Request,
    user: dict = Depends(require_permission("recruitment", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """删除意向部门选项（历史报名存文本快照，删除不影响老记录）。"""
    d = await db.get(ClubDepartment, dept_id)
    if not d:
        raise HTTPException(status_code=404, detail="部门选项不存在")
    await db.delete(d)
    log_action(db, user, "club_department.delete",
               detail=f"dept:{dept_id} zh:{d.name_zh}", ip=get_client_ip(request))
    await db.commit()
