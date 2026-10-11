"""CSRF 防护：双重提交令牌（Double Submit Cookie）+ Origin/Referer 来源校验。

登录态保存在 HttpOnly + SameSite=Strict 的 Cookie 中，浏览器会自动携带，
因此所有写操作（POST/PUT/PATCH/DELETE）必须同时满足：
1. 请求头 X-CSRF-Token 与 Cookie gdueca_csrf 的值一致（第三方站点无法读取该值）
2. 若带 Origin / Referer，其主机必须是本站或 CORS_ORIGINS 白名单

前端先 GET /api/auth/csrf 获取令牌（同时下发 Cookie），之后写请求带上请求头。
"""
import logging
import secrets
from typing import Awaitable, Callable
from urllib.parse import urlsplit

from fastapi import Request, Response
from fastapi.responses import JSONResponse

from app.core.bizcode import BizCode
from app.core.config import get_settings
from app.core.middleware import get_request_host, is_https
from app.core.responses import fail

logger = logging.getLogger("gdueca.security")

CSRF_COOKIE = "gdueca_csrf"
CSRF_HEADER = "x-csrf-token"
SESSION_COOKIE = "gdueca_session"
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
# CSRF 豁免路径：非浏览器上下文、有独立认证方式的写接口
# （/api/sso/token 由受信应用后端以 client_secret 调用，无浏览器 Cookie 参与）
CSRF_EXEMPT_PATHS = {"/api/sso/token"}


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def cookie_secure(request: Request) -> bool:
    mode = get_settings().COOKIE_SECURE.strip().lower()
    if mode in ("true", "1", "yes"):
        return True
    if mode in ("false", "0", "no"):
        return False
    return is_https(request)


def set_csrf_cookie(response: Response, request: Request, token: str) -> None:
    response.set_cookie(
        CSRF_COOKIE,
        token,
        httponly=True,
        secure=cookie_secure(request),
        samesite="strict",
        path="/",
    )


def _origin_allowed(request: Request) -> bool:
    origin = request.headers.get("origin")
    if not origin:
        referer = request.headers.get("referer")
        if not referer:
            return True  # 无来源信息时由令牌兜底
        parts = urlsplit(referer)
        origin = f"{parts.scheme}://{parts.netloc}"
    if origin == "null":
        return False
    if origin.rstrip("/") in get_settings().cors_origins_list:
        return True
    origin_host = (urlsplit(origin).hostname or "").lower()
    return bool(origin_host) and origin_host == get_request_host(request).lower()


def _reject(detail: str) -> JSONResponse:
    """CSRF 校验失败返回新壳 code=1008；前端按规范读取 message.i18n_key 渲染。"""
    # detail 仅写日志（便于排查），不直接外泄给前端
    logger.info("CSRF 校验失败：%s", detail)
    return fail(BizCode.CSRF_FAILED, params={"reason": detail})


async def csrf_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    if request.method in _SAFE_METHODS or not request.url.path.startswith("/api/"):
        return await call_next(request)

    # 有独立认证方式的非浏览器写接口（如 SSO token 端点用 client_secret）
    if request.url.path in CSRF_EXEMPT_PATHS:
        return await call_next(request)

    # 纯 Bearer Token 调用（脚本 / 第三方客户端，非浏览器自动携带凭据）不受 CSRF 影响
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer ") and SESSION_COOKIE not in request.cookies:
        return await call_next(request)

    if not _origin_allowed(request):
        return _reject("请求来源不合法")

    cookie_token = request.cookies.get(CSRF_COOKIE, "")
    header_token = request.headers.get(CSRF_HEADER, "")
    if not cookie_token or not header_token or not secrets.compare_digest(cookie_token, header_token):
        return _reject("CSRF 校验失败，请刷新页面后重试")
    return await call_next(request)
