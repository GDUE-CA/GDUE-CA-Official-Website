"""模块级权限矩阵与 require_permission 依赖。

7 个后台模块 × view / manage 两个动作；角色默认矩阵严格对齐既有
require_role 依赖分布，可按账号通过 users.permission_overrides 覆盖
（override 为该模块的完整动作列表，可增可减，null 模块键回落角色默认）。

硬门槛不下放：删除活动仍需 ADMIN 角色；账号创建 / 删除 / 改角色 / 重置密码
仍需 SUPER_ADMIN（见各 API 模块内 require_role 调用）。
"""
from enum import Enum

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import Role, _authenticate, is_admin_tier
from app.db.session import get_db


class PermAction(str, Enum):
    VIEW = "view"
    MANAGE = "manage"


ALL_ACTIONS = ("view", "manage")

# 合法模块集合（覆盖 overrides 时用于拒绝未知模块键）
# 现有 7 模块 + CMS 扩展 14 模块（13 内容/安全/登录/统计 + audit_logs）
PERMISSION_MODULES = (
    "dashboard",
    "activities",
    "review.registrations",
    "review.bugs",
    "review.resets",
    "settings",
    "users",
    # ---------- CMS 扩展 ----------
    "announcements",   # 信息通知 + 主页公告
    "content",         # 社团介绍/招新信息等富文本内容块
    "members",         # 成员管理（现任/往届/归档）
    "recruitment",     # 招新信息 + 报名名单
    "blog",            # 博客文章
    "blog_tags",       # 博客标签
    "projects",        # 项目展示 CMS
    "themes",          # 界面主题（CSS 变量包 + 布局骨架，manage 可上传/启停/删除）
    "comments",        # 评论管理（软删除/下架）
    "media",           # 文件资源统一管理
    "security",        # IP 黑白名单 + 监听配置（manage 仅 super_admin）
    "oauth",           # 第三方登录渠道配置（manage 仅 super_admin）
    "sso",             # SSO 受信应用配置（manage 仅 super_admin）
    "realname",        # 账号实名状态管理（manage 仅 super_admin）
    "stats",           # 数据统计
    "audit_logs",      # 操作日志
    # ---------- Phase 8 Memo 碎片笔记 ----------
    "memo",            # Memo 后台管理（浏览全部 / 下架 / 恢复）；普通成员 view 仅自己可见范围
)

# 角色默认矩阵：module -> role -> 允许的动作集合（member 无后台权限，不列出）
# 约定：super_admin 恒全通过（has_permission 短路）；admin 对内容类 view+manage，
# 对安全/登录/实名类仅 view（manage 留给 super_admin）；editor 对内容类 view+manage，其余 view。
ROLE_DEFAULTS: dict[str, dict[Role, set[str]]] = {
    "dashboard": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view"},
        Role.EDITOR: {"view"},
    },
    "activities": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
        Role.EDITOR: {"view", "manage"},
    },
    "review.registrations": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
    },
    "review.bugs": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
        Role.EDITOR: {"view"},
    },
    "review.resets": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
    },
    "settings": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
    },
    "users": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view"},
        Role.EDITOR: {"view"},
    },
    # ---------- CMS 扩展：内容类（admin/editor 均可 view+manage） ----------
    "announcements": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
        Role.EDITOR: {"view", "manage"},
    },
    "content": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
        Role.EDITOR: {"view", "manage"},
    },
    "members": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
        Role.EDITOR: {"view", "manage"},
    },
    "recruitment": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
        Role.EDITOR: {"view", "manage"},
    },
    "blog": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
        Role.EDITOR: {"view", "manage"},
    },
    "blog_tags": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
        Role.EDITOR: {"view", "manage"},
    },
    "projects": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
        Role.EDITOR: {"view", "manage"},
    },
    # 主题：内容类配置，admin 可管理；editor 不参与
    "themes": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
    },
    "media": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
        Role.EDITOR: {"view", "manage"},
    },
    # ---------- 评论：admin 可管理，editor 仅查看 ----------
    "comments": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
        Role.EDITOR: {"view"},
    },
    # ---------- 安全/登录/实名：admin 仅 view，manage 留 super_admin ----------
    "security": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view"},
        Role.EDITOR: {"view"},
    },
    "oauth": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view"},
        Role.EDITOR: {"view"},
    },
    "sso": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view"},
        Role.EDITOR: {"view"},
    },
    "realname": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view"},
        Role.EDITOR: {"view"},
    },
    # ---------- 统计/日志：admin+editor 可查看 ----------
    "stats": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view"},
        Role.EDITOR: {"view"},
    },
    "audit_logs": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view"},
        Role.EDITOR: {"view"},
    },
    # ---------- Memo：admin/editor 可 manage（下架/恢复/全量浏览） ----------
    "memo": {
        Role.SUPER_ADMIN: {"view", "manage"},
        Role.ADMIN: {"view", "manage"},
        Role.EDITOR: {"view", "manage"},
    },
}


def has_permission(role_value: str, overrides: dict | None, module: str, action: str) -> bool:
    """判定有效权限：super_admin 恒通过；override 命中模块则完全替代默认矩阵。"""
    if role_value == Role.SUPER_ADMIN.value:
        return True
    if overrides and module in overrides:
        actions = overrides[module]
        return isinstance(actions, list) and action in actions
    role = Role(role_value)
    return action in ROLE_DEFAULTS.get(module, {}).get(role, set())


def require_permission(module: str, action: str):
    """模块级权限依赖：登录 + 会话校验同 require_role，再按矩阵判定有效权限。

    覆盖矩阵存于 users.permission_overrides（JSON，仅 super_admin 可写），
    每次请求实时读取，权限变更即时生效。
    """
    async def _dep(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
        ctx, user = await _authenticate(request, db)
        # Break-Glass：绕过 RBAC 权限校验（含 must_change_password / 实名门槛）
        if ctx.get("break_glass"):
            return ctx
        if not has_permission(ctx["role"], user.permission_overrides, module, action):
            raise HTTPException(status_code=403, detail="权限不足")
        if user.must_change_password:
            raise HTTPException(status_code=403, detail="请先修改初始密码",
                                headers={"X-Password-Change-Required": "1"})
        # 实名验证（Phase 6）：与 require_role 同一门槛（super_admin 豁免防死锁）
        role = Role(ctx["role"])
        if is_admin_tier(role) and role != Role.SUPER_ADMIN and not user.realname_verified:
            raise HTTPException(status_code=403, detail="请先完成实名验证",
                                headers={"X-Realname-Required": "1"})
        return ctx
    return _dep
