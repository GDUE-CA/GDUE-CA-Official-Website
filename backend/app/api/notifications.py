"""用户信息通知接口。

通知来源：announcements 表中 category=homepage 的「信息通知」。
- 列表：后端过滤【已启用 + 时间生效中】且对该用户可见的通知，附 is_read 与 unread_count；
- 已读：单条 / 全部标为已读，写入 user_notify_reads 已读记录（幂等）。

所有接口需登录（member 及以上角色均可）。
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import Role, require_role
from app.db.models import Announcement, AnnouncementCategory, UserNotifyRead
from app.db.session import get_db
from app.schemas.notification import (
    MarkReadOut,
    NotificationListOut,
    NotificationOut,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _now_naive() -> datetime:
    """SQLite 存 naive UTC，比较时统一去 tzinfo，避免 aware/naive 混比 TypeError。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _effective_stmt():
    """生效中通知查询：已启用 + （start_at 为空或 ≤ now）+（end_at 为空或 ≥ now）。"""
    now = _now_naive()
    return select(Announcement).where(
        Announcement.enabled.is_(True),
        Announcement.category == AnnouncementCategory.HOMEPAGE,
        ((Announcement.start_at.is_(None)) | (Announcement.start_at <= now))
        & ((Announcement.end_at.is_(None)) | (Announcement.end_at >= now)),
    )


async def _effective_ids(db: AsyncSession) -> list[int]:
    stmt = _effective_stmt().with_only_columns(Announcement.id)
    return list((await db.execute(stmt)).scalars().all())


async def _unread_count(db: AsyncSession, user_id: int) -> int:
    """未读数 = 生效中通知总数 - 其中已读数。"""
    eff_ids = await _effective_ids(db)
    if not eff_ids:
        return 0
    read_cnt = (await db.execute(
        select(func.count())
        .select_from(UserNotifyRead)
        .where(
            UserNotifyRead.user_id == user_id,
            UserNotifyRead.announcement_id.in_(eff_ids),
        )
    )).scalar_one()
    return len(eff_ids) - int(read_cnt)


# ---------- 当前用户的有效通知列表 ----------
@router.get("", response_model=NotificationListOut)
async def list_my_notifications(
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """后端过滤：仅返回【生效中、未过期、已启用】的信息通知，附已读状态与未读数。"""
    items = (await db.execute(
        _effective_stmt().order_by(Announcement.priority.desc(), Announcement.created_at.desc())
    )).scalars().all()

    read_ids: set[int] = set()
    if items:
        rows = await db.execute(
            select(UserNotifyRead.announcement_id).where(
                UserNotifyRead.user_id == int(user["user_id"]),
                UserNotifyRead.announcement_id.in_([a.id for a in items]),
            )
        )
        read_ids = {r[0] for r in rows.all()}

    return NotificationListOut(
        items=[
            NotificationOut(
                id=a.id,
                title=a.title,
                content=a.content,
                link=a.link,
                published_at=a.created_at,
                is_read=a.id in read_ids,
            )
            for a in items
        ],
        unread_count=sum(1 for a in items if a.id not in read_ids),
    )


# ---------- 单条标记已读 ----------
@router.post("/{nid}/read", response_model=MarkReadOut)
async def mark_notification_read(
    nid: int,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """单条通知标记为已读（幂等）：已存在记录直接返回最新未读数。"""
    a = await db.get(Announcement, nid)
    if not a:
        raise HTTPException(status_code=404, detail="通知不存在")

    existing = (await db.execute(
        select(UserNotifyRead).where(
            UserNotifyRead.user_id == int(user["user_id"]),
            UserNotifyRead.announcement_id == nid,
        )
    )).scalar_one_or_none()
    if not existing:
        db.add(UserNotifyRead(user_id=int(user["user_id"]), announcement_id=nid))
        await db.commit()

    return MarkReadOut(unread_count=await _unread_count(db, int(user["user_id"])))


# ---------- 全部标为已读 ----------
@router.post("/read-all", response_model=MarkReadOut)
async def mark_all_notifications_read(
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """把当前所有【生效中且已启用】的通知一次性标记为已读（幂等）。"""
    uid = int(user["user_id"])
    eff_ids = await _effective_ids(db)
    if eff_ids:
        existing = set((await db.execute(
            select(UserNotifyRead.announcement_id).where(
                UserNotifyRead.user_id == uid,
                UserNotifyRead.announcement_id.in_(eff_ids),
            )
        )).scalars().all())
        for aid in eff_ids:
            if aid not in existing:
                db.add(UserNotifyRead(user_id=uid, announcement_id=aid))
        await db.commit()

    return MarkReadOut(unread_count=0)
