"""角色管理接口（V0.5.5 §3.2 + V0.6.3 需求7）。

内置 4 角色与自定义角色组统一存 custom_roles 表：
- 内置角色（builtin_key 非空）：super_admin 仅查看不可编辑删除；
  admin/editor/member 可编辑（矩阵保存）不可删除；
- 自定义角色组（builtin_key 为 NULL）：完整 CRUD，删除时关联 users.custom_role_id 置 NULL。

「角色管理」范围 = 角色卡片与三级权限矩阵（允许=[view,manage] / 只读=[view] / 拒绝=[]）
+ 管理指定用户的权限覆盖矩阵（users.permission_overrides JSON）。
覆盖写入复用现有用户更新端点（PUT /api/auth/users/{id}，仅 super_admin）。

权限：view = admin 及以上可进入页面；manage = 仅 super_admin（写入侧强制）。
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.middleware import get_client_ip
from app.core.permissions import (
    ALL_ACTIONS,
    PERMISSION_MODULES,
    ROLE_DEFAULTS,
    require_permission,
    resolve_role_permissions,
)
from app.core.security import Role
from app.db.models import CustomRole, User
from app.db.session import get_db

router = APIRouter(prefix="/api/admin/roles", tags=["roles"])

# 内置角色保护规则：super_admin 仅查看；其余内置可编辑不可删除
BUILTIN_KEYS = {r.value for r in Role}
PROTECTED_BUILTIN = Role.SUPER_ADMIN.value


class RoleDefOut(BaseModel):
    role: str
    user_count: int
    # 默认权限矩阵摘要：module -> actions（super_admin 恒全模块 view+manage，由端点补齐）
    default_modules: dict[str, list[str]]


class CustomRoleOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    permissions: dict[str, list[str]]
    user_count: int


class RolesOverviewOut(BaseModel):
    roles: list[RoleDefOut]
    modules: list[str]
    custom_roles: list[CustomRoleOut]


class OverrideUserOut(BaseModel):
    id: int
    username: str
    display_name: str | None = None
    role: str
    is_active: bool
    permission_overrides: dict[str, list[str]]

    model_config = {"from_attributes": True}


class CustomRoleUpsert(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=200)


class MatrixSavePayload(BaseModel):
    """三级矩阵批量保存：builtin = {role_key: {module: [actions]}}；
    custom = {role_id_str: {module: [actions]}}。super_admin 键拒绝。"""
    builtin: dict[str, dict[str, list[str]]] = Field(default_factory=dict)
    custom: dict[str, dict[str, list[str]]] = Field(default_factory=dict)

    @field_validator("builtin")
    @classmethod
    def _check_builtin(cls, v: dict) -> dict:
        for role_key, matrix in v.items():
            if role_key == PROTECTED_BUILTIN:
                raise ValueError("super_admin 角色仅查看，不可编辑")
            if role_key not in BUILTIN_KEYS:
                raise ValueError(f"未知内置角色：{role_key}")
            _check_matrix(matrix)
        return v

    @field_validator("custom")
    @classmethod
    def _check_custom(cls, v: dict) -> dict:
        for role_id_str, matrix in v.items():
            if not role_id_str.isdigit():
                raise ValueError(f"非法自定义角色 id：{role_id_str}")
            _check_matrix(matrix)
        return v


def _check_matrix(matrix: dict[str, list[str]]) -> None:
    """模块/动作白名单校验（field_validator 外复用）。"""
    for module, actions in matrix.items():
        if module not in PERMISSION_MODULES:
            raise ValueError(f"未知权限模块：{module}")
        if not isinstance(actions, list) or any(a not in ALL_ACTIONS for a in actions):
            raise ValueError(f"非法动作集合：{module}")


def _default_modules_for(role: Role, db_row: CustomRole | None) -> dict[str, list[str]]:
    """角色默认矩阵摘要：DB 行逐模块优先，缺失模块回落代码默认（复用共享 helper）。
    super_admin 恒全通过（has_permission 短路），展示层直接给全模块 view+manage。"""
    if role == Role.SUPER_ADMIN:
        return {m: ["manage", "view"] for m in PERMISSION_MODULES}
    return resolve_role_permissions(
        role.value, builtin_perms=(db_row.permissions if db_row else None),
    ) or {}


@router.get("", response_model=RolesOverviewOut)
async def get_roles_overview(
    user: dict = Depends(require_permission("roles", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """角色定义 + 各角色有效账号数 + 自定义角色组 + 权限模块清单（页面骨架数据）。"""
    rows = (await db.execute(
        select(User.role, func.count(User.id))
        .where(User.is_deleted.is_(False))
        .group_by(User.role)
    )).all()
    count_map = {r.value: c for r, c in rows}

    builtin_rows = (await db.execute(
        select(CustomRole).where(CustomRole.builtin_key.is_not(None))
    )).scalars().all()
    builtin_map = {r.builtin_key: r for r in builtin_rows}

    custom_rows = (await db.execute(
        select(CustomRole).where(CustomRole.builtin_key.is_(None)).order_by(CustomRole.id)
    )).scalars().all()
    custom_counts = dict((await db.execute(
        select(User.custom_role_id, func.count(User.id))
        .where(User.is_deleted.is_(False), User.custom_role_id.is_not(None))
        .group_by(User.custom_role_id)
    )).all())

    return RolesOverviewOut(
        roles=[
            RoleDefOut(
                role=role.value,
                user_count=count_map.get(role.value, 0),
                default_modules=_default_modules_for(role, builtin_map.get(role.value)),
            )
            for role in Role
        ],
        modules=list(PERMISSION_MODULES),
        custom_roles=[
            CustomRoleOut(
                id=r.id,
                name=r.name,
                description=r.description,
                permissions={m: sorted(set(a)) for m, a in (r.permissions or {}).items()},
                user_count=custom_counts.get(r.id, 0),
            )
            for r in custom_rows
        ],
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


# ---------- 自定义角色组 CRUD ----------
@router.post("/custom", response_model=CustomRoleOut)
async def create_custom_role(
    payload: CustomRoleUpsert,
    request: Request,
    user: dict = Depends(require_permission("roles", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """新建自定义角色组（权限在矩阵区配置，初始为空矩阵）。"""
    dup = (await db.execute(
        select(CustomRole).where(CustomRole.name == payload.name)
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=400, detail="角色组名称已存在")
    row = CustomRole(
        name=payload.name,
        builtin_key=None,
        description=payload.description,
        permissions={},
    )
    db.add(row)
    await db.flush()
    log_action(db, user, "roles.custom.create", target=row.name, ip=get_client_ip(request))
    await db.commit()
    return CustomRoleOut(
        id=row.id, name=row.name, description=row.description,
        permissions={}, user_count=0,
    )


@router.put("/custom/{role_id}", response_model=CustomRoleOut)
async def update_custom_role(
    role_id: int,
    payload: CustomRoleUpsert,
    request: Request,
    user: dict = Depends(require_permission("roles", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """编辑自定义角色组名称/描述（内置角色行不可通过此端点修改）。"""
    row = await db.get(CustomRole, role_id)
    if row is None or row.builtin_key is not None:
        raise HTTPException(status_code=404, detail="角色组不存在")
    dup = (await db.execute(
        select(CustomRole).where(CustomRole.name == payload.name, CustomRole.id != role_id)
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=400, detail="角色组名称已存在")
    row.name = payload.name
    row.description = payload.description
    log_action(db, user, "roles.custom.update", target=row.name, ip=get_client_ip(request))
    await db.commit()
    user_count = (await db.execute(
        select(func.count(User.id)).where(
            User.is_deleted.is_(False), User.custom_role_id == role_id
        )
    )).scalar_one()
    return CustomRoleOut(
        id=row.id, name=row.name, description=row.description,
        permissions={m: sorted(set(a)) for m, a in (row.permissions or {}).items()},
        user_count=user_count,
    )


@router.delete("/custom/{role_id}")
async def delete_custom_role(
    role_id: int,
    request: Request,
    user: dict = Depends(require_permission("roles", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """删除自定义角色组：关联 users.custom_role_id 置 NULL（账号回落内置角色矩阵）。"""
    row = await db.get(CustomRole, role_id)
    if row is None or row.builtin_key is not None:
        raise HTTPException(status_code=404, detail="角色组不存在")
    name = row.name
    await db.execute(
        update(User).where(User.custom_role_id == role_id).values(custom_role_id=None)
    )
    await db.delete(row)
    log_action(db, user, "roles.custom.delete", target=name, ip=get_client_ip(request))
    await db.commit()
    return {"ok": True}


# ---------- 三级权限矩阵批量保存 ----------
@router.put("/matrix")
async def save_roles_matrix(
    payload: MatrixSavePayload,
    request: Request,
    user: dict = Depends(require_permission("roles", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """原子批量保存内置角色与自定义角色组的权限矩阵（保存实时生效）。

    内置角色仅 admin/editor/member 可写（super_admin 由 validator 拒绝）；
    自定义角色组按 id 写入，内置角色行不可通过 custom 键写入。
    """
    touched: list[str] = []
    for role_key, matrix in payload.builtin.items():
        row = (await db.execute(
            select(CustomRole).where(CustomRole.builtin_key == role_key)
        )).scalar_one_or_none()
        if row is None:
            # 内置角色行缺失（seed 未跑过的存量库异常态）→ 自动补建行
            row = CustomRole(
                name=f"builtin:{role_key}", builtin_key=role_key,
                description=None, permissions={},
            )
            db.add(row)
            await db.flush()
        row.permissions = matrix
        touched.append(f"builtin:{role_key}")
    for role_id_str, matrix in payload.custom.items():
        row = await db.get(CustomRole, int(role_id_str))
        if row is None or row.builtin_key is not None:
            raise HTTPException(status_code=404, detail=f"角色组不存在：{role_id_str}")
        row.permissions = matrix
        touched.append(f"custom:{role_id_str}")
    log_action(
        db, user, "roles.matrix.save",
        detail=f"保存角色矩阵：{', '.join(touched)}" if touched else "保存角色矩阵（无变更）",
        ip=get_client_ip(request),
    )
    await db.commit()
    return {"ok": True}
