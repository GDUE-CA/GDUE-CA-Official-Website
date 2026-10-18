"""报名表单：访客提交（活动/社团 两种）+ 管理员审阅 / 导出。"""
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.rate_limit import rate_limit
from app.db.models import Activity, ActivityStatus, AuditLog, Registration, RegistrationSource, RegistrationType
from app.db.session import get_db
from app.schemas.common import SubmitReceiptOut, clean_multiline_text
from app.schemas.register import (
    ManualRegistrationCreate,
    RegistrationCreate,
    RegistrationOut,
    RegistrationStatus,
    RegistrationType as RegistrationTypeSchema,
)
from app.utils.export import registrations_to_csv, registrations_to_xlsx
from app.utils.receipt import unique_receipt_code
from app.utils.translator import detect_lang

router = APIRouter(prefix="/api/registrations", tags=["registrations"])


def _log(db: AsyncSession, ctx_or_uid, action: str, target: str | None, ip: str | None):
    """统一审计写入：ctx_or_uid 支持 ctx dict（自动区分 Break-Glass）/ int / None。"""
    log_action(db, ctx_or_uid, action, target=target, ip=ip)


# ---------- 活动报名（公开，按活动） ----------
# 公开表单按 IP 限流，防止批量灌水
_submit_limit = rate_limit("registration.submit", limit=10, window_seconds=600)


@router.post(
    "/for/{activity_id}",
    response_model=SubmitReceiptOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_submit_limit)],
)
async def submit_for_activity(
    activity_id: int,
    req: RegistrationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")

    # 状态检查（魔术字符串已枚举化；时间比较统一 naive UTC，与 DateTime 列存储一致）
    if activity.status not in (ActivityStatus.PUBLISHED, ActivityStatus.REGISTRATION_OPEN):
        raise HTTPException(status_code=400, detail="活动当前不接受报名")
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    if activity.register_start and now_naive < activity.register_start:
        raise HTTPException(status_code=400, detail="报名尚未开始")
    if activity.register_end and now_naive > activity.register_end:
        raise HTTPException(status_code=400, detail="报名已截止")

    # 人数上限
    if activity.max_participants > 0:
        count = await db.execute(
            select(func.count()).select_from(Registration).where(
                Registration.activity_id == activity_id,
                Registration.status.in_(["pending", "approved", "checked_in"]),
            )
        )
        if count.scalar() >= activity.max_participants:
            raise HTTPException(status_code=400, detail="报名人数已满")

    reg = Registration(
        registration_type=RegistrationType.ACTIVITY,
        activity_id=activity_id,
        receipt_code=await unique_receipt_code(db),
        content_lang=detect_lang(req.introduction or f"{req.college}{req.major}{req.name}"),
        submit_ip=get_client_ip(request),
        **req.model_dump(),
    )
    db.add(reg)
    await db.flush()
    _log(db, None, "registration.activity.submit", f"activity:{activity_id}",
         reg.submit_ip)
    return SubmitReceiptOut(receipt_code=reg.receipt_code, submitted_at=reg.submitted_at)


# ---------- 管理员：列表 + 筛选 ----------
@router.get("", response_model=list[RegistrationOut])
async def list_registrations(
    activity_id: int | None = Query(default=None),
    status_filter: RegistrationStatus | None = Query(default=None, alias="status"),
    type_filter: RegistrationTypeSchema | None = Query(default=None, alias="registration_type"),
    keyword: str | None = None,
    page: int = 1,
    per_page: int = 50,
    user: dict = Depends(require_permission("review.registrations", "view")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Registration)
    if activity_id:
        stmt = stmt.where(Registration.activity_id == activity_id)
    if type_filter:
        stmt = stmt.where(Registration.registration_type == type_filter)
    if status_filter:
        stmt = stmt.where(Registration.status == status_filter)
    if keyword:
        kw = f"%{keyword}%"
        from sqlalchemy import or_ as sa_or
        stmt = stmt.where(
            sa_or(
                Registration.name.like(kw),
                Registration.student_id.like(kw),
                Registration.phone_number.like(kw),
            )
        )
    stmt = stmt.order_by(Registration.submitted_at.desc())
    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    return result.scalars().all()


# ---------- 管理员：批量审核（只支持 通过 / 拒绝，已签到记录自动跳过） ----------
class RegistrationBatchUpdate(BaseModel):
    ids: list[int]
    status: RegistrationStatus  # 仅 approved / rejected


@router.post("/batch")
async def batch_update_registrations(
    body: RegistrationBatchUpdate,
    request: Request = Request,
    user: dict = Depends(require_permission("review.registrations", "manage")),
    db: AsyncSession = Depends(get_db),
):
    if not body.ids:
        raise HTTPException(status_code=400, detail="未选择任何记录")
    if body.status not in (RegistrationStatus.APPROVED, RegistrationStatus.REJECTED):
        raise HTTPException(
            status_code=400,
            detail="批量审核仅支持 通过/拒绝；签到状态由报名者凭回执码签到产生",
        )
    result = await db.execute(
        select(Registration).where(Registration.id.in_(body.ids))
    )
    regs = result.scalars().all()
    updated = 0
    skipped: list[int] = []
    for reg in regs:
        if reg.status == RegistrationStatus.CHECKED_IN:
            skipped.append(reg.id)  # 已签到的记录不允许改动审核结果
            continue
        reg.status = body.status
        updated += 1
    _log(db, user, f"registration.batch_{body.status.value}",
         ",".join(str(i) for i in body.ids), get_client_ip(request))
    return {"updated": updated, "skipped": skipped}


# ---------- 管理员：单条更新状态（仅 通过 / 拒绝，签到由回执码公开签到产生） ----------
@router.patch("/{reg_id}", response_model=RegistrationOut)
async def update_registration_status(
    reg_id: int,
    status: RegistrationStatus | None = Query(default=None),
    remark: str | None = Query(default=None, max_length=1000),
    request: Request = Request,
    user: dict = Depends(require_permission("review.registrations", "manage")),
    db: AsyncSession = Depends(get_db),
):
    reg = await db.get(Registration, reg_id)
    if not reg:
        raise HTTPException(status_code=404, detail="报名记录不存在")
    if status is not None:
        if status not in (RegistrationStatus.APPROVED, RegistrationStatus.REJECTED):
            raise HTTPException(
                status_code=400,
                detail="审核仅支持 通过/拒绝；签到状态由报名者凭回执码签到产生",
            )
        reg.status = status
    if remark is not None:
        reg.remark = clean_multiline_text(remark)
    _log(db, user, "registration.update", f"reg:{reg_id}",
         get_client_ip(request))
    return reg


# ---------- 管理员：导出（活动报名） ----------
@router.get("/export")
async def export_registrations(
    activity_id: int | None = Query(default=None),
    registration_type: RegistrationTypeSchema | None = Query(default=None),
    fmt: Literal["csv", "xlsx"] = "xlsx",
    request: Request = Request,
    user: dict = Depends(require_permission("review.registrations", "manage")),
    db: AsyncSession = Depends(get_db),
):
    # 必须指定 activity_id 或 registration_type=club
    if activity_id:
        activity = await db.get(Activity, activity_id)
        if not activity:
            raise HTTPException(status_code=404, detail="活动不存在")
        stmt = select(Registration).where(Registration.activity_id == activity_id)
        filename = f"registrations-activity-{activity_id}"
    elif registration_type == RegistrationTypeSchema.CLUB:
        stmt = select(Registration).where(Registration.registration_type == RegistrationType.CLUB)
        filename = "registrations-club"
    else:
        raise HTTPException(status_code=400, detail="请指定 activity_id 或 registration_type=club")

    result = await db.execute(stmt)
    rows = result.scalars().all()
    # 个人信息批量导出属于敏感操作，记录审计日志（GB/T 35274）
    _log(db, user, f"registration.export_{fmt}",
         f"{filename} rows:{len(rows)}", get_client_ip(request))

    if fmt == "csv":
        csv_bytes = registrations_to_csv(rows)
        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            iter([csv_bytes]),
            media_type="text/csv; charset=utf-8-sig",
            headers={"Content-Disposition": f"attachment; filename={filename}.csv"},
        )
    else:
        xlsx_bytes = registrations_to_xlsx(rows)
        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            iter([xlsx_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}.xlsx"},
        )


# ---------- 管理员：手动补录报名（线下报名 / 截止后人工增补） ----------
@router.post(
    "/admin/manual",
    response_model=RegistrationOut,
    status_code=status.HTTP_201_CREATED,
)
async def manual_create_registration(
    req: ManualRegistrationCreate,
    request: Request,
    user: dict = Depends(require_permission("review.registrations", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """管理员手动新增报名名单：不校验报名时间窗与人数上限，status 默认 approved。

    submit_ip 记录操作管理员的 IP（区别于表单提交的报名者 IP），补录原因写入 remark。
    """
    activity_id = None
    if req.registration_type == RegistrationTypeSchema.ACTIVITY:
        activity = await db.get(Activity, req.activity_id)
        if not activity:
            raise HTTPException(status_code=404, detail="活动不存在")
        activity_id = activity.id

    reg = Registration(
        registration_type=RegistrationType(req.registration_type.value),
        activity_id=activity_id,
        receipt_code=await unique_receipt_code(db),
        content_lang=detect_lang(req.introduction or f"{req.college}{req.major}{req.name}"),
        submit_ip=get_client_ip(request),
        source=RegistrationSource.MANUAL,
        status=req.status,
        remark=clean_multiline_text(req.remark) if req.remark else None,
        name=req.name,
        student_id=req.student_id,
        college=req.college,
        major=req.major,
        phone_cc=req.phone_cc,
        phone_number=req.phone_number,
        email=req.email,
        position=req.position,
        introduction=req.introduction,
    )
    db.add(reg)
    await db.flush()
    _log(db, user, "registration.manual",
         f"reg:{reg.id} activity:{activity_id}", get_client_ip(request))
    return reg
