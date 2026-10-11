"""第三方 OAuth 登录（GitHub / Microsoft / Apple / Google）+ 渠道配置管理。

流程（授权码模式）：
1. GET /api/oauth/{provider}/login → 302 第三方授权页（state 为签名 JWT，防伪造/CSRF）
2. GET|POST /api/oauth/{provider}/callback → 换取用户身份 → 查 oauth_accounts：
   - 已绑定 → 建登录会话（HttpOnly Cookie）→ 302 回站内 next
   - 未绑定 → 下发 10 分钟补资料票据（签名 JWT Cookie）→ 302 /admin/complete-profile
3. POST /api/oauth/complete → 校验票据 + 用户名唯一 → 创建 member 账号并绑定
   （用户名必须手动自定义，禁止自动使用第三方昵称）

安全要点：
- client_secret 用 Fernet 加密落库（core/crypto），接口永不回传明文
- Apple 渠道：secret 字段存 .p8 私钥文本（config.team_id / key_id），运行时签 ES256 client_secret，
  id_token 经 Apple JWKS 验签（RS256）后取 sub
- 绑定唯一性：provider + openid 联合查重，防止重复绑定
- 渠道开关关闭时登录入口 404，不暴露端点存在性
"""
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import httpx
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from jose import jwt as jose_jwt
from jose import jwk as jose_jwk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.csrf import CSRF_COOKIE, SESSION_COOKIE, cookie_secure, new_csrf_token, set_csrf_cookie
from app.core.crypto import decrypt_secret, encrypt_secret, mask_secret
from app.core.ip_location import resolve_location
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.rate_limit import rate_limit
from app.core.security import Role, create_access_token
from app.db.models import AuditLog, LoginChannel, LoginSession, OAuthAccount, OAuthProvider, User
from app.db.session import get_db
from app.schemas.auth import LoginResponse
from app.schemas.oauth import (
    ChannelBrief,
    ChannelOut,
    ChannelUpdate,
    CompleteProfileRequest,
    PendingProfile,
)
from app.api.auth import parse_user_agent

public_router = APIRouter(prefix="/api/oauth", tags=["oauth-public"])
admin_router = APIRouter(prefix="/api/admin/oauth", tags=["oauth-admin"])
settings = get_settings()

# 补资料票据 Cookie 名（HttpOnly，10 分钟有效）
PENDING_COOKIE = "gdueca_oauth_pending"
PENDING_TTL = 600

# ---------- 各平台端点配置 ----------
GITHUB = OAuthProvider.GITHUB.value
MICROSOFT = OAuthProvider.MICROSOFT.value
APPLE = OAuthProvider.APPLE.value
GOOGLE = OAuthProvider.GOOGLE.value

PROVIDER_ENDPOINTS: dict[str, dict[str, str]] = {
    GITHUB: {
        "authorize": "https://github.com/login/oauth/authorize",
        "token": "https://github.com/login/oauth/access_token",
        "userinfo": "https://api.github.com/user",
        "scope": "read:user user:email",
    },
    MICROSOFT: {
        "authorize": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "userinfo": "https://graph.microsoft.com/oidc/userinfo",
        "scope": "openid email profile",
    },
    GOOGLE: {
        "authorize": "https://accounts.google.com/o/oauth2/v2/auth",
        "token": "https://oauth2.googleapis.com/token",
        "userinfo": "https://openidconnect.googleapis.com/v1/userinfo",
        "scope": "openid email profile",
    },
    APPLE: {
        "authorize": "https://appleid.apple.com/auth/authorize",
        # Apple 走 form_post 回调直接拿 id_token，无需 token 端点
        "jwks": "https://appleid.apple.com/auth/keys",
        "scope": "name email",
    },
}

# Apple JWKS 内存缓存（1 小时）
_apple_jwks: dict[str, Any] = {"keys": None, "fetched_at": 0.0}


def _now() -> datetime:
    """数据库统一存 naive UTC。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _log(db: AsyncSession, user_id: int | None, action: str, detail: str | None, ip: str | None):
    db.add(AuditLog(user_id=user_id, action=action, detail=detail, ip=ip))


def _provider_or_400(provider: str) -> OAuthProvider:
    try:
        return OAuthProvider(provider)
    except ValueError:
        raise HTTPException(status_code=404, detail="不支持的登录渠道")


async def _channel_or_404(db: AsyncSession, provider: OAuthProvider, require_enabled: bool = True) -> LoginChannel:
    ch = (await db.execute(
        select(LoginChannel).where(LoginChannel.provider == provider)
    )).scalar_one_or_none()
    if not ch or (require_enabled and not ch.enabled):
        raise HTTPException(status_code=404, detail="登录渠道未开放")
    return ch


def _base_url(request: Request) -> str:
    """站点对外基础地址：优先 X-Forwarded-Proto / Host（反代场景）。"""
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if not host:
        base = str(request.base_url).rstrip("/")
        return base
    return f"{proto}://{host}"


def _safe_next(next_path: str | None) -> str:
    """仅允许站内相对路径，防开放重定向。"""
    if next_path and next_path.startswith("/") and not next_path.startswith("//"):
        return next_path
    return "/admin"


def _sign(data: dict) -> str:
    return jose_jwt.encode(
        {**data, "exp": int(time.time()) + PENDING_TTL},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def _verify_signed(token: str | None, typ: str) -> dict:
    """校验签名票据（state / 补资料票据）；无效或过期一律拒绝。"""
    if not token:
        raise HTTPException(status_code=400, detail="登录状态已失效，请重新发起登录")
    try:
        payload = jose_jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except Exception:
        raise HTTPException(status_code=400, detail="登录状态已失效，请重新发起登录")
    if payload.get("typ") != typ:
        raise HTTPException(status_code=400, detail="登录状态无效，请重新发起登录")
    return payload


# ---------- Apple：client_secret 动态签名 + id_token JWKS 验签 ----------
def _apple_client_secret(ch: LoginChannel) -> str:
    """用 .p8 私钥（secret 字段）签 ES256 client_secret JWT（30 分钟有效）。"""
    cfg = ch.config or {}
    team_id, key_id = cfg.get("team_id"), cfg.get("key_id")
    p8 = decrypt_secret(ch.client_secret_enc)
    if not (team_id and key_id and p8):
        raise HTTPException(status_code=500, detail="Apple 渠道配置不完整（需 team_id / key_id / .p8 私钥）")
    try:
        key = load_pem_private_key(p8.encode("utf-8"), password=None)
    except Exception:
        raise HTTPException(status_code=500, detail="Apple .p8 私钥无效")
    now = int(time.time())
    return jose_jwt.encode(
        {"iss": team_id, "iat": now, "exp": now + 1800,
         "aud": "https://appleid.apple.com", "sub": ch.client_id},
        key,
        algorithm="ES256",
        headers={"kid": key_id},
    )


async def _verify_apple_id_token(id_token: str, client_id: str) -> dict:
    """Apple id_token 验签（JWKS 缓存 1 小时），返回 payload。"""
    if not _apple_jwks["keys"] or time.time() - _apple_jwks["fetched_at"] > 3600:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(PROVIDER_ENDPOINTS[APPLE]["jwks"])
            resp.raise_for_status()
            _apple_jwks["keys"] = resp.json().get("keys", [])
            _apple_jwks["fetched_at"] = time.time()
    header = jose_jwt.get_unverified_header(id_token)
    kid = header.get("kid")
    key_data = next((k for k in _apple_jwks["keys"] if k.get("kid") == kid), None)
    if not key_data:
        raise HTTPException(status_code=401, detail="Apple 身份验证失败")
    key = jose_jwk.construct(key_data)
    try:
        return jose_jwt.decode(id_token, key, algorithms=["RS256"], audience=client_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Apple 身份验证失败")


# ---------- 第三方身份获取 ----------
async def _fetch_github_profile(token: str) -> tuple[str, str | None, str | None, str | None, dict]:
    async with httpx.AsyncClient(timeout=10) as client:
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
        u = (await client.get(PROVIDER_ENDPOINTS[GITHUB]["userinfo"], headers=headers)).json()
        emails = (await client.get("https://api.github.com/user/emails", headers=headers)).json()
    email = next((e["email"] for e in emails if isinstance(emails, list) and e.get("primary")), u.get("email"))
    return (str(u["id"]), email, u.get("name"), u.get("avatar_url"), u)


async def _fetch_bearer_profile(endpoint: str, token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(endpoint, headers={"Authorization": f"Bearer {token}"})
        resp.raise_for_status()
        return resp.json()


# ==================== 公开接口 ====================

@public_router.get("/channels", response_model=list[ChannelBrief])
async def list_public_channels(db: AsyncSession = Depends(get_db)):
    """公开渠道开关（登录页按此显隐第三方按钮），不返回任何凭据。"""
    rows = (await db.execute(select(LoginChannel))).scalars().all()
    enabled = {r.provider.value for r in rows if r.enabled}
    return [ChannelBrief(provider=p.value, enabled=p.value in enabled)
            for p in OAuthProvider]


@public_router.get("/{provider}/login", dependencies=[Depends(rate_limit("oauth_login", limit=30, window_seconds=60))])
async def oauth_login(
    provider: str, request: Request, next: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """发起第三方授权：302 到授权页，state 为签名 JWT（10 分钟）。"""
    p = _provider_or_400(provider)
    ep = PROVIDER_ENDPOINTS[p.value]
    ch = await _channel_or_404(db, p)
    if not ch.client_id:
        raise HTTPException(status_code=500, detail="登录渠道未配置完成")
    client_id = ch.client_id
    redirect_uri = ch.redirect_uri or f"{_base_url(request)}/api/oauth/{p.value}/callback"

    state = _sign({"typ": "oauth_state", "p": p.value, "n": uuid.uuid4().hex,
                   "next": _safe_next(next)})
    params: dict[str, str] = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    if p.value == APPLE:
        params.update({"response_type": "code id_token", "response_mode": "form_post",
                       "scope": ep["scope"]})
    else:
        params.update({"response_type": "code", "scope": ep["scope"]})
    query = "&".join(f"{k}={quote(v, safe='')}" for k, v in params.items())
    return RedirectResponse(f"{ep['authorize']}?{query}", status_code=302)


async def _bind_or_redirect(
    db: AsyncSession, request: Request, provider: OAuthProvider,
    openid: str, email: str | None, name: str | None, avatar: str | None,
    raw_profile: dict, next_path: str,
):
    """已绑定 → 建会话 302 落地；未绑定 → 下发补资料票据 302 /admin/complete-profile。

    Cookie 直接写在返回的 RedirectResponse 上（返回 Response 对象时
    FastAPI 不会合并注入的 response 参数）。
    """
    client_ip = get_client_ip(request)
    link = (await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider, OAuthAccount.openid == openid
        )
    )).scalar_one_or_none()
    user = await db.get(User, link.user_id) if link else None
    if user and user.is_active:
        # 已绑定：直接登录（建登录会话）
        now = _now()
        ua = request.headers.get("user-agent", "") or ""
        device_name, device_model = parse_user_agent(ua)
        loc_zh, loc_en = resolve_location(client_ip)
        expires_delta = timedelta(hours=settings.JWT_EXPIRE_HOURS)
        sid = uuid.uuid4().hex
        db.add(LoginSession(
            user_id=user.id, session_id=sid,
            device_name=device_name[:128], device_model=device_model[:128],
            user_agent=ua[:512], ip=client_ip,
            location_zh=loc_zh[:128] if loc_zh else None,
            location_en=loc_en[:128] if loc_en else None,
            remember_device=False,
            login_at=now, last_active_at=now, expires_at=now + expires_delta,
        ))
        token = create_access_token(str(user.id), Role(user.role.value), sid, expires_delta)
        csrf_token = new_csrf_token()
        resp = RedirectResponse(_safe_next(next_path), status_code=302)
        resp.set_cookie(SESSION_COOKIE, token, httponly=True,
                        secure=cookie_secure(request), samesite="strict", path="/")
        set_csrf_cookie(resp, request, csrf_token)
        _log(db, user.id, "login.oauth",
             f"provider:{provider.value} openid:{openid[:16]}", client_ip)
        await db.commit()
        return resp

    # 未绑定：下发补资料票据（不用第三方昵称自动建号）
    pending = _sign({"typ": "oauth_pending", "p": provider.value, "oid": openid[:128],
                     "email": email, "name": name, "avatar": avatar})
    _log(db, None, "oauth.pending_register",
         f"provider:{provider.value} openid:{openid[:16]}", client_ip)
    await db.commit()
    resp = RedirectResponse("/admin/complete-profile", status_code=302)
    resp.set_cookie(PENDING_COOKIE, pending, max_age=PENDING_TTL, httponly=True,
                    secure=cookie_secure(request), samesite="strict", path="/")
    return resp


@public_router.get("/{provider}/callback", dependencies=[Depends(rate_limit("oauth_cb", limit=40, window_seconds=60))])
async def oauth_callback(
    provider: str, request: Request, code: str | None = None, state: str | None = None,
    error: str | None = None, db: AsyncSession = Depends(get_db),
):
    """GitHub / Microsoft / Google 授权回调。"""
    p = _provider_or_400(provider)
    if error or not code or not state:
        return RedirectResponse("/admin/login?oauth_error=1", status_code=302)
    sp = _verify_signed(state, "oauth_state")
    if sp.get("p") != p.value:
        return RedirectResponse("/admin/login?oauth_error=1", status_code=302)

    ch = await _channel_or_404(db, p)
    if not ch.client_id:
        return RedirectResponse("/admin/login?oauth_error=1", status_code=302)
    secret = decrypt_secret(ch.client_secret_enc)
    redirect_uri = ch.redirect_uri or f"{_base_url(request)}/api/oauth/{p.value}/callback"

    try:
        ep = PROVIDER_ENDPOINTS[p.value]
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(ep["token"], data={
                "grant_type": "authorization_code", "code": code,
                "client_id": ch.client_id, "client_secret": secret or "",
                "redirect_uri": redirect_uri,
            }, headers={"Accept": "application/json"})
            resp.raise_for_status()
            token = resp.json().get("access_token")
        if not token:
            raise ValueError("no access_token")
        if p.value == GITHUB:
            openid, email, name, avatar, raw = await _fetch_github_profile(token)
        else:
            prof = await _fetch_bearer_profile(ep["userinfo"], token)
            openid = str(prof.get("sub") or prof.get("id") or "")
            email, name, avatar = prof.get("email"), prof.get("name"), prof.get("picture") if "picture" in prof else None
            raw = prof
        if not openid:
            raise ValueError("no openid")
    except HTTPException:
        raise
    except Exception:
        return RedirectResponse("/admin/login?oauth_error=1", status_code=302)

    return await _bind_or_redirect(db, request, p, openid,
                                   email, name, avatar, sp.get("next", "/admin"))


@public_router.post("/{provider}/callback", dependencies=[Depends(rate_limit("oauth_cb", limit=40, window_seconds=60))])
async def oauth_callback_apple(
    provider: str, request: Request, db: AsyncSession = Depends(get_db),
    code: str | None = Form(default=None), id_token: str | None = Form(default=None),
    state: str | None = Form(default=None), user: str | None = Form(default=None),
):
    """Apple form_post 回调：直接验 id_token（RS256 / JWKS），无需换 token。"""
    p = _provider_or_400(provider)
    if not id_token or not state:
        return RedirectResponse("/admin/login?oauth_error=1", status_code=302)
    sp = _verify_signed(state, "oauth_state")
    if sp.get("p") != p.value:
        return RedirectResponse("/admin/login?oauth_error=1", status_code=302)

    ch = await _channel_or_404(db, p)
    if not ch.client_id:
        return RedirectResponse("/admin/login?oauth_error=1", status_code=302)
    try:
        payload = await _verify_apple_id_token(id_token, ch.client_id)
        openid = str(payload.get("sub") or "")
        email = payload.get("email")
        name = None
        if user:
            import json as _json
            try:
                u = _json.loads(user)
                nm = u.get("name") or {}
                name = " ".join(x for x in [nm.get("firstName"), nm.get("lastName")] if x) or None
            except Exception:
                pass
        if not openid:
            raise ValueError("no sub")
        raw = {"sub": openid, "email": email, "user": user}
    except HTTPException:
        raise
    except Exception:
        return RedirectResponse("/admin/login?oauth_error=1", status_code=302)

    return await _bind_or_redirect(db, request, p, openid,
                                   email, name, None, sp.get("next", "/admin"))


@public_router.get("/pending", response_model=PendingProfile)
async def get_pending_profile(request: Request):
    """补资料页读取第三方预填信息（来自 HttpOnly 票据 Cookie）。"""
    payload = _verify_signed(request.cookies.get(PENDING_COOKIE), "oauth_pending")
    return PendingProfile(provider=payload["p"], email=payload.get("email"),
                          name=payload.get("name"), avatar=payload.get("avatar"))


@public_router.post("/complete", response_model=LoginResponse,
                    dependencies=[Depends(rate_limit("oauth_complete", limit=10, window_seconds=60))])
async def complete_profile(
    req: CompleteProfileRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """第三方首次登录补资料：创建 member 账号并绑定（用户名手动自定义）。"""
    payload = _verify_signed(request.cookies.get(PENDING_COOKIE), "oauth_pending")
    provider = OAuthProvider(payload["p"])
    openid = payload["oid"]
    client_ip = get_client_ip(request)

    # 用户名 / 邮箱唯一性（第三方邮箱可能为空 → 用占位域）
    exists = (await db.execute(
        select(User).where(User.username == req.username)
    )).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=400, detail="用户名已被占用")
    email = payload.get("email") or f"oauth-{provider.value}-{openid}@gdueca.local"
    email_exists = (await db.execute(
        select(User).where(User.email == email)
    )).scalar_one_or_none()
    if email_exists:
        raise HTTPException(status_code=400, detail="该第三方账号邮箱已被绑定，请直接使用账号密码登录")

    now = _now()
    # 随机强密码（第三方账号不使用密码登录，占位哈希仅防碰撞）
    from app.core.security import hash_password
    user = User(
        username=req.username,
        email=email,
        password_hash=hash_password(uuid.uuid4().hex + secrets.token_urlsafe(12)),
        role=Role.MEMBER,
        student_id=req.student_id,
        real_name=req.real_name,
        phone=f"{req.phone_cc}{req.phone_number}",
        realname_verified=False,
    )
    db.add(user)
    await db.flush()
    db.add(OAuthAccount(
        user_id=user.id, provider=provider, openid=openid,
        raw_profile={"email": payload.get("email"), "name": payload.get("name"),
                     "avatar": payload.get("avatar")},
    ))
    # 建登录会话（与密码登录一致）
    ua = request.headers.get("user-agent", "") or ""
    device_name, device_model = parse_user_agent(ua)
    loc_zh, loc_en = resolve_location(client_ip)
    expires_delta = timedelta(hours=settings.JWT_EXPIRE_HOURS)
    sid = uuid.uuid4().hex
    db.add(LoginSession(
        user_id=user.id, session_id=sid,
        device_name=device_name[:128], device_model=device_model[:128],
        user_agent=ua[:512], ip=client_ip,
        location_zh=loc_zh[:128] if loc_zh else None,
        location_en=loc_en[:128] if loc_en else None,
        remember_device=False,
        login_at=now, last_active_at=now, expires_at=now + expires_delta,
    ))
    token = create_access_token(str(user.id), Role(user.role.value), sid, expires_delta)
    response.set_cookie(SESSION_COOKIE, token, httponly=True,
                        secure=cookie_secure(request), samesite="strict", path="/")
    response.delete_cookie(PENDING_COOKIE, path="/")
    csrf_token = new_csrf_token()
    set_csrf_cookie(response, request, csrf_token)
    _log(db, user.id, "register.oauth", f"provider:{provider.value}", client_ip)
    await db.commit()
    return LoginResponse(
        role=Role.MEMBER, csrf_token=csrf_token, username=user.username,
        must_change_password=False, realname_verified=False,
    )


# ==================== 管理接口 ====================

def _channel_out(ch: LoginChannel | None) -> ChannelOut:
    if not ch:
        return ChannelOut(provider="", enabled=False)
    masked = None
    if ch.client_secret_enc:
        plain = decrypt_secret(ch.client_secret_enc)
        masked = mask_secret(plain) if plain else "***"
    return ChannelOut(
        provider=ch.provider.value, enabled=ch.enabled, client_id=ch.client_id,
        has_secret=bool(ch.client_secret_enc), secret_masked=masked,
        redirect_uri=ch.redirect_uri, updated_at=ch.updated_at,
    )


@admin_router.get("/channels", response_model=list[ChannelOut])
async def list_channels(
    user: dict = Depends(require_permission("oauth", "view")),
    db: AsyncSession = Depends(get_db),
):
    """4 渠道配置列表（secret 脱敏）。"""
    rows = {r.provider.value: r for r in (
        await db.execute(select(LoginChannel))
    ).scalars().all()}
    return [_channel_out(rows.get(p.value)) for p in OAuthProvider]


@admin_router.put("/channels/{provider}", response_model=ChannelOut)
async def update_channel(
    provider: str,
    req: ChannelUpdate,
    request: Request,
    user: dict = Depends(require_permission("oauth", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """更新渠道配置：开关 / client_id / secret（重新加密）/ redirect_uri。"""
    p = _provider_or_400(provider)
    ch = (await db.execute(
        select(LoginChannel).where(LoginChannel.provider == p)
    )).scalar_one_or_none()
    if not ch:
        ch = LoginChannel(provider=p)
        db.add(ch)
    if req.enabled is not None:
        if req.enabled and not (ch.client_id or req.client_id):
            raise HTTPException(status_code=400, detail="请先填写 Client ID 再启用渠道")
        ch.enabled = req.enabled
    if req.client_id is not None:
        ch.client_id = req.client_id or None
    if req.client_secret is not None:
        # 空串=清除；其他值重新加密保存（脱敏占位不覆盖真实密文）
        if req.client_secret == "":
            ch.client_secret_enc = None
        elif "***" not in req.client_secret:
            ch.client_secret_enc = encrypt_secret(req.client_secret)
    if req.redirect_uri is not None:
        ch.redirect_uri = req.redirect_uri or None
    _log(db, int(user["user_id"]), "oauth.channel.update", f"provider:{p.value}",
         get_client_ip(request))
    await db.commit()
    await db.refresh(ch)
    return _channel_out(ch)
