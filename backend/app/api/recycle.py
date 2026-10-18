"""内容回收站：统一收纳所有软删除资源（用户、活动，后续模块扩展接入）。

- GET  /api/admin/recycle                 回收站列表（含剩余保留天数）
- POST  /api/admin/recycle/{rtype}/{rid}/restore   恢复软删除资源
- DELETE /api/admin/recycle/{rtype}/{rid}  永久物理删除（定时任务 30 天阈值之外的手动提前清除）

所有恢复 / 清除操作写入审计日志；定时任务每小时扫描，软删除超 30 天自动物理清除。
"""
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.security import Role, require_role
from app.db.models import (
    Activity,
    ActivityEnrol,
    AuditLog,
    LoginSession,
    OAuthAccount,
    RealnameRequest,
    User,
    UserNotifyRead,
)
from app.db.session import get_db

router = APIRouter(prefix="/api/admin/recycle", tags=["recycle"])

# 软删除保留期（天）：超过后定时任务物理删除
RETENTION_DAYS = 30


def _log(db: AsyncSession, ctx_or_uid, action: str, target: str | None, ip: str | None):
    """统一审计写入：ctx_or_uid 支持 ctx dict（自动区分 Break-Glass）/ int / None。"""
    log_action(db, ctx_or_uid, action, target=target, ip=ip)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _days_left(deleted_at: datetime | None) -> int | None:
    """距物理删除剩余天数（向上取整，最小 0）。"""
    if not deleted_at:
        return None
    elapsed = (_now() - deleted_at).total_seconds()
    return max(0, RETENTION_DAYS - int(elapsed // 86400) - (1 if elapsed % 86400 else 0))


@router.get("")
async def list_recycle(
    user: dict = Depends(require_role(Role.EDITOR)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """回收站列表：用户 + 活动两类软删除资源统一返回。"""
    users = (await db.execute(
        select(User).where(User.is_deleted.is_(True)).order_by(User.deleted_at.desc())
    )).scalars().all()
    activities = (await db.execute(
        select(Activity).where(Activity.is_deleted.is_(True)).order_by(Activity.deleted_at.desc())
    )).scalars().all()
    return {
        "retention_days": RETENTION_DAYS,
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "display_name": u.display_name,
                "email": u.email,
                "real_name": u.real_name,
                "role": u.role.value,
                "deleted_at": u.deleted_at,
                "days_left": _days_left(u.deleted_at),
            }
            for u in users
        ],
        "activities": [
            {
                "id": a.id,
                "title": a.title,
                "status": a.status.value,
                "deleted_at": a.deleted_at,
                "days_left": _days_left(a.deleted_at),
            }
            for a in activities
        ],
    }


async def _purge_user(db: AsyncSession, uid: int) -> None:
    """物理删除用户：先清理其从属记录（报名/会话/通知已读/OAuth/实名），再删账号本身。

    审计日志与活动 created_by 等历史引用置空/保留，保证统计与审计链完整。
    """
    await db.execute(sa_delete(ActivityEnrol).where(ActivityEnrol.user_id == uid))
    await db.execute(sa_delete(LoginSession).where(LoginSession.user_id == uid))
    await db.execute(sa_delete(UserNotifyRead).where(UserNotifyRead.user_id == uid))
    await db.execute(sa_delete(OAuthAccount).where(OAuthAccount.user_id == uid))
    await db.execute(sa_delete(RealnameRequest).where(RealnameRequest.user_id == uid))
    u = await db.get(User, uid)
    if u:
        await db.delete(u)


@router.post("/{rtype}/{rid}/restore")
async def restore_recycle_item(
    rtype: Literal["user", "activity"],
    rid: int,
    request: Request,
    user: dict = Depends(require_role(Role.EDITOR)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """恢复软删除资源：is_deleted 置回 False，重新可用。"""
    now = _now()
    if rtype == "user":
        # 账号恢复仅 super_admin（与删除权限对齐）
        if user["role"] != Role.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="账号恢复仅超级管理员可操作")
        u = await db.get(User, rid)
        if not u or not u.is_deleted:
            raise HTTPException(status_code=404, detail="回收站中不存在该账号")
        u.is_deleted = False
        u.deleted_at = None
        u.is_active = True
        _log(db, user, "recycle.restore", f"user:{rid}", get_client_ip(request))
        await db.commit()
        return {"ok": True, "type": "user", "id": rid}

    a = await db.get(Activity, rid)
    if not a or not a.is_deleted:
        raise HTTPException(status_code=404, detail="回收站中不存在该活动")
    a.is_deleted = False
    a.deleted_at = None
    a.operator_admin_id = ctx_uid(user)
    a.updated_at = now
    _log(db, user, "recycle.restore", f"activity:{rid}", get_client_ip(request))
    await db.commit()
    return {"ok": True, "type": "activity", "id": rid}


@router.delete("/{rtype}/{rid}", status_code=status.HTTP_204_NO_CONTENT)
async def purge_recycle_item(
    rtype: Literal["user", "activity"],
    rid: int,
    request: Request,
    user: dict = Depends(require_role(Role.EDITOR)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """永久物理删除（管理员手动提前清除；正常流程由定时任务 30 天后自动执行）。"""
    if rtype == "user":
        if user["role"] != Role.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="账号物理删除仅超级管理员可操作")
        u = await db.get(User, rid)
        if not u or not u.is_deleted:
            raise HTTPException(status_code=404, detail="回收站中不存在该账号")
        await _purge_user(db, rid)
        _log(db, user, "recycle.purge", f"user:{rid}", get_client_ip(request))
        return

    a = await db.get(Activity, rid)
    if not a or not a.is_deleted:
        raise HTTPException(status_code=404, detail="回收站中不存在该活动")
    await db.execute(sa_delete(ActivityEnrol).where(ActivityEnrol.activity_id == rid))
    await db.delete(a)
    _log(db, user, "recycle.purge", f"activity:{rid}", get_client_ip(request))
