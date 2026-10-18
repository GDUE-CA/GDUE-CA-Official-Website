"""角色管理接口（V0.5.5 §3.2）。

角色与默认权限矩阵为代码内置（core/permissions.py ROLE_DEFAULTS），不提供角色 CRUD；
「角色管理」范围 = 查看 4 角色定义与成员分布 + 管理指定用户的权限覆盖矩阵
（users.permission_overrides JSON）。覆盖写入复用现有用户更新端点
（PUT /api/auth/users/{id}，仅 super_admin），并写专门审计 user.permission_overrides。

权限：view = admin 及以上可进入页面；manage = 仅 super_admin（写入侧强制）。
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import PERMISSION_MODULES, ROLE_DEFAULTS, require_permission
from app.core.security import Role
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/api/admin/roles", tags=["roles"])


class RoleDefOut(BaseModel):
    role: str
    user_count: int
    # 默认权限矩阵摘要：module -> actions（super_admin 恒全模块 view+manage，由端点补齐）
    default_modules: dict[str, list[str]]


class RolesOverviewOut(BaseModel):
    roles: list[RoleDefOut]
    modules: list[str]


class OverrideUserOut(BaseModel):
    id: int
    username: str
    display_name: str | None = None
    role: str
    is_active: bool
    permission_overrides: dict[str, list[str]]

    model_config = {"from_attributes": True}


def _default_modules_for(role: Role) -> dict[str, list[str]]:
    """角色默认矩阵摘要。super_admin 恒全通过（has_permission 短路），
    展示层直接给全模块 view+manage，与运行时语义一致。"""
    if role == Role.SUPER_ADMIN:
        return {m: ["manage", "view"] for m in PERMISSION_MODULES}
    out: dict[str, list[str]] = {}
    for module, per_role in ROLE_DEFAULTS.items():
        actions = per_role.get(role)
        if actions:
            out[module] = sorted(actions)
    return out


@router.get("", response_model=RolesOverviewOut)
async def get_roles_overview(
    user: dict = Depends(require_permission("roles", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """角色定义 + 各角色有效账号数 + 权限模块清单（页面骨架数据）。"""
    rows = (await db.execute(
        select(User.role, func.count(User.id))
        .where(User.is_deleted.is_(False))
        .group_by(User.role)
    )).all()
    count_map = {r.value: c for r, c in rows}
    return RolesOverviewOut(
        roles=[
            RoleDefOut(
                role=role.value,
                user_count=count_map.get(role.value, 0),
                default_modules=_default_modules_for(role),
            )
            for role in Role
        ],
        modules=list(PERMISSION_MODULES),
    )


@router.get("/overrides", response_model=list[OverrideUserOut])
async def list_override_users(
    user: dict = Depends(require_permission("roles", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """列出所有配置了权限覆盖矩阵的账号（软删除账号除外）。"""
    rows = (await db.execute(
        select(User)
        .where(User.permission_overrides.is_not(None), User.is_deleted.is_(False))
        .order_by(User.id)
    )).scalars().all()
    return rows
