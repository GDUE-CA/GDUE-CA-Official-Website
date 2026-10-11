"""公告 CMS 接口。

公开接口：自动过滤【时间生效中 + 已启用】，按 priority 降序返回；过期自动隐藏。
管理接口：完整 CRUD，权限模块 announcements。
"""
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.db.models import Announcement, AnnouncementCategory, AuditLog, UserNotifyRead
from app.db.session import get_db
from app.schemas.announcement import (
    AnnouncementCreate,
    AnnouncementOut,
    AnnouncementPublicOut,
    AnnouncementUpdate,
)
from app.utils.crud import apply_eq, apply_search, paginate
from app.utils.translator import translate_obj_fields

# 公开接口（无鉴权）
public_router = APIRouter(prefix="/api/announcements", tags=["announcements-public"])
# 管理接口（需 announcements 权限）
admin_router = APIRouter(prefix="/api/admin/announcements", tags=["announcements-admin"])


def _log(db: AsyncSession, uid: int, action: str, target: str | None, ip: str | None):
    db.add(AuditLog(user_id=uid, action=action, target=target, ip=ip))


def _is_in_effect(a: Announcement, now: datetime) -> bool:
    """生效中：start_at/end_at 任一为空表示对应方向不限，否则需在区间内。"""
    if a.start_at is not None and now < a.start_at:
        return False
    if a.end_at is not None and now > a.end_at:
        return False
    return True


# ---------- 公开：返回当前生效中的公告 ----------
@public_router.get("", response_model=list[AnnouncementPublicOut])
async def list_public_announcements(
    category: Literal["homepage", "home"] | None = Query(default=None),
    lang: str | None = Query(default=None, max_length=16, description="显示语言；传入时标题/内容自动翻译（缓存加速，失败回退原文）"),
    db: AsyncSession = Depends(get_db),
):
    """前端公开接口：自动过滤【时间生效中 + 已启用】，按 priority 降序。"""
    now = datetime.now(timezone.utc)
    # naive 与 aware 比较会抛 TypeError，SQLite 存的 datetime 是 naive；
    # 统一转 naive UTC 进行比较
    now_naive = now.replace(tzinfo=None)

    stmt = select(Announcement).where(Announcement.enabled.is_(True))
    if category:
        stmt = stmt.where(Announcement.category == category)
    # 过滤时间生效中：start_at IS NULL OR start_at <= now；
    #             end_at IS NULL OR end_at >= now
    stmt = stmt.where(
        ((Announcement.start_at.is_(None)) | (Announcement.start_at <= now_naive))
        & ((Announcement.end_at.is_(None)) | (Announcement.end_at >= now_naive))
    )
    # 同优先级按公告日期（start_at）倒序，最新公告在前；未设生效时间的按创建时间兜底
    stmt = stmt.order_by(
        Announcement.priority.desc(), Announcement.start_at.desc(), Announcement.created_at.desc()
    )
    result = await db.execute(stmt)
    # 翻译 Out 副本而非 ORM 实体，避免译文随 get_db 统一 commit 污染源数据
    outs = [AnnouncementPublicOut.model_validate(a) for a in result.scalars().all()]
    if lang:
        await translate_obj_fields(db, outs, ("title", "content"), lang)
    return outs


# ---------- 管理：分页列表 ----------
@admin_router.get("", response_model=dict)
async def admin_list_announcements(
    category: Literal["homepage", "home"] | None = Query(default=None),
    enabled: bool | None = Query(default=None),
    q: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(require_permission("announcements", "view")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Announcement)
    if category:
        stmt = apply_eq(stmt, Announcement.category, AnnouncementCategory(category))
    if enabled is not None:
        stmt = apply_eq(stmt, Announcement.enabled, enabled)
    stmt = apply_search(stmt, [Announcement.title, Announcement.content], q)
    # 按公告日期（start_at）倒序，最新公告始终在最顶部；未设生效时间的按创建时间兜底
    stmt = stmt.order_by(Announcement.start_at.desc(), Announcement.created_at.desc())
    return await paginate(db, stmt, page, page_size, out_model=AnnouncementOut)


# ---------- 管理：单条详情 ----------
@admin_router.get("/{aid}", response_model=AnnouncementOut)
async def admin_get_announcement(
    aid: int,
    user: dict = Depends(require_permission("announcements", "view")),
    db: AsyncSession = Depends(get_db),
):
    a = await db.get(Announcement, aid)
    if not a:
        raise HTTPException(status_code=404, detail="公告不存在")
    return a


# ---------- 管理：创建 ----------
@admin_router.post("", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
async def admin_create_announcement(
    req: AnnouncementCreate,
    request: Request,
    user: dict = Depends(require_permission("announcements", "manage")),
    db: AsyncSession = Depends(get_db),
):
    # 生效时间窗校验：start_at 必须早于 end_at
    if req.start_at and req.end_at and req.start_at >= req.end_at:
        raise HTTPException(status_code=400, detail="生效开始时间必须早于失效结束时间")

    a = Announcement(
        **req.model_dump(),
        created_by=int(user["user_id"]),
    )
    db.add(a)
    _log(db, int(user["user_id"]), "announcement.create", None, get_client_ip(request))
    await db.commit()
    await db.refresh(a)
    return a


# ---------- 管理：更新 ----------
@admin_router.put("/{aid}", response_model=AnnouncementOut)
async def admin_update_announcement(
    aid: int,
    req: AnnouncementUpdate,
    request: Request,
    user: dict = Depends(require_permission("announcements", "manage")),
    db: AsyncSession = Depends(get_db),
):
    a = await db.get(Announcement, aid)
    if not a:
        raise HTTPException(status_code=404, detail="公告不存在")

    data = req.model_dump(exclude_unset=True)
    # 时间窗校验
    new_start = data.get("start_at", a.start_at)
    new_end = data.get("end_at", a.end_at)
    if new_start and new_end and new_start >= new_end:
        raise HTTPException(status_code=400, detail="生效开始时间必须早于失效结束时间")

    if "category" in data and data["category"] is not None:
        a.category = AnnouncementCategory(data["category"])
    for k in ("title", "content", "link", "start_at", "end_at", "enabled", "priority"):
        if k in data:
            setattr(a, k, data[k])
    _log(db, int(user["user_id"]), "announcement.update", f"announcement:{aid}",
         get_client_ip(request))
    await db.commit()
    await db.refresh(a)
    return a


# ---------- 管理：删除 ----------
@admin_router.delete("/{aid}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_announcement(
    aid: int,
    request: Request,
    user: dict = Depends(require_permission("announcements", "manage")),
    db: AsyncSession = Depends(get_db),
):
    a = await db.get(Announcement, aid)
    if not a:
        raise HTTPException(status_code=404, detail="公告不存在")
    # 同步清理该通知的所有已读记录（SQLite 未开 FK pragma，需显式删除）
    await db.execute(delete(UserNotifyRead).where(UserNotifyRead.announcement_id == aid))
    await db.delete(a)
    _log(db, int(user["user_id"]), "announcement.delete", f"announcement:{aid}",
         get_client_ip(request))
    await db.commit()
