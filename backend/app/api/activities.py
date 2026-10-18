"""活动管理接口。"""
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.security import Role, get_optional_user, require_role, role_at_least
from app.db.models import (
    Activity,
    ActivityEnrol,
    ActivityStatistics,
    ActivityStatus,
    AuditLog,
    Registration,
    RegistrationStatus,
    RegistrationType,
)
from app.db.session import get_db
from app.schemas.activity import ActivityCreate, ActivityOut, ActivityUpdate
from app.schemas.activity_stats import ActivityStatisticsOut
from app.schemas.register import RegistrationOut
from app.utils.crud import paginate
from app.utils.export import to_csv, to_xlsx
from app.utils.translator import translate_obj_fields

router = APIRouter(prefix="/api/activities", tags=["activities"])
admin_router = APIRouter(prefix="/api/admin/activities", tags=["activities-admin"])


def _log(db: AsyncSession, ctx_or_uid, action: str, target: str | None, ip: str | None):
    """统一审计写入：ctx_or_uid 支持 ctx dict（自动区分 Break-Glass）/ int / None。"""
    log_action(db, ctx_or_uid, action, target=target, ip=ip)


# 访客 / 普通成员可见的活动状态（草稿、归档仅后台可见）
_PUBLIC_STATUSES = [ActivityStatus.PUBLISHED, ActivityStatus.REGISTRATION_OPEN, ActivityStatus.ENDED]


def _can_see_all(user: dict | None) -> bool:
    return bool(user) and role_at_least(Role.EDITOR, Role(user["role"]))


async def _enrol_counts(db: AsyncSession, activity_ids: list[int]) -> dict[int, int]:
    """批量统计活动的一键报名人数（activity_enrols，is_deleted=False）。"""
    if not activity_ids:
        return {}
    rows = await db.execute(
        select(ActivityEnrol.activity_id, func.count())
        .where(
            ActivityEnrol.activity_id.in_(activity_ids),
            ActivityEnrol.is_deleted.is_(False),
        )
        .group_by(ActivityEnrol.activity_id)
    )
    return {aid: cnt for aid, cnt in rows.all()}


# ---------- 实时业务状态（P0：后端计算，不存库） ----------
# 优先级：归档/草稿 > 已结束 > 进行中 > 预报名 > 报名中 > 即将进行 > 状态回退
def _runtime_status(a: Activity, now_naive: datetime) -> "RuntimeStatus | None":
    """按当前 UTC 时间实时计算业务状态（预报名/报名中/即将进行/进行中/已结束）。"""
    from app.schemas.activity import RuntimeStatus

    if a.status == ActivityStatus.ARCHIVED:
        return RuntimeStatus.ARCHIVED
    if a.status == ActivityStatus.DRAFT:
        return RuntimeStatus.DRAFT
    if a.end_at and now_naive > a.end_at:
        return RuntimeStatus.ENDED
    if a.start_at and now_naive >= a.start_at:
        return RuntimeStatus.ONGOING
    if a.register_start and now_naive < a.register_start:
        return RuntimeStatus.PRE_REGISTER
    if a.register_end and now_naive <= a.register_end:
        return RuntimeStatus.REGISTRATION_OPEN
    if a.start_at and now_naive < a.start_at:
        return RuntimeStatus.UPCOMING
    if a.register_start or a.register_end:
        return RuntimeStatus.REGISTRATION_OPEN
    # 关键时间缺失：按数据库状态回退
    return {
        ActivityStatus.PUBLISHED: RuntimeStatus.REGISTRATION_OPEN,
        ActivityStatus.REGISTRATION_OPEN: RuntimeStatus.REGISTRATION_OPEN,
        ActivityStatus.ENDED: RuntimeStatus.ENDED,
    }.get(a.status)


async def _user_enrolled(db: AsyncSession, user: dict | None, activity_ids: list[int]) -> set[int]:
    """当前登录用户在给定活动集合中已报名（is_deleted=False）的活动 id 集合。"""
    if not user or not activity_ids:
        return set()
    rows = await db.execute(
        select(ActivityEnrol.activity_id).where(
            ActivityEnrol.user_id == ctx_uid(user),
            ActivityEnrol.activity_id.in_(activity_ids),
            ActivityEnrol.is_deleted.is_(False),
        )
    )
    return {aid for aid, in rows.all()}


# ---------- 状态自动识别 ----------
# 1. 预报名：now < register_start
# 2. 报名中：register_start ≤ now ≤ register_end
# 3. 即将进行：register_end < now < start_at
# 4. 进行中：start_at ≤ now ≤ end_at
# 5. 已结束：now > end_at
def _compute_runtime_status(a: Activity, now_naive: datetime) -> ActivityStatus | None:
    """根据当前时间计算活动运行时状态。

    返回 None 表示无法自动识别（关键字段时间缺失），保留数据库原状态。
    """
    # 已归档活动不做自动调整
    if a.status == ActivityStatus.ARCHIVED:
        return None
    # 草稿不自动晋升为已发布
    if a.status == ActivityStatus.DRAFT:
        return None
    if not a.end_at:
        return None
    if now_naive > a.end_at:
        return ActivityStatus.ENDED
    if a.start_at and now_naive >= a.start_at:
        # 活动已开始
        return ActivityStatus.PUBLISHED  # 进行中归为 published（兼容现有枚举）
    if a.register_end and now_naive > a.register_end:
        return ActivityStatus.PUBLISHED  # 报名结束但活动未开始 → 仍属 published
    if a.register_start and now_naive < a.register_start:
        return ActivityStatus.PUBLISHED  # 预报名阶段
    if a.register_start and a.register_end and a.register_start <= now_naive <= a.register_end:
        return ActivityStatus.REGISTRATION_OPEN
    return None


async def _refresh_status(a: Activity, db: AsyncSession) -> bool:
    """根据当前时间刷新活动状态；若状态改变则更新数据库。返回是否更新。"""
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    new_status = _compute_runtime_status(a, now_naive)
    if new_status is not None and new_status != a.status:
        a.status = new_status
        a.updated_at = datetime.now(timezone.utc)
        return True
    return False


# ---------- 公开：获取已发布活动（管理员可查看全部） ----------
@router.get("", response_model=list[ActivityOut])
async def list_activities(
    status_filter: Literal["all", "published", "registration_open", "archive"] = "published",
    archived: Literal["exclude", "only", "all"] | None = Query(default=None),
    category: str | None = Query(default=None, max_length=64),
    lang: str | None = Query(default=None, max_length=16, description="显示语言；传入时标题/短描述自动翻译（缓存加速，失败回退原文）"),
    user: dict | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """archived 参数（P0 归档语义）：
    - exclude（默认）：过滤归档活动（普通前端活动列表）
    - only：仅归档活动（归档专区页面）
    - all：含归档，后台管理内部使用（非管理员回退公开态）
    软删除活动（内容回收站）在所有场景下均不返回。
    """
    stmt = select(Activity).where(Activity.is_deleted.is_(False))
    if archived == "only":
        stmt = stmt.where(Activity.status == ActivityStatus.ARCHIVED)
    elif archived == "all":
        if not _can_see_all(user):
            stmt = stmt.where(Activity.status.in_(_PUBLIC_STATUSES))
    elif archived == "exclude":
        stmt = stmt.where(Activity.status != ActivityStatus.ARCHIVED)
        if not _can_see_all(user):
            stmt = stmt.where(Activity.status.in_(_PUBLIC_STATUSES))
    else:
        # 旧 status_filter 语义（保持兼容）
        if status_filter == "all" and not _can_see_all(user):
            stmt = stmt.where(Activity.status.in_(_PUBLIC_STATUSES))
        if status_filter == ActivityStatus.PUBLISHED.value:
            stmt = stmt.where(Activity.status.in_([ActivityStatus.PUBLISHED, ActivityStatus.REGISTRATION_OPEN]))
        elif status_filter == ActivityStatus.REGISTRATION_OPEN.value:
            stmt = stmt.where(Activity.status == ActivityStatus.REGISTRATION_OPEN)
        elif status_filter == "archive":
            # 前台活动页：含历史已结束活动（草稿/归档仍不可见）
            stmt = stmt.where(Activity.status.in_(_PUBLIC_STATUSES))
    if category:
        stmt = stmt.where(Activity.category == category)
    stmt = stmt.order_by(Activity.register_start.desc().nullslast(), Activity.id.desc())
    result = await db.execute(stmt)
    items = result.scalars().all()
    # 自动状态刷新（数据库可能有多条过期活动）
    changed = False
    for a in items:
        if await _refresh_status(a, db):
            changed = True
    if changed:
        await db.commit()
    # 翻译 Out 副本而非 ORM 实体，避免译文随 get_db 统一 commit 污染源数据
    outs = [ActivityOut.model_validate(a) for a in items]
    counts = await _enrol_counts(db, [a.id for a in items])
    enrolled_ids = await _user_enrolled(db, user, [a.id for a in items])
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    by_id = {a.id: a for a in items}
    for out in outs:
        out.enrolled_count = counts.get(out.id, 0)
        out.enrolled = out.id in enrolled_ids
        out.runtime_status = _runtime_status(by_id[out.id], now_naive)
    if lang:
        await translate_obj_fields(db, outs, ("title", "description"), lang)
    return outs


@router.get("/{activity_id}", response_model=ActivityOut)
async def get_activity(
    activity_id: int,
    lang: str | None = Query(default=None, max_length=16, description="显示语言；传入时标题/短描述自动翻译"),
    user: dict | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    a = await db.get(Activity, activity_id)
    # 软删除活动对外不可见（回收站数据）；草稿仅后台可见；
    # 归档活动允许所有人查看详情（归档专区仅禁新增报名/签到，浏览不受限）
    if not a or a.is_deleted:
        raise HTTPException(status_code=404, detail="活动不存在")
    if (
        a.status.value not in _PUBLIC_STATUSES
        and a.status != ActivityStatus.ARCHIVED
        and not _can_see_all(user)
    ):
        raise HTTPException(status_code=404, detail="活动不存在")
    if await _refresh_status(a, db):
        await db.commit()
    out = ActivityOut.model_validate(a)
    out.enrolled_count = (await _enrol_counts(db, [a.id])).get(a.id, 0)
    out.enrolled = a.id in await _user_enrolled(db, user, [a.id])
    out.runtime_status = _runtime_status(a, datetime.now(timezone.utc).replace(tzinfo=None))
    if lang:
        await translate_obj_fields(db, [out], ("title", "description"), lang)
    return out


# ---------- 管理：创建 / 修改 / 删除 ----------
async def _ensure_slug_free(db: AsyncSession, slug: str | None, exclude_id: int | None = None):
    """slug 唯一性校验（旧库无唯一约束，由应用层兜底）。"""
    if not slug:
        return
    stmt = select(Activity.id).where(Activity.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(Activity.id != exclude_id)
    if (await db.execute(stmt)).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="活动标识（slug）已存在")


@router.post("", response_model=ActivityOut, status_code=status.HTTP_201_CREATED)
async def create_activity(
    req: ActivityCreate,
    request: Request,
    user: dict = Depends(require_permission("activities", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    await _ensure_slug_free(db, req.slug)
    a = Activity(**req.model_dump(), created_by=ctx_uid(user),
                 operator_admin_id=ctx_uid(user))
    db.add(a)
    await db.flush()
    _log(db, user, "activity.create", f"activity:{a.id}",
         get_client_ip(request))
    return a


@router.patch("/{activity_id}", response_model=ActivityOut)
async def update_activity(
    activity_id: int,
    req: ActivityUpdate,
    request: Request,
    user: dict = Depends(require_permission("activities", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    a = await db.get(Activity, activity_id)
    if not a:
        raise HTTPException(status_code=404, detail="活动不存在")
    if a.is_deleted:
        raise HTTPException(status_code=404, detail="活动已删除（内容回收站）")
    dump = req.model_dump(exclude_unset=True)
    if "slug" in dump:
        await _ensure_slug_free(db, dump["slug"], exclude_id=activity_id)
    for k, v in dump.items():
        setattr(a, k, v)
    a.updated_at = datetime.now(timezone.utc)
    a.operator_admin_id = ctx_uid(user)
    _log(db, user, "activity.update", f"activity:{activity_id}",
         get_client_ip(request))
    return a


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """软删除活动：送入内容回收站，定时任务 30 天后物理清除（可在回收站恢复）。"""
    a = await db.get(Activity, activity_id)
    if not a:
        raise HTTPException(status_code=404, detail="活动不存在")
    if a.is_deleted:
        raise HTTPException(status_code=400, detail="该活动已在内容回收站中")
    a.is_deleted = True
    a.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    a.operator_admin_id = ctx_uid(user)
    _log(db, user, "activity.delete", f"activity:{activity_id} soft",
         get_client_ip(request))


# ==================== 一键报名（P0：登录用户） ====================

@router.post("/{activity_id}/enrol", status_code=status.HTTP_201_CREATED)
async def enrol_activity(
    activity_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """登录用户一键报名活动（user 与 admin 均可）。

    校验顺序：活动存在（含软删拦截）→ 归档 403 → 时间约束 → 重复报名 409。
    """
    a = await db.get(Activity, activity_id)
    if not a or a.is_deleted:
        raise HTTPException(status_code=404, detail="活动不存在")
    # 归档活动强制拦截报名（历史记录保留，仅禁止新增）
    if a.status == ActivityStatus.ARCHIVED:
        raise HTTPException(status_code=403, detail="活动已归档，报名已停止")
    if a.status not in (ActivityStatus.PUBLISHED, ActivityStatus.REGISTRATION_OPEN):
        raise HTTPException(status_code=400, detail="活动当前不接受报名")
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    if a.end_at and now_naive > a.end_at:
        raise HTTPException(status_code=400, detail="活动已结束")
    if a.register_start and now_naive < a.register_start:
        raise HTTPException(status_code=400, detail="报名尚未开始")
    if a.register_end and now_naive > a.register_end:
        raise HTTPException(status_code=400, detail="报名已截止")
    # 人数上限（0 = 无上限）
    if a.max_participants > 0:
        current = (await _enrol_counts(db, [a.id])).get(a.id, 0)
        if current >= a.max_participants:
            raise HTTPException(status_code=400, detail="报名人数已满")
    uid = ctx_uid(user)
    if uid is None:
        raise HTTPException(status_code=403, detail="应急账号不适用个人报名功能")
    existing = (await db.execute(
        select(ActivityEnrol).where(
            ActivityEnrol.activity_id == activity_id,
            ActivityEnrol.user_id == uid,
        )
    )).scalar_one_or_none()
    if existing and not existing.is_deleted:
        raise HTTPException(status_code=409, detail="已报名该活动，请勿重复报名")
    if existing:
        # 曾取消报名：恢复原记录
        existing.is_deleted = False
    else:
        db.add(ActivityEnrol(activity_id=activity_id, user_id=uid))
    _log(db, uid, "activity.enrol", f"activity:{activity_id}", get_client_ip(request))
    await db.commit()
    count = (await _enrol_counts(db, [a.id])).get(a.id, 0)
    return {"ok": True, "enrolled_count": count}


@router.delete("/{activity_id}/enrol", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_enrol_activity(
    activity_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """取消报名：报名记录软删除；归档活动强制拦截 403（历史记录保留）。"""
    a = await db.get(Activity, activity_id)
    if not a or a.is_deleted:
        raise HTTPException(status_code=404, detail="活动不存在")
    if a.status == ActivityStatus.ARCHIVED:
        raise HTTPException(status_code=403, detail="活动已归档，无法取消报名")
    uid = ctx_uid(user)
    if uid is None:
        raise HTTPException(status_code=403, detail="应急账号不适用个人报名功能")
    enrol = (await db.execute(
        select(ActivityEnrol).where(
            ActivityEnrol.activity_id == activity_id,
            ActivityEnrol.user_id == uid,
            ActivityEnrol.is_deleted.is_(False),
        )
    )).scalar_one_or_none()
    if not enrol:
        raise HTTPException(status_code=404, detail="尚未报名该活动")
    enrol.is_deleted = True
    _log(db, uid, "activity.enrol_cancel", f"activity:{activity_id}", get_client_ip(request))


# ==================== Phase 3 扩展：统计 + 导出 + finalize ====================

# ---------- 管理：报名明细（分页+筛选） ----------
@admin_router.get("/{activity_id}/registrations", response_model=dict)
async def admin_list_activity_registrations(
    activity_id: int,
    status_filter: Literal["pending", "approved", "rejected", "checked_in"] | None = Query(default=None),
    q: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(require_permission("activities", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    from app.utils.crud import apply_eq, apply_search
    a = await db.get(Activity, activity_id)
    if not a:
        raise HTTPException(status_code=404, detail="活动不存在")
    stmt = select(Registration).where(
        Registration.activity_id == activity_id,
        Registration.registration_type == RegistrationType.ACTIVITY,
    )
    if status_filter:
        stmt = apply_eq(stmt, Registration.status, RegistrationStatus(status_filter))
    stmt = apply_search(stmt, [Registration.name, Registration.student_id, Registration.college], q)
    stmt = stmt.order_by(Registration.submitted_at.desc())
    return await paginate(db, stmt, page, page_size, out_model=RegistrationOut)


# ---------- 管理：finalize — 已结束活动生成统计快照 ----------
@admin_router.post("/{activity_id}/finalize", response_model=ActivityStatisticsOut)
async def admin_finalize_activity(
    activity_id: int,
    request: Request,
    user: dict = Depends(require_permission("activities", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """已结束活动生成/刷新报名统计快照。

    - 必须是 status=ended 的活动（或 end_at < now，会自动先转 ended）
    - 统计 total/pending/approved/rejected/checked_in
    - 已存在则覆盖更新，不重复创建
    """
    a = await db.get(Activity, activity_id)
    if not a:
        raise HTTPException(status_code=404, detail="活动不存在")
    # 强制刷新状态
    if await _refresh_status(a, db):
        await db.flush()
    if a.status != ActivityStatus.ENDED:
        raise HTTPException(status_code=400, detail="活动尚未结束，无法生成统计快照")

    # 计算各项数量
    base_filter = [
        Registration.activity_id == activity_id,
        Registration.registration_type == RegistrationType.ACTIVITY,
    ]
    total = (await db.execute(
        select(func.count()).select_from(Registration).where(*base_filter)
    )).scalar_one()
    pending = (await db.execute(
        select(func.count()).select_from(Registration).where(*base_filter, Registration.status == RegistrationStatus.PENDING)
    )).scalar_one()
    approved = (await db.execute(
        select(func.count()).select_from(Registration).where(*base_filter, Registration.status == RegistrationStatus.APPROVED)
    )).scalar_one()
    rejected = (await db.execute(
        select(func.count()).select_from(Registration).where(*base_filter, Registration.status == RegistrationStatus.REJECTED)
    )).scalar_one()
    checked_in = (await db.execute(
        select(func.count()).select_from(Registration).where(*base_filter, Registration.status == RegistrationStatus.CHECKED_IN)
    )).scalar_one()

    existing = (
        await db.execute(select(ActivityStatistics).where(ActivityStatistics.activity_id == activity_id))
    ).scalar_one_or_none()
    if existing:
        existing.total = total
        existing.pending = pending
        existing.approved = approved
        existing.rejected = rejected
        existing.checked_in = checked_in
        existing.generated_at = datetime.now(timezone.utc)
        stat = existing
    else:
        stat = ActivityStatistics(
            activity_id=activity_id,
            total=total,
            pending=pending,
            approved=approved,
            rejected=rejected,
            checked_in=checked_in,
        )
        db.add(stat)
    _log(db, user, "activity.finalize", f"activity:{activity_id}",
         get_client_ip(request))
    await db.commit()
    await db.refresh(stat)
    return stat


# ---------- 管理：读取统计快照 ----------
@admin_router.get("/{activity_id}/statistics", response_model=ActivityStatisticsOut)
async def admin_get_activity_statistics(
    activity_id: int,
    user: dict = Depends(require_permission("activities", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    a = await db.get(Activity, activity_id)
    if not a:
        raise HTTPException(status_code=404, detail="活动不存在")
    stat = (
        await db.execute(select(ActivityStatistics).where(ActivityStatistics.activity_id == activity_id))
    ).scalar_one_or_none()
    if not stat:
        raise HTTPException(status_code=404, detail="暂无统计快照，请先 finalize")
    return stat


# ---------- 管理：导出活动报名明细 CSV/XLSX ----------
@admin_router.get("/{activity_id}/export")
async def admin_export_activity_registrations(
    activity_id: int,
    format: Literal["csv", "xlsx"] = Query(default="csv"),
    status_filter: Literal["pending", "approved", "rejected", "checked_in"] | None = Query(default=None),
    user: dict = Depends(require_permission("activities", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    a = await db.get(Activity, activity_id)
    if not a:
        raise HTTPException(status_code=404, detail="活动不存在")
    stmt = select(Registration).where(
        Registration.activity_id == activity_id,
        Registration.registration_type == RegistrationType.ACTIVITY,
    )
    if status_filter:
        stmt = stmt.where(Registration.status == RegistrationStatus(status_filter))
    stmt = stmt.order_by(Registration.submitted_at.desc())
    rows = (await db.execute(stmt)).scalars().all()

    headers = [
        ("姓名", "name"),
        ("学号", "student_id"),
        ("学院", "college"),
        ("专业", "major"),
        ("区号", "phone_cc"),
        ("手机号", "phone_number"),
        ("邮箱", "email"),
        ("状态", "status"),
        ("备注", "remark"),
        ("签到时间", "checked_in_at"),
        ("提交时间", "submitted_at"),
        ("提交IP", "submit_ip"),
    ]
    if format == "xlsx":
        data = to_xlsx(rows, headers, text_columns={"student_id", "phone_number"},
                       sheet_title=f"活动报名_{activity_id}")
        return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="activity_{activity_id}_registrations.xlsx"'})
    data = to_csv(rows, headers, free_text_keys={"name", "college", "major", "email", "remark"})
    return Response(content=data, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="activity_{activity_id}_registrations.csv"'})
