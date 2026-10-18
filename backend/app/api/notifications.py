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

from app.core.audit import ctx_uid, is_break_glass
from app.core.security import Role, is_admin_tier, require_role
from app.db.models import (
    Announcement,
    AnnouncementCategory,
    BackgroundTask,
    UserMessage,
    UserNotifyRead,
)
from app.db.session import get_db
from app.schemas.background_task import BackgroundTaskOut
from app.schemas.notification import (
    MarkReadOut,
    NotificationListOut,
    NotificationOut,
    UserMessageOut,
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


async def _message_unread_count(db: AsyncSession, user_id: int) -> int:
    """站内私信未读数（行内 is_read 标记）。"""
    return int((await db.execute(
        select(func.count())
        .select_from(UserMessage)
        .where(UserMessage.user_id == user_id, UserMessage.is_read.is_(False))
    )).scalar_one())


async def _total_unread(db: AsyncSession, user_id: int) -> int:
    """角标未读总数 = 广播通知未读 + 站内私信未读。"""
    return await _unread_count(db, user_id) + await _message_unread_count(db, user_id)


def _uid(user) -> int:
    """当前登录用户 id；Break-Glass 应急账号不参与个人通知功能。"""
    v = ctx_uid(user)
    if v is None:
        raise HTTPException(status_code=403, detail="应急账号不适用个人通知功能")
    return v


# ---------- 当前用户的有效通知列表 ----------
@router.get("", response_model=NotificationListOut)
async def list_my_notifications(
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """后端过滤：仅返回【生效中、未过期、已启用】的信息通知，附已读状态与未读数。

    管理员级角色额外返回 background_tasks：未手动关闭的后台异步任务通知
    （任务行即数据源，常驻不自动消失；普通成员恒为空数组）。
    """
    items = (await db.execute(
        _effective_stmt().order_by(Announcement.priority.desc(), Announcement.created_at.desc())
    )).scalars().all()

    read_ids: set[int] = set()
    if items:
        rows = await db.execute(
            select(UserNotifyRead.announcement_id).where(
                UserNotifyRead.user_id == _uid(user),
                UserNotifyRead.announcement_id.in_([a.id for a in items]),
            )
        )
        read_ids = {r[0] for r in rows.all()}

    # 后台任务通知（仅管理员级；Break-Glass 无 user_id，不参与个人通知）
    bg_tasks: list[BackgroundTask] = []
    if not is_break_glass(user) and is_admin_tier(Role(user["role"])):
        bg_tasks = list((await db.execute(
            select(BackgroundTask)
            .where(BackgroundTask.dismissed_at.is_(None))
            .order_by(BackgroundTask.created_at.desc())
            .limit(20)
        )).scalars().all())

    # 站内私信（每用户专属，按创建时间倒序，最新 50 条）
    messages = list((await db.execute(
        select(UserMessage)
        .where(UserMessage.user_id == _uid(user))
        .order_by(UserMessage.created_at.desc())
        .limit(50)
    )).scalars().all())

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
        unread_count=sum(1 for a in items if a.id not in read_ids)
        + sum(1 for m in messages if not m.is_read),
        messages=[UserMessageOut.model_validate(m) for m in messages],
        background_tasks=[
            BackgroundTaskOut.model_validate(t) for t in bg_tasks
        ],
    )


# ---------- 单条标记已读 ----------
@router.post("/{nid}/read", response_model=MarkReadOut)
async def mark_notification_read(
    nid: int,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """单条通知标记为已读（幂等）：已存在记录直接返回最新未读数。"""
    a = await db.get(Announcement, nid)
    if not a:
        raise HTTPException(status_code=404, detail="通知不存在")

    existing = (await db.execute(
        select(UserNotifyRead).where(
            UserNotifyRead.user_id == _uid(user),
            UserNotifyRead.announcement_id == nid,
        )
    )).scalar_one_or_none()
    if not existing:
        db.add(UserNotifyRead(user_id=_uid(user), announcement_id=nid))
        await db.commit()

    return MarkReadOut(unread_count=await _total_unread(db, _uid(user)))


# ---------- 单条私信标记已读 ----------
@router.post("/messages/{mid}/read", response_model=MarkReadOut)
async def mark_message_read(
    mid: int,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """单条站内私信标记为已读（幂等，仅本人私信可操作）。"""
    msg = await db.get(UserMessage, mid)
    if msg is None or msg.user_id != _uid(user):
        raise HTTPException(status_code=404, detail="私信不存在")
    if not msg.is_read:
        msg.is_read = True
        await db.commit()
    return MarkReadOut(unread_count=await _total_unread(db, _uid(user)))


# ---------- 全部标为已读 ----------
@router.post("/read-all", response_model=MarkReadOut)
async def mark_all_notifications_read(
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """把当前所有【生效中且已启用】的通知 + 全部站内私信一次性标记为已读（幂等）。"""
    uid = _uid(user)
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

    # 站内私信：行内标记批量置已读
    unread_msgs = (await db.execute(
        select(UserMessage).where(
            UserMessage.user_id == uid,
            UserMessage.is_read.is_(False),
        )
    )).scalars().all()
    for m in unread_msgs:
        m.is_read = True

    await db.commit()
    return MarkReadOut(unread_count=0)
