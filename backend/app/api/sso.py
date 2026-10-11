"""自建 SSO 单点登录授权服务器（OAuth 2.0 授权码模式）+ 受信应用管理。

端点：
- GET  /api/sso/authorize：受信应用发起授权（用户已登录则签发授权码 302 回跳，
  未登录 302 到 /admin/login?next= 回来后重新授权）
- POST /api/sso/token：授权码 + client_secret 换 access_token（JWT，1 小时）
- GET  /api/sso/userinfo：Bearer access_token 换用户信息（最小化字段）

安全要点：
- 授权码为签名 JWT（5 分钟）+ 内存 jti 已用集合防重放（一次性）
- client_secret 仅创建 / 重置时明文返回一次，库中 bcrypt 哈希
- redirect_uri 严格精确匹配白名单；client 停用后所有流程拒绝
- /api/sso/token 在 CSRF 中间件豁免列表中（非浏览器上下文，client_secret 认证）
"""
import secrets as py_secrets
import time
import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
from jose import jwt as jose_jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.csrf import SESSION_COOKIE
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.security import Role, decode_token, hash_password, verify_password
from app.db.models import AuditLog, SsoClient, User
from app.db.session import get_db
from app.schemas.sso import (
    SsoClientCreate,
    SsoClientOut,
    SsoClientUpdate,
    SsoTokenResponse,
    SsoUserInfo,
)

public_router = APIRouter(prefix="/api/sso", tags=["sso-public"])
admin_router = APIRouter(prefix="/api/admin/sso", tags=["sso-admin"])
settings = get_settings()

CODE_TTL = 300        # 授权码 5 分钟
ACCESS_TTL = 3600     # access_token 1 小时
# 已使用的授权码 jti（防重放；重启清零，重启后旧码也因 JWT 无状态需重放集合——
# 用 jti + 过期时间清理，防内存膨胀）
_used_code_jti: dict[str, float] = {}


def _log(db: AsyncSession, user_id: int | None, action: str, detail: str | None, ip: str | None):
    db.add(AuditLog(user_id=user_id, action=action, detail=detail, ip=ip))


def _sign(data: dict, ttl: int, typ: str) -> str:
    now = int(time.time())
    return jose_jwt.encode(
        {**data, "typ": typ, "iat": now, "exp": now + ttl,
         "jti": uuid.uuid4().hex},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def _decode_typed(token: str, typ: str) -> dict:
    try:
        payload = jose_jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except Exception:
        raise HTTPException(status_code=400, detail="凭证无效或已过期")
    if payload.get("typ") != typ:
        raise HTTPException(status_code=400, detail="凭证类型错误")
    return payload


def _client_secret() -> str:
    return "sc_" + py_secrets.token_urlsafe(24)


def _client_out(c: SsoClient, plain_secret: str | None = None) -> SsoClientOut:
    return SsoClientOut(
        id=c.id, client_id=c.client_id, name=c.name,
        redirect_uris=c.redirect_uris or [], is_active=c.is_active,
        created_at=c.created_at, secret=plain_secret,
    )


async def _active_client_or_404(db: AsyncSession, client_id: str) -> SsoClient:
    c = (await db.execute(
        select(SsoClient).where(SsoClient.client_id == client_id)
    )).scalar_one_or_none()
    if not c or not c.is_active:
        raise HTTPException(status_code=401, detail="无效的 client_id")
    return c


# ==================== 授权端点 ====================

@public_router.get("/authorize")
async def authorize(
    request: Request,
    response_type: str,
    client_id: str,
    redirect_uri: str,
    state: str | None = None,
    scope: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """SSO 授权端点：需站内登录态（浏览器 Cookie）。

    未登录 → 302 /admin/login?next=当前授权 URL（登录后回来重新发起）。
    """
    if response_type != "code":
        raise HTTPException(status_code=400, detail="仅支持 response_type=code")
    client = await _active_client_or_404(db, client_id)
    if redirect_uri not in (client.redirect_uris or []):
        raise HTTPException(status_code=400, detail="redirect_uri 不在白名单内")

    # 校验登录态：复用会话 Cookie 解码 + 会话有效性
    token = request.cookies.get(SESSION_COOKIE)
    user_ctx: dict | None = None
    if token:
        try:
            payload = decode_token(token)
            user_ctx = {"uid": int(payload["sub"])}
        except HTTPException:
            user_ctx = None
    if not user_ctx:
        # 未登录：跳登录页并携带回跳地址
        back = f"/api/sso/authorize?response_type=code&client_id={quote(client_id, safe='')}" \
               f"&redirect_uri={quote(redirect_uri, safe='')}" \
               + (f"&state={quote(state, safe='')}" if state else "")
        return RedirectResponse(f"/admin/login?next={quote(back, safe='')}", status_code=302)

    user = await db.get(User, user_ctx["uid"])
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="账号不可用")

    code = _sign({"cid": client_id, "uid": user.id}, CODE_TTL, "sso_code")
    _log(db, user.id, "sso.authorize", f"client:{client_id}", get_client_ip(request))
    await db.commit()
    sep = "&" if "?" in redirect_uri else "?"
    target = f"{redirect_uri}{sep}code={quote(code, safe='')}"
    if state:
        target += f"&state={quote(state, safe='')}"
    return RedirectResponse(target, status_code=302)


# ==================== Token 端点（CSRF 豁免，见 core/csrf.py） ====================

@public_router.post("/token", response_model=SsoTokenResponse)
async def token_endpoint(
    grant_type: str = Form(...),
    code: str = Form(...),
    client_id: str = Form(...),
    client_secret: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """授权码换 access_token：client_secret bcrypt 校验 + 授权码一次性防重放。"""
    if grant_type != "authorization_code":
        raise HTTPException(status_code=400, detail="仅支持 grant_type=authorization_code")
    client = await _active_client_or_404(db, client_id)
    if not verify_password(client_secret, client.client_secret_hash):
        raise HTTPException(status_code=401, detail="client_secret 错误")

    payload = _decode_typed(code, "sso_code")
    if payload.get("cid") != client_id:
        raise HTTPException(status_code=400, detail="授权码与 client_id 不匹配")
    jti = payload.get("jti", "")
    now = time.time()
    # 清理过期 jti，防内存膨胀
    for k in [k for k, v in _used_code_jti.items() if v < now]:
        _used_code_jti.pop(k, None)
    if jti in _used_code_jti:
        raise HTTPException(status_code=400, detail="授权码已被使用")
    _used_code_jti[jti] = now + CODE_TTL

    access = _sign({"cid": client_id, "uid": payload["uid"]}, ACCESS_TTL, "sso_access")
    return SsoTokenResponse(access_token=access, expires_in=ACCESS_TTL)


# ==================== 用户信息端点 ====================

@public_router.get("/userinfo", response_model=SsoUserInfo)
async def userinfo(request: Request, db: AsyncSession = Depends(get_db)):
    """Bearer access_token → 用户最小信息。"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少 Bearer token")
    payload = _decode_typed(auth[7:], "sso_access")
    user = await db.get(User, int(payload["uid"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="账号不可用")
    return SsoUserInfo(
        sub=str(user.id), username=user.username,
        role=Role(user.role.value).value, realname_verified=user.realname_verified,
    )


# ==================== 管理接口 ====================

@admin_router.get("/clients", response_model=list[SsoClientOut])
async def list_clients(
    user: dict = Depends(require_permission("sso", "view")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(SsoClient).order_by(SsoClient.created_at.desc())
    )).scalars().all()
    return [_client_out(c) for c in rows]


@admin_router.post("/clients", response_model=SsoClientOut, status_code=201)
async def create_client(
    req: SsoClientCreate,
    request: Request,
    user: dict = Depends(require_permission("sso", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """创建受信应用：client_id 自动生成，client_secret 明文仅本次返回。"""
    client_id = "gd_" + py_secrets.token_urlsafe(12)
    secret = _client_secret()
    c = SsoClient(
        client_id=client_id,
        client_secret_hash=hash_password(secret),
        name=req.name,
        redirect_uris=req.redirect_uris,
        is_active=True,
    )
    db.add(c)
    _log(db, int(user["user_id"]), "sso.client.create", f"client:{client_id}",
         get_client_ip(request))
    await db.commit()
    await db.refresh(c)
    return _client_out(c, plain_secret=secret)


@admin_router.put("/clients/{client_row_id}", response_model=SsoClientOut)
async def update_client(
    client_row_id: int,
    req: SsoClientUpdate,
    request: Request,
    user: dict = Depends(require_permission("sso", "manage")),
    db: AsyncSession = Depends(get_db),
):
    c = await db.get(SsoClient, client_row_id)
    if not c:
        raise HTTPException(status_code=404, detail="应用不存在")
    if req.name is not None:
        c.name = req.name
    if req.redirect_uris is not None:
        if not req.redirect_uris:
            raise HTTPException(status_code=400, detail="redirect_uris 不能为空")
        c.redirect_uris = req.redirect_uris
    if req.is_active is not None:
        c.is_active = req.is_active
    _log(db, int(user["user_id"]), "sso.client.update", f"client:{c.client_id}",
         get_client_ip(request))
    await db.commit()
    await db.refresh(c)
    return _client_out(c)


@admin_router.post("/clients/{client_row_id}/reset-secret", response_model=SsoClientOut)
async def reset_client_secret(
    client_row_id: int,
    request: Request,
    user: dict = Depends(require_permission("sso", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """重置 client_secret：明文仅本次返回。"""
    c = await db.get(SsoClient, client_row_id)
    if not c:
        raise HTTPException(status_code=404, detail="应用不存在")
    secret = _client_secret()
    c.client_secret_hash = hash_password(secret)
    _log(db, int(user["user_id"]), "sso.client.reset_secret", f"client:{c.client_id}",
         get_client_ip(request))
    await db.commit()
    await db.refresh(c)
    return _client_out(c, plain_secret=secret)


@admin_router.delete("/clients/{client_row_id}")
async def delete_client(
    client_row_id: int,
    request: Request,
    user: dict = Depends(require_permission("sso", "manage")),
    db: AsyncSession = Depends(get_db),
):
    c = await db.get(SsoClient, client_row_id)
    if not c:
        raise HTTPException(status_code=404, detail="应用不存在")
    await db.delete(c)
    _log(db, int(user["user_id"]), "sso.client.delete", f"client:{c.client_id}",
         get_client_ip(request))
    await db.commit()
    return {"ok": True}
