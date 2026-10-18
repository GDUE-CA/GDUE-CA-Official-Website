"""学校身份人工验证 API（Module D-1）。

- 用户：提交申请（四态流转：未提交/审核中/已通过/已驳回）；审核中禁止重复提交；
  驳回可重新提交；表单下拉全部来自 /api/sys/* 公开接口，后端严格校验整套
  学院→年级→专业→班级组合必须存在且 is_disabled=0。
- 管理员：审核队列；通过 → 开启 identity_school_verified 并写入学校外键；
  驳回 → 不修改用户主表；两者均发送站内信 + 审计。
- 学号校验以后端服务器系统时间为准（11 位数字 + 入学年份区间 server_year-8 ~ server_year）。
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.security import require_role, Role
from app.core.user_message import push_user_message
from app.db.models import (
    SysClass,
    SysCollege,
    SysGrade,
    SysMajor,
    User,
    UserSchoolVerifyApplication,
)
from app.db.session import get_db
from app.schemas.school_verify import (
    SchoolVerifyAdminOut,
    MySchoolVerifyOut,
    SchoolVerifyApplicationOut,
    SchoolVerifyReviewRequest,
    SchoolVerifyStatusOut,
    SchoolVerifySubmit,
)
from app.utils.crud import paginate

router = APIRouter(prefix="/api/setting/school-verify", tags=["school-verify"])
admin_router = APIRouter(prefix="/api/admin/school-verify", tags=["school-verify-admin"])

# 学号入学年份允许区间：[server_year - 8, server_year]
STUDENT_ID_YEAR_BACKTRACK = 8


def _reject_break_glass(user: dict) -> None:
    """Break-Glass 会话无业务身份，禁止用户端业务操作。"""
    if user.get("break_glass"):
        raise HTTPException(status_code=403, detail="Break-Glass 会话不支持此操作")


def _server_year() -> int:
    """以后端服务器系统时间为准（禁止使用浏览器客户端时间）。"""
    return datetime.now(timezone.utc).year


def validate_student_id_year(student_id: str) -> None:
    """普通用户表单提交的学号年份合理性校验（11 位格式由 schema 校验）。"""
    prefix_year = 2000 + int(student_id[:2])
    server_year = _server_year()
    lower, upper = server_year - STUDENT_ID_YEAR_BACKTRACK, server_year
    if prefix_year < lower or prefix_year > upper:
        raise HTTPException(
            status_code=400,
            detail=f"学号开头年份不在允许范围（{lower}-{upper}），如确属特殊情况，请联系管理员人工录入",
        )


async def _validate_combo(
    db: AsyncSession,
    college_id: int,
    major_id: int,
    grade_id: int,
    class_id: int,
) -> tuple[SysCollege, SysMajor, SysGrade, SysClass]:
    """学校身份验证表单严格校验：整套组合必须数据库内存在且 is_disabled=0，且层级一致。"""
    college = await db.get(SysCollege, college_id)
    if not college or college.is_disabled:
        raise HTTPException(status_code=400, detail="所选学院不存在或已停用")
    major = await db.get(SysMajor, major_id)
    if not major or major.is_disabled or major.college_id != college_id:
        raise HTTPException(status_code=400, detail="所选专业不存在、已停用或不属于该学院")
    grade = await db.get(SysGrade, grade_id)
    if not grade or grade.is_disabled:
        raise HTTPException(status_code=400, detail="所选年级不存在或已停用")
    cls = await db.get(SysClass, class_id)
    if (not cls or cls.is_disabled or cls.college_id != college_id
            or cls.grade_id != grade_id or cls.major_id != major_id):
        raise HTTPException(status_code=400, detail="所选班级不存在、已停用或与学院/年级/专业不匹配")
    return college, major, grade, cls


async def _fill_names(db: AsyncSession, rows: list[UserSchoolVerifyApplication]) -> None:
    """联表填充学院/专业/年级/班级展示文本与申请人信息。"""
    if not rows:
        return
    uids = {r.user_id for r in rows}
    users = {u.id: u for u in (await db.execute(
        select(User).where(User.id.in_(uids))
    )).scalars().all()}
    cids = {r.college_id for r in rows}
    mids = {r.major_id for r in rows}
    gids = {r.grade_id for r in rows}
    clids = {r.class_id for r in rows}
    colleges = {c.id: c for c in (await db.execute(
        select(SysCollege).where(SysCollege.id.in_(cids))
    )).scalars().all()} if cids else {}
    majors = {m.id: m for m in (await db.execute(
        select(SysMajor).where(SysMajor.id.in_(mids))
    )).scalars().all()} if mids else {}
    grades = {g.id: g for g in (await db.execute(
        select(SysGrade).where(SysGrade.id.in_(gids))
    )).scalars().all()} if gids else {}
    classes = {c.id: c for c in (await db.execute(
        select(SysClass).where(SysClass.id.in_(clids))
    )).scalars().all()} if clids else {}
    for r in rows:
        u = users.get(r.user_id)
        r.username = u.username if u else None
        r.display_name = (u.display_name or u.username) if u else None
        c = colleges.get(r.college_id)
        r.college_name = c.college_name if c else None
        m = majors.get(r.major_id)
        r.major_name = m.major_name if m else None
        g = grades.get(r.grade_id)
        r.grade_year = g.grade_year if g else None
        cl = classes.get(r.class_id)
        r.class_display_name = cl.display_name if cl else None


# ============================================================
# 用户端
# ============================================================
@router.get("", response_model=SchoolVerifyStatusOut)
async def get_my_school_verify(
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """当前用户学校验证状态：未提交 / 审核中 / 已通过 / 已驳回 + 全部申请历史。"""
    _reject_break_glass(user)
    u = await db.get(User, int(user["user_id"]))
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    rows = (await db.execute(
        select(UserSchoolVerifyApplication)
        .where(UserSchoolVerifyApplication.user_id == u.id)
        .order_by(UserSchoolVerifyApplication.created_at.desc(), UserSchoolVerifyApplication.id.desc())
    )).scalars().all()
    await _fill_names(db, rows)
    latest = rows[0] if rows else None
    if u.identity_school_verified:
        status = "approved"
    elif latest is None:
        status = "none"
    else:
        status = latest.status  # pending / rejected / approved
    return SchoolVerifyStatusOut(
        identity_school_verified=u.identity_school_verified,
        status=status,
        latest=latest,
        history=rows,
    )


@router.post("", response_model=MySchoolVerifyOut, status_code=201)
async def submit_school_verify(
    req: SchoolVerifySubmit,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """提交学校身份验证申请（审核中禁止重复提交；已通过无需再提交）。"""
    _reject_break_glass(user)
    u = await db.get(User, int(user["user_id"]))
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    if u.identity_school_verified:
        raise HTTPException(status_code=409, detail="学校身份已通过验证，无需重复提交")
    pending = (await db.execute(
        select(func.count()).select_from(UserSchoolVerifyApplication).where(
            UserSchoolVerifyApplication.user_id == u.id,
            UserSchoolVerifyApplication.status == "pending",
        )
    )).scalar_one()
    if pending:
        raise HTTPException(status_code=409, detail="已有申请正在审核中，请耐心等待审核结果")

    # 学号双重校验（11 位格式 schema 已验；此处验年份区间，后端服务器时间）
    validate_student_id_year(req.student_id)
    # 整套组合严格校验（学院→年级→专业→班级联动一致 + 全部启用）
    college, major, grade, cls = await _validate_combo(
        db, req.college_id, req.major_id, req.grade_id, req.class_id
    )

    app_row = UserSchoolVerifyApplication(
        user_id=u.id,
        student_id=req.student_id,
        college_id=req.college_id,
        major_id=req.major_id,
        grade_id=req.grade_id,
        class_id=req.class_id,
        remark=req.remark,
        attach_url=req.attach_url,
        status="pending",
    )
    db.add(app_row)
    await db.flush()
    app_row.college_name = college.college_name
    app_row.major_name = major.major_name
    app_row.grade_year = grade.grade_year
    app_row.class_display_name = cls.display_name
    log_action(db, user, "school_verify.submit",
               detail=f"application:{app_row.id}",
               ip=get_client_ip(request),
               target=f"user:{u.id}")
    await db.commit()
    return app_row


# ============================================================
# 管理端
# ============================================================
@admin_router.get("/list", response_model=dict)
async def admin_list_applications(
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(require_permission("review.school", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """学校验证审核队列（可按状态/关键词过滤）。"""
    stmt = select(UserSchoolVerifyApplication)
    if status_filter in ("pending", "approved", "rejected"):
        stmt = stmt.where(UserSchoolVerifyApplication.status == status_filter)
    if q:
        like = f"%{q}%"
        uids = (await db.execute(
            select(User.id).where(
                (User.username.like(like)) | (User.display_name.like(like))
                | (User.real_name.like(like)) | (User.student_id.like(like))
            )
        )).scalars().all()
        cond = UserSchoolVerifyApplication.user_id.in_(uids) | (
            UserSchoolVerifyApplication.student_id.like(like)
        )
        stmt = stmt.where(cond)
    total_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(total_stmt)).scalar_one()
    rows = (await db.execute(
        stmt.order_by(UserSchoolVerifyApplication.created_at.desc(),
                      UserSchoolVerifyApplication.id.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    await _fill_names(db, rows)
    return {"total": total, "items": [SchoolVerifyApplicationOut.model_validate(
        {**r.__dict__}) for r in rows]}


@admin_router.post("/{application_id}/review", response_model=SchoolVerifyAdminOut)
async def review_application(
    application_id: int,
    req: SchoolVerifyReviewRequest,
    request: Request,
    user: dict = Depends(require_permission("review.school", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """审核学校验证申请：通过开启 identity_school_verified 并写学校外键；驳回不改用户主表。"""
    app_row = await db.get(UserSchoolVerifyApplication, application_id)
    if not app_row:
        raise HTTPException(status_code=404, detail="申请不存在")
    if app_row.status != "pending":
        raise HTTPException(status_code=409, detail="该申请已处理，不能重复审核")
    if req.action == "rejected" and not (req.admin_remark or "").strip():
        raise HTTPException(status_code=400, detail="驳回时必须填写驳回备注")

    target = await db.get(User, app_row.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="申请所属用户不存在")

    app_row.status = req.action
    app_row.admin_remark = req.admin_remark
    app_row.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    app_row.reviewed_by = int(user["user_id"])

    now_str = app_row.reviewed_at.strftime("%Y-%m-%d %H:%M")
    if req.action == "approved":
        # 通过：开启学校身份并写入对应学校资料（学号/学院/专业/年级/班级）
        target.identity_school_verified = True
        target.student_id = app_row.student_id
        target.college_id = app_row.college_id
        target.major_id = app_row.major_id
        target.grade_id = app_row.grade_id
        target.class_id = app_row.class_id
        await push_user_message(
            db, target.id,
            title="学校身份验证已通过",
            content=f"你提交的学校身份验证申请已审核通过，学校资料已解锁编辑。审核时间：{now_str}。",
            link="/setting/profile",
            kind="school_verify",
        )
    else:
        # 驳回：不修改用户主表任何信息
        reason = req.admin_remark.strip()
        await push_user_message(
            db, target.id,
            title="学校身份验证已被驳回",
            content=f"你提交的学校身份验证申请已被驳回。驳回理由：{reason}。你可修改后重新提交。",
            link="/setting/profile",
            kind="school_verify",
        )
    log_action(db, user, f"school_verify.{req.action}",
               detail=f"application:{application_id} user:{target.id} remark:{req.admin_remark or ''}",
               ip=get_client_ip(request),
               target=f"user:{target.id}")
    await db.commit()
    await db.refresh(app_row)
    await _fill_names(db, [app_row])
    return SchoolVerifyAdminOut.model_validate({**app_row.__dict__})
