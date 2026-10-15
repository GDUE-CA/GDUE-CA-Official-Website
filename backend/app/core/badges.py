"""用户徽章组装核心（底层通用，零业务硬编码）。

- 系统内置徽章：不入库，每次请求按 club_position / role 动态计算，只输出 key
  （emoji / 文案由前端 i18n 渲染，后端不写死任何展示文字）；
- 自定义徽章：存 user_badges 表，由管理员维护，单用户最多 3 枚 is_active；
- 徽章仅用于 UI 展示装饰，业务鉴权永远读 role / permission_overrides，
  严禁任何代码拿徽章做权限判断。
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import Role, is_admin_tier
from app.db.models import User, UserBadge

# 单用户 is_active 自定义徽章上限
CUSTOM_BADGE_LIMIT = 3

# 合法职务值（schema 层校验复用）
CLUB_POSITIONS = ("president", "vice_president", "member")


def compute_system_badge_key(user: User) -> str | None:
    """按职务 / 角色计算最高优先级系统徽章 key；外部用户返回 None。

    优先级（同用户多身份只取最高一枚，不堆叠）：
    president > vice_president > admin（管理 tier）> member
    """
    if user.club_position == "president":
        return "president"
    if user.club_position == "vice_president":
        return "vice_president"
    if is_admin_tier(Role(user.role)):
        return "admin"
    if user.club_position == "member":
        return "member"
    return None


def is_club_member(user: User) -> bool:
    """在册社团成员判定：有职务（president/vice_president/member）或管理 tier 角色。"""
    return bool(user.club_position) or is_admin_tier(Role(user.role))


async def batch_user_badges(
    db: AsyncSession, user_ids: list[int] | set[int]
) -> dict[int, list[dict]]:
    """批量取自定义徽章：一次 in_ 查询按 user_id 归组（防 N+1）。

    返回 {user_id: [badge_dict, ...]}，按 sort_order 升序、id 升序。
    """
    ids = list({i for i in user_ids if i})
    if not ids:
        return {}
    rows = (await db.execute(
        select(UserBadge)
        .where(UserBadge.user_id.in_(ids), UserBadge.is_active.is_(True))
        .order_by(UserBadge.sort_order.asc(), UserBadge.id.asc())
    )).scalars().all()
    grouped: dict[int, list[dict]] = {}
    for b in rows:
        grouped.setdefault(b.user_id, []).append({
            "type": "custom",
            "id": b.id,
            "name": b.name,
            "emoji": b.emoji,
            "bg_color": b.bg_color,
            "text_color": b.text_color,
        })
    return grouped


def assemble_badges(system_key: str | None, custom_list: list[dict]) -> list[dict]:
    """合并徽章数组：系统徽章固定最前 + 自定义徽章按序。"""
    out: list[dict] = []
    if system_key:
        out.append({"type": "system", "key": system_key})
    out.extend(custom_list)
    return out


async def badges_for_users(
    db: AsyncSession, users: list[User]
) -> dict[int, list[dict]]:
    """一批用户的完整徽章数组：{user_id: [系统徽章?, 自定义徽章...]}。"""
    custom = await batch_user_badges(db, [u.id for u in users])
    return {
        u.id: assemble_badges(compute_system_badge_key(u), custom.get(u.id, []))
        for u in users
    }


async def badges_for_user(db: AsyncSession, user: User) -> list[dict]:
    """单用户完整徽章数组（系统 + 自定义）。"""
    custom = await batch_user_badges(db, [user.id])
    return assemble_badges(compute_system_badge_key(user), custom.get(user.id, []))
