"""全局 /api/admin/* 管理端强制门（P0 硬性规则）。

规范要求：全部 /admin/* 请求必须在后端全局中间件层强制校验
「已登录 && 管理员角色」，不满足直接拒绝 —— UI 隐藏入口只是表现层，
权限必须由后端强制执行，不能只依赖前端隐藏按钮或逐路由依赖。

本中间件做**粗粒度强制门**（JWT 签名 + 会话有效 + 账号可用 + 管理员级角色）；
细粒度校验（具体模块权限 / must_change_password / 实名验证）仍由各路由的
require_role / require_permission 依赖完成，两层防御互为兜底。

- 未登录 / 会话失效 → 401（统一响应壳 BizCode.UNAUTHORIZED）
- 已登录但非管理员级（member）→ 403（BizCode.FORBIDDEN）
- OPTIONS 预检与静态资源不受影响；仅拦截 /api/admin/ 前缀的业务请求
"""
from __future__ import annotations

from fastapi import Request

from app.core.bizcode import BizCode
from app.core.csrf import SESSION_COOKIE
from app.core.responses import fail
from app.core.security import Role, decode_token, is_admin_tier
from app.db.models import LoginSession, User
from app.db.session import async_session

ADMIN_PATH_PREFIX = "/api/admin/"

# 管理端当前会话缓存键（请求作用域，避免同请求内重复查库）
_SCOPE_KEY = "admin_gate_user_id"


async def admin_gate_middleware(request: Request, call_next):
    if not request.url.path.startswith(ADMIN_PATH_PREFIX) or request.method == "OPTIONS":
        return await call_next(request)

    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return fail(BizCode.UNAUTHORIZED)

    try:
        payload = decode_token(token)
    except Exception:
        return fail(BizCode.UNAUTHORIZED)
    jti, sub = payload.get("jti"), payload.get("sub")
    if not jti or not sub:
        return fail(BizCode.UNAUTHORIZED)

    # Break-Glass 应急会话：粗门只认 KV 会话条目（无 user_id，不查 users 表）
    if payload.get("bg") is True:
        from app.core.security import bg_session_get

        if not await bg_session_get(jti):
            return fail(BizCode.UNAUTHORIZED)
        return await call_next(request)

    # 角色以数据库为准（降权 / 软删 / 停用立即生效，不信任 token 中的 role）
    from datetime import datetime, timezone

    from sqlalchemy import select

    async with async_session() as db:
        sess = (await db.execute(
            select(LoginSession).where(LoginSession.session_id == jti)
        )).scalar_one_or_none()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if not sess or sess.revoked or now > sess.expires_at or str(sess.user_id) != str(sub):
            return fail(BizCode.UNAUTHORIZED)
        user = await db.get(User, sess.user_id)
        if not user or not user.is_active or user.is_deleted:
            return fail(BizCode.UNAUTHORIZED)
        if not is_admin_tier(Role(user.role.value)):
            return fail(BizCode.FORBIDDEN)

    request.state.__setattr__(_SCOPE_KEY, user.id)
    return await call_next(request)
