"""界面主题接口（新壳：ok() / BizException）。

公开接口：已启用主题列表（前台主题选择器消费，无需登录）。
管理接口：主题 CRUD（软删除），权限模块 themes；key 全局唯一（含软删行，
因 DB 唯一约束占用），删除走软删除 + 定时任务 30 天物理清除。
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.bizcode import BizCode
from app.core.exceptions import BizException
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.responses import ok
from app.db.models import Theme, ThemeLayout
from app.db.session import get_db
from app.schemas.theme import ThemeCreate, ThemeOut, ThemeUpdate

# 公开接口（无鉴权）
public_router = APIRouter(prefix="/api/themes", tags=["themes-public"])
# 管理接口（需 themes 权限）
admin_router = APIRouter(prefix="/api/admin/themes", tags=["themes-admin"])

# 内置主题 key 禁止删除/停用（前端防 FOUC 兜底依赖）
_BUILTIN_KEYS = ("default", "apple")


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _out(t: Theme) -> dict:
    return ThemeOut.model_validate(t).model_dump(mode="json")


async def _get_or_404(db: AsyncSession, theme_id: int) -> Theme:
    t = await db.get(Theme, theme_id)
    if not t or t.is_deleted:
        raise BizException(BizCode.NOT_FOUND, data={"detail": "主题不存在"})
    return t


# ==================== 公开接口 ====================

@public_router.get("")
async def list_public_themes(db: AsyncSession = Depends(get_db)):
    """已启用主题列表：sort_order 升序 + id 升序（前台主题选择器 / ThemeProvider 消费）。"""
    rows = (await db.execute(
        select(Theme)
        .where(Theme.enabled.is_(True), Theme.is_deleted.is_(False))
        .order_by(Theme.sort_order.asc(), Theme.id.asc())
    )).scalars().all()
    return ok(data=[_out(t) for t in rows])


# ==================== 管理接口 ====================

@admin_router.get("")
async def admin_list_themes(
    user: dict = Depends(require_permission("themes", "view")),
    db: AsyncSession = Depends(get_db),
):
    """全部未删除主题（含停用），sort_order 升序 + id 升序。"""
    rows = (await db.execute(
        select(Theme)
        .where(Theme.is_deleted.is_(False))
        .order_by(Theme.sort_order.asc(), Theme.id.asc())
    )).scalars().all()
    return ok(data=[_out(t) for t in rows])


@admin_router.post("")
async def admin_create_theme(
    req: ThemeCreate,
    request: Request,
    user: dict = Depends(require_permission("themes", "manage")),
    db: AsyncSession = Depends(get_db),
):
    # key 全局唯一（含软删行：DB 唯一约束仍占用）
    exists = (await db.execute(
        select(Theme).where(Theme.key == req.key)
    )).scalar_one_or_none()
    if exists:
        raise BizException(BizCode.CONFLICT, data={"detail": "主题 key 已存在（含已删除主题）"})
    t = Theme(
        key=req.key,
        name=req.name,
        layout=ThemeLayout(req.layout),
        css_vars=req.css_vars,
        dark_vars=req.dark_vars,
        enabled=req.enabled,
        sort_order=req.sort_order,
    )
    db.add(t)
    await db.flush()
    log_action(db, user, "theme.create", f"theme:{t.id}", ip=get_client_ip(request))
    await db.commit()
    await db.refresh(t)
    return ok(data=_out(t))


@admin_router.patch("/{theme_id}")
async def admin_update_theme(
    theme_id: int,
    req: ThemeUpdate,
    request: Request,
    user: dict = Depends(require_permission("themes", "manage")),
    db: AsyncSession = Depends(get_db),
):
    t = await _get_or_404(db, theme_id)
    data = req.model_dump(exclude_unset=True)
    # 内置主题禁止停用（前端防 FOUC 兜底依赖）
    if t.key in _BUILTIN_KEYS and data.get("enabled") is False:
        raise BizException(BizCode.BAD_REQUEST, data={"detail": "内置主题禁止停用"})
    if "layout" in data and data["layout"] is not None:
        t.layout = ThemeLayout(data.pop("layout"))
    for k in ("name", "css_vars", "dark_vars", "enabled", "sort_order"):
        if k in data:
            setattr(t, k, data[k])
    log_action(db, user, "theme.update", f"theme:{t.id}", ip=get_client_ip(request))
    await db.commit()
    await db.refresh(t)
    return ok(data=_out(t))


@admin_router.delete("/{theme_id}")
async def admin_delete_theme(
    theme_id: int,
    request: Request,
    user: dict = Depends(require_permission("themes", "manage")),
    db: AsyncSession = Depends(get_db),
):
    t = await _get_or_404(db, theme_id)
    if t.key in _BUILTIN_KEYS:
        raise BizException(BizCode.BAD_REQUEST, data={"detail": "内置主题禁止删除"})
    log_action(db, user, "theme.delete", f"theme:{t.id}", ip=get_client_ip(request))
    t.is_deleted = True
    t.deleted_at = _utcnow_naive()
    await db.commit()
    return ok(data=None)
