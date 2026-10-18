"""用户自定义徽章后台管理 API（/api/admin/users/{user_id}/badges）。

- 徽章纯 UI 展示装饰，与权限彻底解耦（业务鉴权永远读 role/permission_overrides）；
- 系统徽章不入库、只读（跟随 club_position/role 动态计算，app/core/badges.py）；
- 自定义徽章：单用户最多 3 枚 is_active；name 经 nh3 剥除全部 HTML（防 XSS）；
- 全部变更写审计日志（badge.create / badge.update / badge.delete / badge.reorder）。
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
import nh3

from app.core.audit import log_action
from app.core.badges import CUSTOM_BADGE_LIMIT, compute_system_badge_key
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.responses import ok
from app.db.models import User, UserBadge
from app.db.session import get_db
from app.schemas.badge import BadgeReorderIn, CustomBadgeIn, CustomBadgeUpdate

router = APIRouter(prefix="/api/admin/users", tags=["admin-badges"])


def _clean_name(raw: str) -> str:
    """徽章名称：剥除全部 HTML 标签/属性（防 XSS），保留纯文字与 emoji。"""
    return nh3.clean(raw, tags=set(), attributes={}).strip()


async def _load_target(db: AsyncSession, user_id: int) -> User:
    u = await db.get(User, user_id)
    if not u or u.is_deleted:
        raise HTTPException(status_code=404, detail="用户不存在")
    return u


def _custom_out(b: UserBadge) -> dict:
    return {
        "id": b.id,
        "type": "custom",
        "name": b.name,
        "emoji": b.emoji,
        "bg_color": b.bg_color,
        "text_color": b.text_color,
        "sort_order": b.sort_order,
        "is_active": b.is_active,
        "created_at": b.created_at,
        "updated_at": b.updated_at,
    }


async def _active_count(db: AsyncSession, user_id: int) -> int:
    return (await db.execute(
        select(func.count()).select_from(UserBadge).where(
            UserBadge.user_id == user_id, UserBadge.is_active.is_(True)
        )
    )).scalar_one()


@router.get("/{user_id}/badges")
async def list_badges(
    user_id: int,
    ctx: dict = Depends(require_permission("badges", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """徽章列表：系统徽章只读 key + 自定义徽章完整记录（含 inactive）。"""
    u = await _load_target(db, user_id)
    rows = (await db.execute(
        select(UserBadge)
        .where(UserBadge.user_id == user_id)
        .order_by(UserBadge.sort_order.asc(), UserBadge.id.asc())
    )).scalars().all()
    return ok(data={
        "system_key": compute_system_badge_key(u),
        "custom_limit": CUSTOM_BADGE_LIMIT,
        "custom": [_custom_out(b) for b in rows],
    })


@router.post("/{user_id}/badges", status_code=status.HTTP_201_CREATED)
async def create_badge(
    user_id: int,
    req: CustomBadgeIn,
    request: Request,
    ctx: dict = Depends(require_permission("badges", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """新增自定义徽章：active 已达 3 枚 → 409。"""
    await _load_target(db, user_id)
    if await _active_count(db, user_id) >= CUSTOM_BADGE_LIMIT:
        raise HTTPException(status_code=409, detail="自定义徽章已达上限（3 枚）")
    name = _clean_name(req.name)
    if not name:
        raise HTTPException(status_code=400, detail="徽章名称不能为空")
    max_sort = (await db.execute(
        select(func.max(UserBadge.sort_order)).where(UserBadge.user_id == user_id)
    )).scalar_one()
    b = UserBadge(
        user_id=user_id,
        name=name,
        emoji=req.emoji,
        bg_color=req.bg_color,
        text_color=req.text_color,
        sort_order=(max_sort or 0) + 1,
    )
    db.add(b)
    await db.flush()
    log_action(db, ctx, "badge.create", f"user:{user_id} badge:{b.id} name:{name}",
               get_client_ip(request))
    return ok(data=_custom_out(b))


# 注意：/reorder 必须先于 /{badge_id} 注册，否则 "reorder" 会被路径参数吞掉
@router.put("/{user_id}/badges/reorder")
async def reorder_badges(
    user_id: int,
    req: BadgeReorderIn,
    request: Request,
    ctx: dict = Depends(require_permission("badges", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """整体排序：提交该用户全部自定义徽章 id 的目标顺序（防交换式并发脏写）。"""
    await _load_target(db, user_id)
    rows = (await db.execute(
        select(UserBadge).where(UserBadge.user_id == user_id)
    )).scalars().all()
    by_id = {b.id: b for b in rows}
    if set(req.ids) != set(by_id.keys()):
        raise HTTPException(status_code=400, detail="排序数组与该用户徽章集合不一致")
    for idx, bid in enumerate(req.ids):
        by_id[bid].sort_order = idx
    await db.flush()
    log_action(db, ctx, "badge.reorder", f"user:{user_id} order:{req.ids}",
               get_client_ip(request))
    return ok(data={"ok": True})


@router.put("/{user_id}/badges/{badge_id}")
async def update_badge(
    user_id: int,
    badge_id: int,
    req: CustomBadgeUpdate,
    request: Request,
    ctx: dict = Depends(require_permission("badges", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """修改自定义徽章；is_active 由 False→True 时重新校验 3 枚上限。"""
    await _load_target(db, user_id)
    b = await db.get(UserBadge, badge_id)
    if not b or b.user_id != user_id:
        raise HTTPException(status_code=404, detail="徽章不存在")
    if req.is_active is True and not b.is_active:
        if await _active_count(db, user_id) >= CUSTOM_BADGE_LIMIT:
            raise HTTPException(status_code=409, detail="自定义徽章已达上限（3 枚）")
    if req.name is not None:
        name = _clean_name(req.name)
        if not name:
            raise HTTPException(status_code=400, detail="徽章名称不能为空")
        b.name = name
    if req.emoji is not None:
        b.emoji = req.emoji
    if req.bg_color is not None:
        b.bg_color = req.bg_color
    if req.text_color is not None:
        b.text_color = req.text_color
    if req.is_active is not None:
        b.is_active = req.is_active
    await db.flush()
    log_action(db, ctx, "badge.update", f"user:{user_id} badge:{badge_id}",
               get_client_ip(request))
    return ok(data=_custom_out(b))


@router.delete("/{user_id}/badges/{badge_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_badge(
    user_id: int,
    badge_id: int,
    request: Request,
    ctx: dict = Depends(require_permission("badges", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """删除自定义徽章（装饰性数据，物理删除即可）。"""
    await _load_target(db, user_id)
    b = await db.get(UserBadge, badge_id)
    if not b or b.user_id != user_id:
        raise HTTPException(status_code=404, detail="徽章不存在")
    await db.delete(b)
    log_action(db, ctx, "badge.delete", f"user:{user_id} badge:{badge_id} name:{b.name}",
               get_client_ip(request))
