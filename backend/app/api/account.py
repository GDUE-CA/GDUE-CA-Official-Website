"""账号自服务接口（/setting，新壳 ok() / BizException）。

- 界面显示偏好：GET/PUT /api/account/display（主题/深浅色/字体缩放/横屏，跟随账号多端同步）
- 通知偏好：GET/PUT /api/account/notifications（安全类开关后端强制锁定，恒为 True）
- 黑名单：GET/POST/DELETE /api/account/blocks + GET /api/account/blocks/search
- OAuth 授权：GET/DELETE /api/account/oauth-grants（撤销绑定写审计日志）

全部接口要求登录（未实名可用）；Break-Glass 应急账号不适用个人自服务。
"""
import re

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.bizcode import BizCode
from app.core.exceptions import BizException
from app.core.middleware import get_client_ip
from app.core.security import Role, require_role
from app.core.responses import ok
from app.db.models import (
    OAuthAccount,
    User,
    UserBlock,
    UserDisplayPreference,
    UserNotificationPreference,
)
from app.db.session import get_db
from app.schemas.account import (
    BlockCreate,
    BlockedUserBrief,
    BlockedUserOut,
    DisplayPreferenceOut,
    DisplayPreferenceUpdate,
    NotificationPreferenceOut,
    NotificationPreferenceUpdate,
    OAuthGrantOut,
)

router = APIRouter(prefix="/api/account", tags=["account"])

_THEME_NAME_RE = re.compile(r"^[a-z][a-z0-9-]{0,31}$")


async def _current_user_id(user: dict) -> int:
    if user.get("break_glass"):
        raise BizException(BizCode.FORBIDDEN, data={"detail": "应急账号不适用个人自服务功能"})
    return int(user["user_id"])


# ==================== 界面显示偏好 ====================

async def _get_or_create_display(db: AsyncSession, uid: int) -> UserDisplayPreference:
    row = await db.get(UserDisplayPreference, uid)
    if row is None:
        row = UserDisplayPreference(user_id=uid)
        db.add(row)
        await db.flush()
    return row


@router.get("/display", response_model=None)
async def get_display_preference(
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    uid = await _current_user_id(user)
    row = await db.get(UserDisplayPreference, uid)
    if row is None:
        return ok(DisplayPreferenceOut().model_dump(mode="json"))
    return ok(DisplayPreferenceOut.model_validate(row).model_dump(mode="json"))


@router.put("/display", response_model=None)
async def update_display_preference(
    body: DisplayPreferenceUpdate,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    uid = await _current_user_id(user)
    row = await _get_or_create_display(db, uid)

    if body.theme_name is not None:
        name = body.theme_name.strip()
        if name and not _THEME_NAME_RE.match(name):
            raise BizException(BizCode.BAD_REQUEST, data={"detail": "主题标识不合法"})
        row.theme_name = name or None
    if body.color_scheme is not None:
        row.color_scheme = body.color_scheme
    if body.font_scale is not None:
        row.font_scale = body.font_scale
    if body.enable_landscape is not None:
        row.enable_landscape = body.enable_landscape
    await db.commit()
    await db.refresh(row)
    return ok(DisplayPreferenceOut.model_validate(row).model_dump(mode="json"))


# ==================== 通知偏好 ====================

# 用户可自由开关的字段白名单（安全类不在此列，任何关闭请求一律忽略）
_USER_TOGGLABLE = (
    "content_liked",
    "content_commented",
    "content_replied",
    "biz_task_assigned",
    "biz_task_changed",
    "biz_announcement",
)


async def _get_or_create_notify(db: AsyncSession, uid: int) -> UserNotificationPreference:
    row = await db.get(UserNotificationPreference, uid)
    if row is None:
        row = UserNotificationPreference(user_id=uid)
        db.add(row)
        await db.flush()
    return row


@router.get("/notifications", response_model=None)
async def get_notification_preference(
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    uid = await _current_user_id(user)
    row = await db.get(UserNotificationPreference, uid)
    if row is None:
        return ok(NotificationPreferenceOut().model_dump(mode="json"))
    # 安全项强制为 True（容错旧数据）
    row.security_new_device = True
    row.security_credential_change = True
    row.security_notice_locked = True
    return ok(NotificationPreferenceOut.model_validate(row).model_dump(mode="json"))


@router.put("/notifications", response_model=None)
async def update_notification_preference(
    body: NotificationPreferenceUpdate,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    uid = await _current_user_id(user)
    row = await _get_or_create_notify(db, uid)
    data = body.model_dump(exclude_unset=True)
    for field in _USER_TOGGLABLE:
        if field in data and data[field] is not None:
            setattr(row, field, bool(data[field]))
    # 安全通知锁死：无论传入什么，恒为 True
    row.security_new_device = True
    row.security_credential_change = True
    row.security_notice_locked = True
    await db.commit()
    await db.refresh(row)
    return ok(NotificationPreferenceOut.model_validate(row).model_dump(mode="json"))


# ==================== 黑名单 ====================

async def _get_blocked_rows(db: AsyncSession, uid: int) -> list[tuple[UserBlock, User]]:
    result = await db.execute(
        select(UserBlock, User)
        .join(User, User.id == UserBlock.blocked_id)
        .where(UserBlock.blocker_id == uid)
        .order_by(UserBlock.created_at.desc())
        .limit(500)
    )
    return [(b, u) for b, u in result.all()]


@router.get("/blocks", response_model=None)
async def list_blocks(
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    uid = await _current_user_id(user)
    rows = await _get_blocked_rows(db, uid)
    data = [
        BlockedUserOut(
            id=u.id,
            username=u.username,
            display_name=u.display_name,
            avatar_url=u.avatar_url,
            blocked_at=b.created_at,
        ).model_dump(mode="json")
        for b, u in rows
    ]
    return ok(data)


@router.get("/blocks/search", response_model=None)
async def search_block_targets(
    q: str = Query(min_length=1, max_length=64),
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """按用户名 / 昵称搜索可拉黑用户（排除自己、已拉黑、已删除）。"""
    uid = await _current_user_id(user)
    keyword = q.strip()
    if not keyword:
        return ok([])
    blocked_subq = select(UserBlock.blocked_id).where(UserBlock.blocker_id == uid)
    like = f"%{keyword}%"
    result = await db.execute(
        select(User)
        .where(
            User.id != uid,
            User.is_deleted.is_(False),
            User.is_active.is_(True),
            User.id.not_in(blocked_subq),
            or_(User.username.ilike(like), User.display_name.ilike(like)),
        )
        .order_by(User.username.asc())
        .limit(10)
    )
    users = result.scalars().all()
    data = [
        BlockedUserBrief(
            id=u.id, username=u.username, display_name=u.display_name, avatar_url=u.avatar_url
        ).model_dump(mode="json")
        for u in users
    ]
    return ok(data)


@router.post("/blocks", response_model=None)
async def create_block(
    body: BlockCreate,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    uid = await _current_user_id(user)
    if body.user_id is None and not body.username:
        raise BizException(BizCode.BAD_REQUEST, data={"detail": "必须指定拉黑用户"})

    if body.user_id is not None:
        target = await db.get(User, body.user_id)
    else:
        target = (
            await db.execute(select(User).where(User.username == body.username.strip()))
        ).scalar_one_or_none()

    if target is None or target.is_deleted:
        raise BizException(BizCode.NOT_FOUND, data={"detail": "用户不存在"})
    if target.id == uid:
        raise BizException(BizCode.BAD_REQUEST, data={"detail": "不能拉黑自己"})

    exists = (
        await db.execute(
            select(UserBlock).where(
                UserBlock.blocker_id == uid, UserBlock.blocked_id == target.id
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        db.add(UserBlock(blocker_id=uid, blocked_id=target.id))
        await db.commit()
    return ok({"ok": True})


@router.delete("/blocks/{blocked_id}", response_model=None)
async def delete_block(
    blocked_id: int,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    uid = await _current_user_id(user)
    row = (
        await db.execute(
            select(UserBlock).where(
                UserBlock.blocker_id == uid, UserBlock.blocked_id == blocked_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise BizException(BizCode.NOT_FOUND, data={"detail": "拉黑记录不存在"})
    await db.delete(row)
    await db.commit()
    return ok({"ok": True})


# ==================== OAuth 授权管理 ====================

@router.get("/oauth-grants", response_model=None)
async def list_oauth_grants(
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    uid = await _current_user_id(user)
    rows = (
        await db.execute(
            select(OAuthAccount)
            .where(OAuthAccount.user_id == uid)
            .order_by(OAuthAccount.created_at.desc())
        )
    ).scalars().all()
    data = [
        OAuthGrantOut(id=r.id, provider=r.provider.value, created_at=r.created_at).model_dump(
            mode="json"
        )
        for r in rows
    ]
    return ok(data)


@router.delete("/oauth-grants/{grant_id}", response_model=None)
async def revoke_oauth_grant(
    grant_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """撤销第三方授权绑定（敏感操作：写审计日志，只增不改不删）。"""
    uid = await _current_user_id(user)
    row = await db.get(OAuthAccount, grant_id)
    if row is None or row.user_id != uid:
        raise BizException(BizCode.NOT_FOUND, data={"detail": "授权记录不存在"})
    provider = row.provider.value
    await db.delete(row)
    log_action(
        db,
        user,
        "oauth.unbind",
        f"provider:{provider} grant:{grant_id}",
        ip=get_client_ip(request),
    )
    await db.commit()
    return ok({"ok": True})
