"""统一审计写入与请求上下文辅助（底层基础设施，与上层业务无关）。

Break-Glass 应急账号约定：
- ctx 无 user_id（会话只存布尔标记），审计操作者固定为 [BREAK_GLASS_ESCAPE]；
- AuditLog.user_id 保持 NULL，严禁把 BG 写成任何虚拟 users 行；
- 普通账号审计照旧写 user_id（actor 为 None，展示层回落用户名）。

ctx_uid(ctx)：从认证依赖返回的 ctx 提取 user_id；BG → None。
所有原 `_log(db, int(user["user_id"]), ...)` 与「创建者归属」字段
（created_by / author_id / uploader_id 等，列均 nullable）统一改走本模块，
避免 BG 请求触发 int(None) 崩溃，也保证审计无痕禁令（全部操作可查）。
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditLog

# Break-Glass 审计操作者固定字符串（需求硬性规定，严禁填写 user_id）
BREAK_GLASS_ACTOR = "[BREAK_GLASS_ESCAPE]"


def is_break_glass(ctx: dict | None) -> bool:
    """请求上下文是否来自 Break-Glass 应急会话。"""
    return bool(ctx and ctx.get("break_glass"))


def ctx_uid(ctx: dict | None) -> int | None:
    """提取数字 user_id；BG 会话返回 None（审计 user_id=NULL，actor=BREAK_GLASS_ACTOR）。"""
    if is_break_glass(ctx):
        return None
    raw = (ctx or {}).get("user_id")
    return int(raw) if raw is not None else None


def ctx_actor(ctx: dict | None) -> str | None:
    """提取审计操作者展示标识：BG → [BREAK_GLASS_ESCAPE]；普通账号 → None（前端回落用户名）。"""
    return BREAK_GLASS_ACTOR if is_break_glass(ctx) else None


def log_action(
    db: AsyncSession,
    ctx_or_uid: dict | int | None,
    action: str,
    detail: str | None = None,
    ip: str | None = None,
    *,
    target: str | None = None,
) -> None:
    """统一审计写入（随调用方事务提交，不自行 commit）。

    ctx_or_uid 支持三种形态：
    - dict（认证 ctx）：自动区分 BG / 普通账号；
    - int / None：沿用旧 _log 语义（匿名登录失败等场景 user_id=NULL）。

    ip 兼容旧版第 5 位置参数调用；target 仅接受关键字传参。
    """
    if isinstance(ctx_or_uid, dict):
        uid = ctx_uid(ctx_or_uid)
        actor = ctx_actor(ctx_or_uid)
    else:
        uid = ctx_or_uid
        actor = None
    db.add(AuditLog(
        user_id=uid,
        actor=actor,
        action=action,
        detail=detail,
        ip=ip,
        target=target,
    ))
