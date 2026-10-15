"""认证接口：登录 / 退出、CSRF 令牌、当前用户、用户管理、改密、忘记密码、安全问题恢复、
个人资料、头像上传、登录会话管理。

安全要点（GB/T 22239 身份鉴别 / 访问控制 / 安全审计）：
- 登录凭据存放于 HttpOnly + SameSite=Strict Cookie，前端脚本无法读取
- 密码 bcrypt 加盐哈希存储，设置 / 修改时强制强口令策略
- 连续登录失败锁定账号，登录 / 恢复 / 忘记密码接口按 IP 限流
- 管理员级账号只能从内网登录与使用
- 登录成功 / 失败 / 锁定 / 权限变更等关键操作写入审计日志
"""
import hashlib
import json
import logging
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.bizcode import BizCode
from app.core.brute_force import (
    BREAK_GLASS_POLICY,
    NORMAL_POLICY,
    check as bf_check,
    record_failure as bf_record_failure,
    reset as bf_reset,
)
from app.core.config import get_settings
from app.core.csrf import (
    CSRF_COOKIE,
    SESSION_COOKIE,
    cookie_secure,
    new_csrf_token,
    origin_allowed,
    set_csrf_cookie,
)
from app.core.ip_location import resolve_location
from app.core.middleware import get_client_ip
from app.core.password_policy import check_password_strength
from app.core.permissions import PERMISSION_MODULES, require_permission
from app.core.rate_limit import rate_limit
from app.core.responses import fail
from app.core.security import (
    REMEMBER_DEVICE_DAYS,
    Role,
    bg_session_create,
    bg_session_revoke,
    create_access_token,
    decode_token,
    hash_password,
    is_admin_network,
    is_admin_tier,
    require_role,
    verify_password,
)
from app.db.models import (
    AuditLog,
    LoginSession,
    PasswordResetRequest,
    PasswordResetStatus,
    SecurityQuestion,
    SystemSetting,
    User,
    UserRole,
)
from app.db.session import get_db
from app.utils.crud import paginate
from app.core.kv import get_kv
from app.core.mailer import is_configured as mailer_configured, send_email
from app.schemas.auth import (
    AvatarUploadOut,
    BannerUploadOut,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResetRequest,
    ForgotPasswordSendCodeRequest,
    LoginRequest,
    LoginResponse,
    LoginSessionOut,
    PasswordResetHandleRequest,
    PasswordResetOut,
    ProfileUpdate,
    RegisterOut,
    RegisterRequest,
    SecurityAnswerRequest,
    SecurityQuestionOut,
    SecurityQuestionUpdate,
    UserCreate,
    UserOut,
    UserUpdate,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# 对外统一防信息泄露文案（响应壳 message.params.detail）；真实原因仅写入审计日志
_LOGIN_DENIED = {"detail": "用户名或密码错误"}
# 管理员来源 IP 白名单（ADMIN_TRUSTED_IPS 非空且未命中）时的对外提示
_SOURCE_DENIED = {"detail": "请求来源不合法"}
_INIT_REQUIRED = {"detail": "系统尚未完成初始化，请使用应急账号登录后台完成初始化向导"}
settings = get_settings()
logger = logging.getLogger("gdueca.auth")


def _log(db: AsyncSession, ctx_or_uid, action: str, detail: str | None, ip: str | None):
    """统一审计写入：ctx_or_uid 支持 ctx dict（自动区分 Break-Glass）/ int / None。"""
    log_action(db, ctx_or_uid, action, detail, ip=ip)


def _bg_login_detail(extra: dict) -> str:
    """Break-Glass 登录审计标记：来源校验已豁免（origin_skipped），供事后排查。"""
    return json.dumps({"break_glass_login": True, "origin_skipped": True, **extra},
                      ensure_ascii=False)


def _reject_break_glass(user: dict) -> None:
    """Break-Glass 应急账号不适用个人自服务功能（无 user_id，无个人资料/设备列表）。"""
    if user.get("break_glass"):
        raise HTTPException(status_code=403, detail="应急账号不适用个人自服务功能")


def _now() -> datetime:
    """数据库统一存 naive UTC。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _require_strong_password(password: str, username: str | None, email: str | None) -> None:
    reason = check_password_strength(password, username, email)
    if reason:
        raise HTTPException(status_code=400, detail=reason)


async def _revoke_user_sessions(db: AsyncSession, user_id: int, keep_jti: str | None = None) -> None:
    """撤销用户全部登录会话（改密 / 重置 / 停用后强制其他设备重新登录）。"""
    stmt = (
        update(LoginSession)
        .where(LoginSession.user_id == user_id, LoginSession.revoked.is_(False))
        .values(revoked=True, revoked_at=_now())
    )
    if keep_jti:
        stmt = stmt.where(LoginSession.session_id != keep_jti)
    await db.execute(stmt)


# ---------- User-Agent 解析（无第三方依赖） ----------
def parse_user_agent(ua: str | None) -> tuple[str, str]:
    """解析 User-Agent → (device_name 设备名称, device_model 设备型号)。

    device_name 例: "Chrome 129 · Windows"
    device_model 例: "Windows 10/11 桌面" / "iPhone" / "22081212C (Android 13)"
    """
    if not ua:
        return ("未知设备", "未知")
    s = ua

    # 浏览器（按优先级：Edge > Opera > Chrome > Firefox > Safari > IE）
    browser, browser_ver = "未知浏览器", ""
    for pattern, name in (
        (r"Edg(?:e|A|iOS)?/([\d.]+)", "Edge"),
        (r"OPR/([\d.]+)", "Opera"),
        (r"Chrome/([\d.]+)", "Chrome"),
        (r"Firefox/([\d.]+)", "Firefox"),
        (r"Version/([\d.]+).*Safari", "Safari"),
        (r"MSIE ([\d.]+)", "Internet Explorer"),
    ):
        m = re.search(pattern, s)
        if m:
            browser, browser_ver = name, m.group(1).split(".")[0]
            break

    # 操作系统 / 设备型号
    os_name, model = "未知系统", "桌面设备"
    if "iPhone" in s:
        os_name, model = "iOS", "iPhone"
    elif "iPad" in s:
        os_name, model = "iPadOS", "iPad"
    elif "Android" in s:
        m = re.search(r"Android ([\d.]+)", s)
        os_name = f"Android {m.group(1)}" if m else "Android"
        # UA 形如 "(Linux; Android 13; 22081212C Build/...)"
        m2 = re.search(r"Android [\d.]+;\s*([^;)]+?)(?:\s+Build/[^;)]*)?\s*[;)]", s)
        model = f"{m2.group(1).strip()} ({os_name})" if m2 else "Android 设备"
    elif "Windows NT 10.0" in s:
        os_name, model = "Windows", "Windows 10/11 桌面"
    elif "Windows NT 6.1" in s:
        os_name, model = "Windows", "Windows 7 桌面"
    elif "Windows" in s:
        os_name, model = "Windows", "Windows 桌面"
    elif "Mac OS X" in s:
        m = re.search(r"Mac OS X ([\d_]+)", s)
        os_name = "macOS" + (f" {m.group(1).replace('_', '.')}" if m else "")
        model = "Mac"
    elif "Linux" in s:
        os_name, model = "Linux", "Linux 桌面"

    device_name = f"{browser} {browser_ver}".strip() + f" · {os_name}"
    return (device_name, model)


# ---------- CSRF 令牌 ----------
@router.get("/csrf")
async def get_csrf_token(request: Request, response: Response):
    """下发 CSRF 令牌：Cookie（HttpOnly）+ 响应体各一份，写请求需在 X-CSRF-Token 头回传。"""
    token = request.cookies.get(CSRF_COOKIE)
    if not token or not re.fullmatch(r"[A-Za-z0-9_\-]{32,128}", token):
        token = new_csrf_token()
    set_csrf_cookie(response, request, token)
    return {"csrf_token": token}


# ---------- 公开注册（P0） ----------
# 强制 role=member：公开注册永远不能产生管理员账号，admin 只能由现有管理员后台创建或升级
@router.post(
    "/register",
    response_model=RegisterOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("register", limit=5, window_seconds=3600))],
)
async def register(
    req: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # 系统初始化门禁：未完成初始化向导时关闭公开注册
    ss = await db.get(SystemSetting, 1)
    if ss and not ss.system_initialized:
        return fail(BizCode.SYSTEM_NOT_INITIALIZED, params=_INIT_REQUIRED)
    dup = (await db.execute(
        select(User).where(User.username == req.username)
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=400, detail="用户名已存在")
    # 邮箱可选但唯一（列 NOT NULL + UNIQUE）；未提供时生成占位邮箱满足约束
    email = str(req.email) if req.email else f"{req.username}@users.placeholder"
    dup_email = (await db.execute(
        select(User).where(User.email == email)
    )).scalar_one_or_none()
    if dup_email:
        raise HTTPException(status_code=400, detail="邮箱已被使用")
    u = User(
        username=req.username,
        email=email,
        password_hash=hash_password(req.password),
        role=UserRole.MEMBER,
        display_name=req.display_name,
        # real_name/student_id 属学生身份信息，注册时不采集，由用户后续在个人资料/实名流程补全
        real_name=req.display_name,
        student_id="",
        phone=req.phone or "",
        must_change_password=False,
    )
    db.add(u)
    await db.flush()
    _log(db, u.id, "user.register", f"user:{u.id}", get_client_ip(request))
    await db.commit()
    return RegisterOut(id=u.id, username=u.username, display_name=u.display_name, role=Role.MEMBER)


# ---------- 登录 ----------
@router.post(
    "/login",
    response_model=LoginResponse,
    dependencies=[Depends(rate_limit("login", limit=10, window_seconds=60))],
)
async def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """登录：Break-Glass 应急账号与普通账号双轨。

    防信息泄露（需求硬性规定）：无论密码错误 / 防爆破封禁 / 应急账号停用 /
    外网拒绝 / 账号不存在，对外一律返回 BizCode.LOGIN_BLOCKED（401，
    「用户名或密码错误」）；真实原因仅写入审计日志。剩余封禁时长绝不对外暴露。
    """
    if not req.username and not req.email:
        raise HTTPException(status_code=400, detail="必须提供 username 或 email")
    client_ip = get_client_ip(request)
    # 浏览器指纹（前端 canvas+字体+屏幕+UA 生成；客户端可伪造，仅作防爆破附加维度）
    fingerprint = (request.headers.get("x-browser-fingerprint") or "").strip()[:128] or None
    dims = {"ip": client_ip, "fp": fingerprint}
    ua = request.headers.get("user-agent", "") or ""
    now = _now()

    # ================= 来源校验（按账号类型分流） =================
    # Break-Glass 应急账号完全豁免 Origin/Referer 来源校验（反代/CDN 全链路故障时
    # Origin 可能缺失，来源校验会把应急通道锁死）；限流 / 阶梯封禁照常生效，一项不减。
    # 普通账号（含 admin 组普通管理员）照常校验，来源异常拒绝（CSRF 防护不放松）。
    bg_username = settings.SUPER_ADMIN_USERNAME
    is_bg_login = bool(bg_username and req.username and req.username == bg_username)
    account_hint = (req.username or str(req.email) or "")[:64]
    if not is_bg_login and not origin_allowed(request):
        log_action(db, None, "login.origin_blocked", f"account:{account_hint}", client_ip)
        await db.commit()
        return fail(BizCode.CSRF_FAILED, params=_SOURCE_DENIED)

    # ================= Break-Glass 应急账号分支 =================
    # 凭据仅存环境变量，永不查 users 表；限流阶梯按 (账号, 维度) 组合独立计。
    if is_bg_login:
        ctx_bg = {"break_glass": True, "username": bg_username}

        # 1) 阶梯封禁检查（封禁中不做任何其他校验，直接拒绝）
        ban = await bf_check(BREAK_GLASS_POLICY, bg_username, dims)
        if ban:
            log_action(db, ctx_bg, "bg_login.ban_blocked",
                       f"stage:{ban.stage} dim:{ban.dim} permanent:{ban.permanent}", client_ip)
            await db.commit()
            return fail(BizCode.LOGIN_BLOCKED, params=_LOGIN_DENIED)

        # 2) 应急账号来源 IP 白名单校验（默认空 = 不限制；外网拒绝不消耗密码尝试）
        if not await is_admin_network(request, db):
            log_action(db, ctx_bg, "bg_login.network_denied", None, client_ip)
            await db.commit()
            return fail(BizCode.LOGIN_BLOCKED, params=_SOURCE_DENIED)

        # 3) 密码校验；错误计入阶梯（即使 SUPER_ADMIN_ENABLED=false 仍计数）
        if not verify_password(req.password, settings.SUPER_ADMIN_PASSWORD_HASH):
            entry = await bf_record_failure(BREAK_GLASS_POLICY, bg_username, bg_username, dims)
            log_action(db, ctx_bg, "bg_login.fail",
                       _bg_login_detail({"reason": "password",
                                         "stage": entry.stage if entry else "-"}), client_ip)
            if entry:
                log_action(db, ctx_bg, "bg_login.ban_triggered",
                           f"stage:{entry.stage} dim:{entry.dim} until:{entry.until or 'permanent'}",
                           client_ip)
            await db.commit()
            return fail(BizCode.LOGIN_BLOCKED, params=_LOGIN_DENIED, data={"first_ban": True} if entry else None)

        # 4) 应急开关关闭：密码正确也拒绝（不消耗阶梯——密码尝试本身已通过）
        if not settings.break_glass_enabled:
            log_action(db, ctx_bg, "bg_login.disabled", None, client_ip)
            await db.commit()
            return fail(BizCode.LOGIN_BLOCKED, params=_LOGIN_DENIED)

        # 5) 成功：KV 会话（TTL=全局空闲超时，硬顶不续期，禁止永久会话）+ JWT(bg claim)
        ss = await db.get(SystemSetting, 1)
        idle_minutes = ss.session_idle_timeout_minutes if ss else 30
        sid = uuid.uuid4().hex
        await bg_session_create(sid, bg_username, client_ip, ua, idle_minutes)
        token = create_access_token(
            bg_username, Role.SUPER_ADMIN, sid,
            timedelta(hours=settings.JWT_EXPIRE_HOURS),
            extra_claims={"bg": True},
        )
        response.set_cookie(
            SESSION_COOKIE, token,
            httponly=True, secure=cookie_secure(request), samesite="strict", path="/",
        )
        csrf_token = new_csrf_token()
        set_csrf_cookie(response, request, csrf_token)
        log_action(db, ctx_bg, "bg_login.success", _bg_login_detail({"session": sid[:8]}), client_ip)
        await db.commit()
        return LoginResponse(
            role=Role.SUPER_ADMIN,
            csrf_token=csrf_token,
            username=bg_username,
            is_break_glass=True,
            must_setup=not (ss.system_initialized if ss else False),
        )

    # ================= 普通账号分支 =================
    user = (await db.execute(
        select(User).where(or_(User.username == req.username, User.email == req.email))
    )).scalar_one_or_none()

    # 系统初始化门禁：未完成初始化向导时，普通账号一律禁止登录（仅 Break-Glass 可用）
    ss = await db.get(SystemSetting, 1)
    if ss and not ss.system_initialized:
        log_action(db, None, "login.init_gate", f"account:{account_hint}", client_ip)
        await db.commit()
        return fail(BizCode.SYSTEM_NOT_INITIALIZED, params=_INIT_REQUIRED)

    if not user:
        # 账号不存在：等价哈希校验防时间侧信道枚举；无 user_id 不进入阶梯计数
        verify_password(req.password, None)
        log_action(db, None, "login.fail", f"account:{account_hint} reason:not_found", client_ip)
        await db.commit()
        return fail(BizCode.LOGIN_BLOCKED, params=_LOGIN_DENIED)

    uid = str(user.id)

    # 软删除账号（内容回收站中）禁止登录
    if user.is_deleted:
        log_action(db, user.id, "login.deleted_account", f"account:{account_hint}", client_ip)
        await db.commit()
        return fail(BizCode.LOGIN_BLOCKED, params=_LOGIN_DENIED)

    # 阶梯封禁检查（每 账号×维度 独立计数；A 账号封禁不影响同设备 B 账号）
    ban = await bf_check(NORMAL_POLICY, uid, dims)
    if ban:
        log_action(db, user.id, "login.ban_blocked",
                   f"stage:{ban.stage} dim:{ban.dim} permanent:{ban.permanent}", client_ip)
        await db.commit()
        return fail(BizCode.LOGIN_BLOCKED, params=_LOGIN_DENIED)

    if not verify_password(req.password, user.password_hash):
        entry = await bf_record_failure(NORMAL_POLICY, uid, user.username, dims)
        log_action(db, user.id, "login.fail",
                   f"account:{account_hint} stage:{entry.stage if entry else '-'}", client_ip)
        if entry:
            log_action(db, user.id, "login.ban_triggered",
                       f"stage:{entry.stage} dim:{entry.dim} until:{entry.until or 'permanent'}",
                       client_ip)
        await db.commit()
        return fail(BizCode.LOGIN_BLOCKED, params=_LOGIN_DENIED, data={"first_ban": True} if entry else None)

    if not user.is_active:
        log_action(db, user.id, "login.inactive", None, client_ip)
        await db.commit()
        return fail(BizCode.LOGIN_BLOCKED, params=_LOGIN_DENIED)

    # 管理员级账号来源 IP 白名单校验（默认空 = 不限制；普通用户不经过此校验）
    if is_admin_tier(Role(user.role.value)) and not await is_admin_network(request, db):
        log_action(db, user.id, "login.denied_network", None, client_ip)
        await db.commit()
        return fail(BizCode.LOGIN_BLOCKED, params=_SOURCE_DENIED)

    # 登录成功：仅本账号成功才清零本账号两套维度的计数与惩罚阶段
    await bf_reset(NORMAL_POLICY, uid, dims)
    user.last_login_at = now

    # 记住此设备 → 硬顶 30 天；否则沿用 JWT_EXPIRE_HOURS
    if req.remember_device:
        expires_delta = timedelta(days=REMEMBER_DEVICE_DAYS)
    else:
        expires_delta = timedelta(hours=settings.JWT_EXPIRE_HOURS)

    # 创建登录会话记录（设备 / IP / 登录地点 / UA）
    global_timeout_minutes = ss.session_idle_timeout_minutes if ss else 30

    device_name, device_model = parse_user_agent(ua)
    loc_zh, loc_en = resolve_location(client_ip)
    sid = uuid.uuid4().hex
    db.add(LoginSession(
        user_id=user.id,
        session_id=sid,
        device_name=device_name[:128],
        device_model=device_model[:128],
        user_agent=ua[:512],
        ip=client_ip,
        location_zh=loc_zh[:128] if loc_zh else None,
        location_en=loc_en[:128] if loc_en else None,
        remember_device=req.remember_device,
        login_at=now,
        last_active_at=now,
        # 非记住设备：expires_at = now + 全局配置空闲超时（分钟）
        # 记住设备：expires_at = now + 30天硬顶
        expires_at=now + (timedelta(days=REMEMBER_DEVICE_DAYS) if req.remember_device else timedelta(minutes=global_timeout_minutes)),
    ))
    token = create_access_token(str(user.id), Role(user.role.value), sid, expires_delta)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(expires_delta.total_seconds()) if req.remember_device else None,
        httponly=True,
        secure=cookie_secure(request),
        samesite="strict",
        path="/",
    )
    # 登录后轮换 CSRF 令牌，防止会话固定
    csrf_token = new_csrf_token()
    set_csrf_cookie(response, request, csrf_token)
    _log(db, user.id, "login", f"session:{sid[:8]} device:{device_model}", client_ip)
    return LoginResponse(
        role=Role(user.role.value),
        csrf_token=csrf_token,
        username=user.username,
        must_change_password=user.must_change_password,
        realname_verified=user.realname_verified,
    )


# ---------- 退出登录 ----------
@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """撤销当前会话并清除 Cookie；登录态已失效时也能安全调用。

    Break-Glass 会话：删除 KV 会话条目并写审计（操作者 [BREAK_GLASS_ESCAPE]）。
    """
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        try:
            payload = decode_token(token)
        except HTTPException:
            payload = {}
        jti = payload.get("jti")
        if jti:
            if payload.get("bg") is True:
                await bg_session_revoke(jti)
                log_action(db, {"break_glass": True, "username": str(payload.get("sub", ""))},
                           "bg_logout", f"session:{jti[:8]}", get_client_ip(request))
                await db.commit()
            else:
                sess = (await db.execute(
                    select(LoginSession).where(LoginSession.session_id == jti)
                )).scalar_one_or_none()
                if sess and not sess.revoked:
                    sess.revoked = True
                    sess.revoked_at = _now()
                    _log(db, sess.user_id, "logout", f"session:{jti[:8]}", get_client_ip(request))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


# ---------- 心跳：保持会话活跃（前端可见时定时调用） ----------
@router.get("/heartbeat")
async def heartbeat(user: dict = Depends(require_role(Role.MEMBER, allow_pending_password_change=True))):
    return {"ok": True}


# ---------- 登录会话列表（当前用户自己的设备） ----------
@router.get("/sessions", response_model=list[LoginSessionOut])
async def list_sessions(
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    _reject_break_glass(user)
    result = await db.execute(
        select(LoginSession)
        .where(LoginSession.user_id == int(user["user_id"]))
        .order_by(LoginSession.login_at.desc())
        .limit(20)
    )
    rows = result.scalars().all()
    jti = user.get("jti")
    out = []
    for r in rows:
        item = LoginSessionOut.model_validate(r)
        item.is_current = bool(jti) and r.session_id == jti
        out.append(item)
    return out


# ---------- 踢出登录（撤销指定会话） ----------
@router.delete("/sessions/{session_row_id}")
async def revoke_session(
    session_row_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    _reject_break_glass(user)
    result = await db.execute(
        select(LoginSession).where(
            LoginSession.id == session_row_id,
            LoginSession.user_id == int(user["user_id"]),
        )
    )
    sess = result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="登录记录不存在")
    if sess.revoked:
        raise HTTPException(status_code=400, detail="该会话已退出")
    sess.revoked = True
    sess.revoked_at = _now()
    _log(db, user, "session.revoke",
         f"session:{sess.session_id[:8]} device:{sess.device_model}",
         get_client_ip(request))
    await db.commit()
    is_current = bool(user.get("jti")) and sess.session_id == user["jti"]
    return {"ok": True, "current_kicked": is_current}


@router.post("/sessions/revoke-others")
async def revoke_other_sessions(
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """一键下线全部其他设备：撤销当前会话之外该用户的全部未撤销会话。"""
    _reject_break_glass(user)
    jti = user.get("jti")
    stmt = select(LoginSession).where(
        LoginSession.user_id == int(user["user_id"]),
        LoginSession.revoked.is_(False),
    )
    if jti:
        stmt = stmt.where(LoginSession.session_id != jti)
    rows = (await db.execute(stmt)).scalars().all()
    now = _now()
    for r in rows:
        r.revoked = True
        r.revoked_at = now
    _log(db, user, "session.revoke_others",
         f"count:{len(rows)}", get_client_ip(request))
    await db.commit()
    return {"ok": True, "revoked": len(rows)}


@router.post("/sessions/revoke-all")
async def revoke_all_sessions(
    request: Request,
    response: Response,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """销毁当前用户的全部会话（含当前会话），并清除登录 Cookie。

    用途：/setting/存储与缓存 →「清除本站 Cookie」，强制全端登出。
    敏感操作写审计日志（只增不改不删）。
    """
    _reject_break_glass(user)
    uid = int(user["user_id"])
    rows = (
        await db.execute(
            select(LoginSession).where(
                LoginSession.user_id == uid,
                LoginSession.revoked.is_(False),
            )
        )
    ).scalars().all()
    now = _now()
    for r in rows:
        r.revoked = True
        r.revoked_at = now
    _log(db, user, "session.revoke_all",
         f"count:{len(rows)}", get_client_ip(request))
    await db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True, "revoked": len(rows)}


# ---------- 当前用户 ----------
@router.get("/me", response_model=UserOut)
async def me(
    user: dict = Depends(require_role(Role.MEMBER, allow_pending_password_change=True, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    # Break-Glass：合成响应（永不查 users 表、不存在任何虚拟库行）
    if user.get("break_glass"):
        ss = await db.get(SystemSetting, 1)
        return UserOut(
            id=0,
            username=user["username"],
            email="",
            role=Role.SUPER_ADMIN,
            is_active=True,
            student_id="",
            real_name=user["username"],
            phone="",
            is_break_glass=True,
            must_setup=not (ss.system_initialized if ss else False),
            created_at=_now(),
        )
    u = await db.get(User, int(user["user_id"]))
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    return u


# ---------- 个人资料 ----------
AVATAR_MAX_SIZE = 5 * 1024 * 1024  # 压缩后落盘上限 5MB
AVATAR_RAW_MAX_SIZE = 15 * 1024 * 1024  # 原始上传上限：大图先压缩，压缩后仍超限才拒绝
AVATAR_DIR = Path("uploads/avatars")
# 个人主页封面（V0.5.5 §9.3）：与头像同一套压缩/格式校验，尺寸更宽松
BANNER_DIR = Path("uploads/banners")


def _sniff_image(data: bytes) -> str | None:
    """按文件头魔数识别图片类型（不信任客户端声明的 Content-Type / 扩展名）。"""
    from app.core.images import sniff_image_ext

    return sniff_image_ext(data)


@router.get("/profile", response_model=UserOut)
async def get_profile(
    user: dict = Depends(require_role(Role.MEMBER, allow_pending_password_change=True, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """获取当前用户完整资料。"""
    _reject_break_glass(user)
    u = await db.get(User, int(user["user_id"]))
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    return u


@router.put("/me", response_model=UserOut)
@router.put("/profile", response_model=UserOut)
async def update_profile(
    req: ProfileUpdate,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """更新个人资料：显示名称、真实姓名、手机号、学号。"""
    _reject_break_glass(user)
    u = await db.get(User, int(user["user_id"]))
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 检查 username 唯一性（如修改了）
    old_username = u.username
    if req.username and req.username != u.username:
        dup = await db.execute(select(User).where(User.username == req.username))
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="显示名称已存在")
        u.username = req.username
    if req.username is not None and req.username != old_username:
        _log(db, u.id, "profile.username_change", f"{old_username}->{req.username}", get_client_ip(request))
    if req.display_name is not None:
        u.display_name = req.display_name
    if req.real_name is not None:
        u.real_name = req.real_name
    if req.phone is not None:
        u.phone = req.phone
    # ---- Module D：学校资料双重拦截（前端隐藏输入框 + 后端强制校验） ----
    # 未通过学校身份验证（identity_school_verified=false）的账号拒绝写入学校相关字段。
    school_ids = (req.college_id, req.major_id, req.grade_id, req.class_id)
    school_ids_provided = any(v is not None for v in school_ids)
    if req.student_id is not None and not u.identity_school_verified:
        raise HTTPException(status_code=403, detail="学校身份未通过验证，不能修改学号")
    if school_ids_provided:
        if not u.identity_school_verified:
            raise HTTPException(status_code=403, detail="学校身份未通过验证，不能修改学校资料")
        # 四个 ID 必须成组提交
        if any(v is None for v in school_ids):
            raise HTTPException(status_code=400, detail="学校资料必须完整提交学院、年级、专业、班级")
        # 整套组合严格校验（存在 + 启用 + 层级一致；复用学校验证校验逻辑）
        from app.api.school_verify import _validate_combo
        await _validate_combo(db, req.college_id, req.major_id, req.grade_id, req.class_id)
        u.college_id = req.college_id
        u.major_id = req.major_id
        u.grade_id = req.grade_id
        u.class_id = req.class_id
    if req.student_id is not None:
        # 已验证用户自行修改学号：格式由 schema 校验（11 位数字），年份区间按用户表单规则校验
        from app.api.school_verify import validate_student_id_year
        validate_student_id_year(req.student_id)
        u.student_id = req.student_id
    # 时区：空字符串 = 恢复自动探测（存 NULL）；否则校验 IANA 后保存
    if req.timezone is not None:
        tz = req.timezone.strip()
        if tz == "":
            u.timezone = None
        else:
            try:
                from zoneinfo import ZoneInfo
                ZoneInfo(tz)
            except Exception:
                raise HTTPException(status_code=400, detail="无效的 IANA 时区")
            u.timezone = tz
    # 国家 + 省份/城市：空字符串 = 清空（存 NULL）
    if req.country is not None:
        u.country = req.country.strip() or None
    if req.region is not None:
        u.region = req.region.strip() or None

    # —— 标准化地区编码（i18n：只存 code，不存显示文字） ——
    from app.data.geo_data import find_subdivision, get_country

    if req.country_code is not None:
        cc = req.country_code.strip() or None
        if cc is not None:
            if get_country(cc) is None:
                raise HTTPException(status_code=400, detail="无效的国家/地区代码")
            # 国家变更 → 一级/二级行政区必然失效，清空（locality_text 自由文本保留用户可自行清理）
            if cc != u.country_code:
                u.subdiv1_code = None
                u.subdiv2_code = None
        u.country_code = cc
    if req.subdiv1_code is not None:
        s1 = req.subdiv1_code.strip() or None
        if s1 is not None:
            if not u.country_code or find_subdivision(u.country_code, s1) is None:
                raise HTTPException(status_code=400, detail="无效的一级行政区代码")
            # 一级变更 → 二级失效
            if s1 != u.subdiv1_code:
                u.subdiv2_code = None
        u.subdiv1_code = s1
    if req.subdiv2_code is not None:
        s2 = req.subdiv2_code.strip() or None
        if s2 is not None:
            if not u.country_code or find_subdivision(u.country_code, s2) is None:
                raise HTTPException(status_code=400, detail="无效的二级行政区代码")
        u.subdiv2_code = s2
    if req.locality_text is not None:
        u.locality_text = req.locality_text.strip() or None

    # ---- 区域格式（只存编码 / 模式字符串；前端渲染层生效，后端业务逻辑不受影响） ----
    if req.primary_calendar is not None:
        v = req.primary_calendar.strip() or None
        if v is not None and v not in ("gregorian", "chinese", "japanese", "buddhist"):
            raise HTTPException(status_code=400, detail="无效的主日历")
        u.primary_calendar = v
    if req.secondary_calendar is not None:
        v = req.secondary_calendar.strip() or None
        if v is not None and v not in ("chinese", "japanese", "buddhist"):
            raise HTTPException(status_code=400, detail="无效的第二日历")
        u.secondary_calendar = v
    if req.week_first_day is not None:
        v = req.week_first_day.strip() or None
        if v is not None and v not in ("sunday", "monday", "tuesday"):
            raise HTTPException(status_code=400, detail="无效的一周起始日")
        u.week_first_day = v
    if req.date_short_pattern is not None:
        v = req.date_short_pattern.strip() or None
        u.date_short_pattern = v
    if req.date_long_pattern is not None:
        v = req.date_long_pattern.strip() or None
        u.date_long_pattern = v
    if req.time_short_pattern is not None:
        v = req.time_short_pattern.strip() or None
        u.time_short_pattern = v
    if req.time_long_pattern is not None:
        v = req.time_long_pattern.strip() or None
        u.time_long_pattern = v
    # 本地化系统：用户个人偏好（空字符串=恢复跟随系统存 NULL）
    if req.locale is not None:
        v = req.locale.strip() or None
        if v is not None:
            from app.core.locales import validate_locale
            if not validate_locale(v):
                raise HTTPException(status_code=400, detail="无效的界面语言")
        u.locale = v
    if req.region_code is not None:
        v = req.region_code.strip() or None
        if v is not None:
            v = v.upper()
            if len(v) != 2 or not v.isalpha():
                raise HTTPException(status_code=400, detail="无效的区域代码（需 ISO-3166-1 二位）")
        u.region_code = v
    if req.currency is not None:
        v = req.currency.strip() or None
        if v is not None and v.upper() not in ("CNY", "USD", "EUR", "GBP", "JPY", "KRW", "HKD", "SGD", "TWD", "RUB"):
            raise HTTPException(status_code=400, detail="无效的货币单位")
        u.currency = v.upper() if v else v

    # ---- 个人资料扩展字段（Phase 规格补齐） ----
    # gender / bio / theme：空字符串=清空（存 NULL）；schema 层已校验 allowlist
    if req.gender is not None:
        u.gender = req.gender.strip() or None
    if req.birthday is not None:
        u.birthday = req.birthday
    if req.bio is not None:
        u.bio = req.bio.strip() or None
    if req.theme is not None:
        u.theme = req.theme.strip() or None
    # 个人主页封面纯色（V0.5.5 §9.3）：空字符串=恢复系统默认（存 NULL）
    if req.profile_banner_color is not None:
        u.profile_banner_color = req.profile_banner_color.strip() or None
    # profile_privacy：用 exclude_unset 区分「未传」与「显式传 null/空 dict=重置默认」。
    # 传入非空 dict 则合并更新（保留旧值中未提供的键）。
    raw_data = req.model_dump(exclude_unset=True)
    if "profile_privacy" in raw_data:
        if req.profile_privacy:
            old = u.profile_privacy or {}
            new = {**old, **req.profile_privacy}
            u.profile_privacy = new or None
        else:
            u.profile_privacy = None

    _log(db, u.id, "profile.update", None, get_client_ip(request))
    await db.commit()
    await db.refresh(u)
    return u


@router.post("/avatar", response_model=AvatarUploadOut)
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """上传头像（jpg/png/webp，原始文件最大 15MB）；按文件内容识别类型，拒绝伪装文件；
    统一 80% 质量压缩后存储，压缩结果仍超过 5MB 才拒绝。"""
    _reject_break_glass(user)
    data = await file.read(AVATAR_RAW_MAX_SIZE + 1)
    if len(data) > AVATAR_RAW_MAX_SIZE:
        raise HTTPException(status_code=400, detail="文件大小不能超过 15MB")
    ext = _sniff_image(data)
    if not ext:
        raise HTTPException(status_code=400, detail="仅支持 JPG/PNG/WEBP 格式")

    # P0：图片统一 80% 质量压缩（超 2048px 等比缩放），压缩结果更大时回退原字节
    from app.core.images import compress_image

    data, ext = compress_image(data, ext)
    if len(data) > AVATAR_MAX_SIZE:
        raise HTTPException(status_code=400, detail="压缩后文件仍超过 5MB，请降低分辨率后重试")

    filename = f"{user['user_id']}_{uuid.uuid4().hex}{ext}"
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    (AVATAR_DIR / filename).write_bytes(data)

    u = await db.get(User, int(user["user_id"]))
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 删除旧头像文件（只允许删除头像目录内的文件）
    if u.avatar_url:
        old_path = (AVATAR_DIR / Path(u.avatar_url).name).resolve()
        if old_path.parent == AVATAR_DIR.resolve() and old_path.exists():
            old_path.unlink(missing_ok=True)

    avatar_url = f"/uploads/avatars/{filename}"
    u.avatar_url = avatar_url
    _log(db, u.id, "avatar.upload", None, get_client_ip(request))
    await db.commit()
    return AvatarUploadOut(avatar_url=avatar_url)


@router.delete("/avatar")
async def reset_avatar(
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """恢复默认头像：清空 avatar_url 并删除旧头像文件。"""
    _reject_break_glass(user)
    u = await db.get(User, int(user["user_id"]))
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    if u.avatar_url:
        old_path = (AVATAR_DIR / Path(u.avatar_url).name).resolve()
        if old_path.parent == AVATAR_DIR.resolve() and old_path.exists():
            old_path.unlink(missing_ok=True)
        u.avatar_url = None
        _log(db, u.id, "avatar.reset", None, get_client_ip(request))
        await db.commit()
    return {"ok": True}


# ---------- 个人主页封面（V0.5.5 §9.3） ----------
@router.post("/banner", response_model=BannerUploadOut)
async def upload_banner(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """上传个人主页封面（jpg/png/webp，原始最大 15MB）；与头像同一套
    魔数识别 + 80% 压缩；压缩后仍超 5MB 拒绝。旧封面文件同步清理。"""
    _reject_break_glass(user)
    data = await file.read(AVATAR_RAW_MAX_SIZE + 1)
    if len(data) > AVATAR_RAW_MAX_SIZE:
        raise HTTPException(status_code=400, detail="文件大小不能超过 15MB")
    ext = _sniff_image(data)
    if not ext:
        raise HTTPException(status_code=400, detail="仅支持 JPG/PNG/WEBP 格式")

    from app.core.images import compress_image

    data, ext = compress_image(data, ext)
    if len(data) > AVATAR_MAX_SIZE:
        raise HTTPException(status_code=400, detail="压缩后文件仍超过 5MB，请降低分辨率后重试")

    filename = f"{user['user_id']}_{uuid.uuid4().hex}{ext}"
    BANNER_DIR.mkdir(parents=True, exist_ok=True)
    (BANNER_DIR / filename).write_bytes(data)

    u = await db.get(User, int(user["user_id"]))
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 删除旧封面文件（只允许删除封面目录内的文件）
    if u.profile_banner:
        old_path = (BANNER_DIR / Path(u.profile_banner).name).resolve()
        if old_path.parent == BANNER_DIR.resolve() and old_path.exists():
            old_path.unlink(missing_ok=True)

    banner_url = f"/uploads/banners/{filename}"
    u.profile_banner = banner_url
    _log(db, u.id, "banner.upload", None, get_client_ip(request))
    await db.commit()
    return BannerUploadOut(banner_url=banner_url)


@router.delete("/banner")
async def reset_banner(
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """恢复默认封面：清空 profile_banner 并删除旧封面文件（纯色设置不受影响）。"""
    _reject_break_glass(user)
    u = await db.get(User, int(user["user_id"]))
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    if u.profile_banner:
        old_path = (BANNER_DIR / Path(u.profile_banner).name).resolve()
        if old_path.parent == BANNER_DIR.resolve() and old_path.exists():
            old_path.unlink(missing_ok=True)
        u.profile_banner = None
        _log(db, u.id, "banner.reset", None, get_client_ip(request))
        await db.commit()
    return {"ok": True}


# ---------- 修改密码 ----------
@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    request: Request,
    response: Response,
    user: dict = Depends(require_role(Role.MEMBER, allow_pending_password_change=True, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """已登录改密（个人设置）：强制旧密码，不提供邮箱验证码绕过入口。

    校验顺序（需求固定）：① 旧密码哈希 → ② 新密码强度 → ③ 两次新密码一致。
    默认保留当前设备会话（其余会话全部下线）；取消勾选 = 全部会话（含本机）下线。
    BG 应急账号不适用（无 users 行）；其密码遗忘只能通过环境变量 + 重启重置。
    """
    _reject_break_glass(user)
    u = await db.get(User, int(user["user_id"]))
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    client_ip = get_client_ip(request)
    fingerprint = (request.headers.get("x-browser-fingerprint") or "").strip()[:128] or None

    # ① 旧密码：与数据库哈希比对，错误直接拒绝（无法跳过）
    if not verify_password(req.old_password, u.password_hash):
        _log(db, u.id, "password_change.fail", '{"method": "old_password"}', client_ip)
        await db.commit()
        raise HTTPException(status_code=400, detail="旧密码错误")
    # ② 新密码强度（全局强密码策略）
    if req.new_password == req.old_password:
        raise HTTPException(status_code=400, detail="新密码不能与旧密码相同")
    _require_strong_password(req.new_password, u.username, u.email)
    # ③ 两次新密码一致（后端二次校验，防御前端绕过）
    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="两次输入的新密码不相同")

    u.password_hash = hash_password(req.new_password)
    u.must_change_password = False
    u.password_changed_at = _now()
    if req.keep_current_device:
        # 默认：保留当前设备，其余会话全部下线
        await _revoke_user_sessions(db, u.id, keep_jti=user.get("jti"))
        revoked_scope = "others"
    else:
        # 取消勾选：全部会话（含本机）强制下线，清除本机登录 Cookie
        await _revoke_user_sessions(db, u.id)
        revoked_scope = "all"
    # 审计：uid / 时间(created_at) / 客户端IP / 浏览器指纹 / 验证方式 / trace_id(=request_id)
    _log(db, u.id, "password_change", json.dumps({
        "method": "old_password",
        "fingerprint": fingerprint,
        "keep_current_device": req.keep_current_device,
        "sessions_revoked": revoked_scope,
    }, ensure_ascii=False), client_ip)
    await db.commit()
    if revoked_scope == "all":
        # 全部下线（含本机）：清除本机登录 Cookie，前端随后跳转登录页
        response.delete_cookie(SESSION_COOKIE, path="/")
        return {"ok": True, "current_session_revoked": True}
    return {"ok": True, "current_session_revoked": False}


# ---------- 用户管理（查看：users:view；管理：仅 super_admin） ----------
@router.get("/users", response_model=list[UserOut] | dict)
async def list_users(
    q: str | None = None,
    role: UserRole | None = None,
    is_active: bool | None = None,
    include_deleted: bool = False,
    page: int | None = Query(default=None, ge=1, description="传入时分页返回 {items,total,page,page_size}；缺省返回全量列表（兼容）"),
    page_size: int = Query(default=20, ge=1, le=200),
    user: dict = Depends(require_permission("users", "view")),
    db: AsyncSession = Depends(get_db),
):
    """账号列表：q 模糊匹配显示名称/真实姓名/学号/邮箱，支持角色与启用状态筛选。

    默认排除软删除账号（内容回收站数据走 /api/admin/recycle）。
    传 page 参数时启用分页（P0 规范：用户分页列表）。
    """
    stmt = select(User).order_by(User.id)
    if not include_deleted:
        stmt = stmt.where(User.is_deleted.is_(False))
    if q:
        kw = f"%{q}%"
        stmt = stmt.where(or_(
            User.username.like(kw),
            User.real_name.like(kw),
            User.student_id.like(kw),
            User.email.like(kw),
        ))
    if role:
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    if page is None:
        result = await db.execute(stmt)
        return result.scalars().all()
    # 裸 ORM 对象无法被 dict 响应分支序列化，必须经 UserOut 转为 JSON 基本类型
    return await paginate(db, stmt, page, page_size, out_model=UserOut)


@router.get("/users/{user_id}", response_model=UserOut)
async def get_user_detail(
    user_id: int,
    user: dict = Depends(require_permission("users", "view")),
    db: AsyncSession = Depends(get_db),
):
    """用户详情（P0：GET /api/admin/users/{id} 语义；回收站中的账号同样可查）。"""
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    return u


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    req: UserCreate,
    request: Request,
    user: dict = Depends(require_role(Role.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    # 查重
    existing = await db.execute(
        select(User).where(or_(User.username == req.username, User.email == req.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名或邮箱已存在")
    new_user = User(
        username=req.username,
        email=req.email,
        password_hash=hash_password(req.password),
        role=UserRole(req.role.value),
        # 管理员代设的初始密码，首次登录必须修改
        must_change_password=True,
        student_id=req.student_id,
        real_name=req.real_name,
        phone=req.phone,
        # 超管创建的账号已登记学号/真名/手机号，视为已实名
        realname_verified=True,
    )
    db.add(new_user)
    await db.flush()
    _log(db, user, "user.create", f"user:{new_user.id} role:{req.role.value}",
         get_client_ip(request))
    return new_user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """软删除账号：送入内容回收站，定时任务 30 天后物理清除。

    历史报名记录完整保留（统计不受影响）；会话全部吊销、登录被拒绝。
    """
    if ctx_uid(user) == user_id:
        raise HTTPException(status_code=400, detail="不能删除自己")
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    if u.is_deleted:
        raise HTTPException(status_code=400, detail="该账号已在内容回收站中")
    u.is_deleted = True
    u.deleted_at = _now()
    u.is_active = False
    await _revoke_user_sessions(db, user_id)
    _log(db, user, "user.delete", f"user:{user_id} soft", get_client_ip(request))


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    req: UserUpdate,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """更新账号信息：自己可改基础资料，super_admin 额外可改 role/is_active/permission_overrides。"""
    is_self = ctx_uid(user) == user_id
    is_super = user["role"] == Role.SUPER_ADMIN.value
    if not (is_self or is_super):
        raise HTTPException(status_code=403, detail="只能修改自己的信息")
    if not is_super and (req.role is not None or req.is_active is not None
                         or req.permission_overrides is not None
                         or req.club_position is not None):
        raise HTTPException(status_code=403, detail="无权修改角色、账号状态、权限或职务")

    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 权限覆盖仅 super_admin 可写；不能改自己的覆盖（防止提权），模块键必须合法
    if req.permission_overrides is not None:
        if is_self:
            raise HTTPException(status_code=400, detail="不能修改自己的权限覆盖")
        unknown = set(req.permission_overrides.keys()) - set(PERMISSION_MODULES)
        if unknown:
            raise HTTPException(status_code=400, detail=f"未知权限模块: {', '.join(sorted(unknown))}")
        for mod, actions in req.permission_overrides.items():
            if not isinstance(actions, list) or any(a not in ("view", "manage") for a in actions):
                raise HTTPException(status_code=400, detail="权限动作仅支持 view / manage")
        u.permission_overrides = req.permission_overrides or None
        # V0.5.5 §3.2：覆盖矩阵变更加专门审计（detail 带模块清单，区别于笼统 user.update）
        _log(db, user, "user.permission_overrides",
             f"user:{user_id} {json.dumps(req.permission_overrides, ensure_ascii=False)}",
             get_client_ip(request))

    if req.username is not None and req.username != u.username:
        dup = await db.execute(select(User).where(User.username == req.username))
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="显示名称已存在")
        u.username = req.username
    if req.real_name is not None:
        u.real_name = req.real_name
    if req.student_id is not None:
        u.student_id = req.student_id
    if req.phone is not None:
        u.phone = req.phone

    # 仅 super_admin 可改角色和停用状态；不能降级 / 停用自己，避免失去最后的超管
    if is_super:
        if is_self and (
            (req.role is not None and req.role != Role.SUPER_ADMIN) or req.is_active is False
        ):
            raise HTTPException(status_code=400, detail="不能降级或停用自己的账号")
        if req.role is not None and req.role.value != u.role.value:
            _log(db, user, "user.role_change",
                 f"user:{user_id} {u.role.value}->{req.role.value}", get_client_ip(request))
            u.role = UserRole(req.role.value)
            await _revoke_user_sessions(db, user_id)
        if req.is_active is not None and req.is_active != u.is_active:
            u.is_active = req.is_active
            if not req.is_active:
                await _revoke_user_sessions(db, user_id)
        # 社团职务（展示层，与权限解耦）：空串 = 清除（置 NULL）
        if req.club_position is not None:
            new_pos = req.club_position or None
            if new_pos != u.club_position:
                _log(db, user, "user.club_position",
                     f"user:{user_id} {u.club_position or '-'}->{new_pos or '-'}",
                     get_client_ip(request))
                u.club_position = new_pos

    _log(db, user, "user.update", f"user:{user_id}", get_client_ip(request))
    await db.commit()
    await db.refresh(u)
    return u


class UsersBatchUpdate(BaseModel):
    ids: list[int]
    is_active: bool


@router.post("/users/batch")
async def batch_update_users(
    body: UsersBatchUpdate,
    request: Request,
    user: dict = Depends(require_role(Role.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """批量启停账号：仅 super_admin；不能包含自己；停用即撤销其会话并审计。"""
    me = ctx_uid(user)
    if me is not None and me in body.ids:
        raise HTTPException(status_code=400, detail="不能批量操作自己的账号")
    updated: list[int] = []
    not_found: list[int] = []
    for uid in body.ids:
        u = await db.get(User, uid)
        if not u:
            not_found.append(uid)
            continue
        if u.is_active != body.is_active:
            u.is_active = body.is_active
            if not body.is_active:
                await _revoke_user_sessions(db, uid)
        updated.append(uid)
    _log(db, user, "user.batch_update",
         f"is_active={body.is_active} updated={updated} not_found={not_found}",
         get_client_ip(request))
    await db.commit()
    return {"updated": len(updated), "not_found": not_found}


async def require_break_glass(user: dict = Depends(require_role(Role.SUPER_ADMIN))) -> dict:
    """依赖：仅 Break-Glass 应急账号可用（普通 super_admin 明确不可用）。"""
    if not user.get("break_glass"):
        raise HTTPException(status_code=403, detail="仅应急账号可执行该操作")
    return user


@router.post("/users/purge-admins")
async def purge_admin_accounts(
    request: Request,
    user: dict = Depends(require_break_glass),
    db: AsyncSession = Depends(get_db),
):
    """灾难修复特权（仅 Break-Glass）：清空数据库内全部 admin / super_admin 业务账号。

    软删除送入内容回收站（可由应急账号恢复）；不受普通管理员「至少保留一个
    admin」的保护限制。member / editor 账号不受影响。逐批写入审计日志。
    """
    client_ip = get_client_ip(request)
    rows = (await db.execute(
        select(User).where(
            User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
            User.is_deleted.is_(False),
        )
    )).scalars().all()
    purged: list[int] = []
    for u in rows:
        u.is_deleted = True
        u.deleted_at = _now()
        u.is_active = False
        await _revoke_user_sessions(db, u.id)
        purged.append(u.id)
    _log(db, user, "user.purge_admins", f"count:{len(purged)} ids:{purged}", client_ip)
    await db.commit()
    return {"ok": True, "purged": len(purged)}


def _generate_temp_password(username: str, email: str) -> str:
    """生成满足强口令策略的一次性临时密码。"""
    while True:
        candidate = secrets.token_urlsafe(12) + secrets.choice("!@#$%^&*") + "Aa9"
        if not check_password_strength(candidate, username, email):
            return candidate


@router.post("/users/{user_id}/reset-password")
async def admin_reset_user_password(
    user_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """超级管理员重置任意账号密码：生成临时密码一次性返回，账号强制下次登录改密。"""
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    temp_password = _generate_temp_password(u.username, u.email)
    u.password_hash = hash_password(temp_password)
    u.must_change_password = True
    u.password_changed_at = _now()
    # 重置后全部会话下线，须用临时密码重新登录
    await _revoke_user_sessions(db, user_id)
    _log(db, user, "user.reset_password", f"user:{user_id}",
         get_client_ip(request))
    await db.commit()
    return {"temp_password": temp_password}


# ---------- 忘记密码申请（公开） ----------
@router.post(
    "/forgot-password",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("forgot-password", limit=5, window_seconds=3600))],
)
async def submit_forgot_password(
    req: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """访客提交忘记密码申请，管理员审核后手动联系处理。"""
    reset_req = PasswordResetRequest(
        contact_email=req.contact_email,
        username_hint=req.username_hint,
        reason=req.reason,
    )
    db.add(reset_req)
    await db.flush()
    _log(db, None, "password_reset.submit", f"reset:{reset_req.id}", get_client_ip(request))
    await db.commit()
    return {"ok": True, "id": reset_req.id}


# ---------- 忘记密码：邮箱验证码（公开，独立于人工审核流） ----------
def _email_hash(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()


def _placeholder_email(email: str) -> bool:
    """注册时未提供邮箱生成的占位地址，不视为绑定邮箱。"""
    return email.strip().lower().endswith("@users.placeholder")


@router.post(
    "/forgot-password/send-code",
    dependencies=[Depends(rate_limit("forgot-send-code", limit=5, window_seconds=3600))],
)
async def send_forgot_password_code(
    req: ForgotPasswordSendCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """发送忘记密码验证码到绑定邮箱（未登录找回密码专用通道）。

    防账号枚举（需求硬性规定）：邮箱不存在 / 未绑定 / 占位邮箱 / 停用账号 /
    发送失败，对外一律返回统一模糊提示；真实情况仅写审计与服务端日志。
    限流：IP 5次/小时（rate_limit）+ 同邮箱重发间隔（KV TTL）。
    BG 应急账号无邮箱绑定，天然不适用（其密码遗忘仅可通过环境变量重置）。
    """
    client_ip = get_client_ip(request)
    email = str(req.email).strip()
    ehash = _email_hash(email)
    kv = get_kv()
    sent_key = f"pwreset:sent:{ehash}"
    code_key = f"pwreset:code:{ehash}"
    att_key = f"pwreset:att:{ehash}"

    # 重发间隔：对任何邮箱统一执行（间隔提示本身不暴露邮箱是否存在）
    if await kv.exists(sent_key):
        return {"ok": True, "message": "验证码发送间隔未到，请稍后查收"}
    await kv.set(sent_key, "1", ttl_seconds=settings.EMAIL_CODE_RESEND_INTERVAL_SECONDS)

    user = None
    if not _placeholder_email(email):
        user = (await db.execute(
            select(User).where(User.email == email, User.is_deleted.is_(False))
        )).scalar_one_or_none()
        if user is not None and not user.is_active:
            user = None

    code_sent = False
    if user is not None:
        code = f"{secrets.randbelow(1000000):06d}"
        await kv.setex(code_key, settings.EMAIL_CODE_TTL_SECONDS,
                       hashlib.sha256(code.encode()).hexdigest())
        await kv.setex(att_key, settings.EMAIL_CODE_TTL_SECONDS, "0")
        subject = "GDUE-CA 密码重置验证码"
        body = (
            "您正在重置 GDUE-CA 账号的登录密码。\n\n"
            f"验证码：{code}\n"
            f"{max(settings.EMAIL_CODE_TTL_SECONDS // 60, 1)} 分钟内有效，"
            "请勿泄露给他人。若非本人操作，请忽略本邮件。\n"
        )
        code_sent = await send_email(email, subject, body)
        if not code_sent:
            # SMTP 未配置或发送失败：开发兜底仅记录服务端日志（绝不通过响应回传验证码）
            logger.warning(
                "忘记密码验证码未成功投递（SMTP未配置或失败，仅限开发环境排查）邮箱=%s 验证码=%s",
                email, code)

    _log(db, None, "password_reset.code_sent",
         f"email_hash:{ehash[:12]} sent:{code_sent} smtp:{mailer_configured()}", client_ip)
    await db.commit()
    return {"ok": True, "message": "若该邮箱已绑定账号，验证码已发送，请查收"}


@router.post(
    "/forgot-password/reset",
    dependencies=[Depends(rate_limit("forgot-reset", limit=10, window_seconds=3600))],
)
async def reset_password_with_code(
    req: ForgotPasswordResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """邮箱验证码重置密码：校验验证码 + 强密码策略 + 二次确认（schema 层）。

    成功后该账号全部会话强制下线（无保留本机选项），跳转登录页重新登录。
    验证码错误 / 过期 / 尝试次数用尽，对外统一模糊提示（防猜测防枚举）。
    """
    client_ip = get_client_ip(request)
    fingerprint = (request.headers.get("x-browser-fingerprint") or "").strip()[:128] or None
    email = str(req.email).strip()
    ehash = _email_hash(email)
    kv = get_kv()
    code_key = f"pwreset:code:{ehash}"
    att_key = f"pwreset:att:{ehash}"

    raw = await kv.get(code_key)
    if not raw:
        raise HTTPException(status_code=400, detail="验证码无效或已过期")
    # 每次校验尝试即计数（incrby 保留原 TTL）；超过上限立即作废
    attempts = await kv.incrby(att_key, 1)
    if attempts > settings.EMAIL_CODE_MAX_ATTEMPTS:
        await kv.delete(code_key, att_key)
        raise HTTPException(status_code=400, detail="验证码无效或已过期")
    if raw != hashlib.sha256(req.code.encode()).hexdigest():
        raise HTTPException(status_code=400, detail="验证码无效或已过期")

    user = (await db.execute(
        select(User).where(User.email == email, User.is_deleted.is_(False))
    )).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=400, detail="验证码无效或已过期")

    _require_strong_password(req.new_password, user.username, user.email)
    user.password_hash = hash_password(req.new_password)
    user.must_change_password = False
    user.password_changed_at = _now()
    # 全部会话强制下线（无保留本机选项）
    await _revoke_user_sessions(db, user.id)
    await kv.delete(code_key, att_key, f"pwreset:sent:{ehash}")
    _log(db, user.id, "password_reset", json.dumps({
        "method": "email_verification_code",
        "fingerprint": fingerprint,
        "sessions_revoked": "all",
    }, ensure_ascii=False), client_ip)
    await db.commit()
    return {"ok": True}


# ---------- 忘记密码申请列表（仅 admin+） ----------
@router.get("/password-resets", response_model=list[PasswordResetOut])
async def list_password_resets(
    status_filter: PasswordResetStatus | None = None,
    user: dict = Depends(require_permission("review.resets", "view")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PasswordResetRequest)
    if status_filter:
        # str 枚举成员与 String 列比较时按其值绑定（"pending" 等）
        stmt = stmt.where(PasswordResetRequest.status == status_filter)
    stmt = stmt.order_by(PasswordResetRequest.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


# ---------- 处理忘记密码申请（仅 admin+） ----------
@router.patch("/password-resets/{reset_id}", response_model=PasswordResetOut)
async def handle_password_reset(
    reset_id: int,
    req: PasswordResetHandleRequest,
    request: Request,
    user: dict = Depends(require_permission("review.resets", "manage")),
    db: AsyncSession = Depends(get_db),
):
    reset_req = await db.get(PasswordResetRequest, reset_id)
    if not reset_req:
        raise HTTPException(status_code=404, detail="申请不存在")
    reset_req.status = req.status
    reset_req.admin_note = req.admin_note
    reset_req.handled_by = ctx_uid(user)
    reset_req.handled_at = _now()
    _log(db, user, f"password_reset.{req.status}", f"reset:{reset_id}",
         get_client_ip(request))
    await db.commit()
    return reset_req


class PasswordResetBatchRequest(BaseModel):
    ids: list[int]
    status: PasswordResetStatus  # 仅 HANDLED / REJECTED 合法，由 Pydantic 校验


# ---------- 批量处理忘记密码申请（仅 admin+） ----------
@router.post("/password-resets/batch")
async def batch_handle_password_resets(
    req: PasswordResetBatchRequest,
    request: Request,
    user: dict = Depends(require_permission("review.resets", "manage")),
    db: AsyncSession = Depends(get_db),
):
    if not req.ids:
        raise HTTPException(status_code=400, detail="未选择任何申请")
    result = await db.execute(
        select(PasswordResetRequest).where(PasswordResetRequest.id.in_(req.ids))
    )
    rows = result.scalars().all()
    for row in rows:
        row.status = req.status
        row.handled_by = ctx_uid(user)
        row.handled_at = _now()
    _log(db, user, f"password_reset.batch_{req.status.value}",
         ",".join(str(i) for i in req.ids), get_client_ip(request))
    await db.commit()
    return {"updated": len(rows)}


# ---------- 安全问题（紧急恢复，仅内网可用） ----------
def security_answer_digest(answer: str) -> str:
    """答案规范化（去首尾空格 + 小写）后取 SHA-256，再交给 bcrypt（规避 72 字节上限）。"""
    return hashlib.sha256(answer.strip().lower().encode("utf-8")).hexdigest()


# 安全问题紧急恢复始终仅限内网（与管理员登录白名单 ADMIN_TRUSTED_IPS 相互独立）
_INTRANET_NETWORKS = "127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7"


def _require_intranet(request: Request) -> None:
    from app.core.middleware import ip_in_networks

    if not ip_in_networks(get_client_ip(request), _INTRANET_NETWORKS):
        raise HTTPException(status_code=403, detail="该功能仅允许通过内网访问")


@router.get("/security-question", response_model=SecurityQuestionOut)
async def get_security_question(request: Request, db: AsyncSession = Depends(get_db)):
    """返回当前安全问题（不含答案），用于紧急恢复页面；仅内网可访问。"""
    _require_intranet(request)
    q = await db.get(SecurityQuestion, 1)
    if not q:
        raise HTTPException(status_code=404, detail="未配置安全问题，请联系超级管理员线下处理")
    return SecurityQuestionOut(question=q.question)


@router.post(
    "/recover",
    dependencies=[Depends(rate_limit("recover", limit=5, window_seconds=900))],
)
async def recover_via_security_question(
    req: SecurityAnswerRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """所有管理员失能时的紧急恢复：答对安全问题 → 重置超管密码并重新启用（仅内网）。"""
    _require_intranet(request)
    client_ip = get_client_ip(request)
    # 系统初始化门禁：未完成初始化时该接口无意义（尚无业务管理员可恢复）
    ss = await db.get(SystemSetting, 1)
    if ss and not ss.system_initialized:
        return fail(BizCode.SYSTEM_NOT_INITIALIZED, params=_INIT_REQUIRED)
    q = await db.get(SecurityQuestion, 1)
    if not q:
        raise HTTPException(status_code=404, detail="未配置安全问题，请联系超级管理员线下处理")
    if not verify_password(security_answer_digest(req.answer), q.answer):
        _log(db, None, "account.recover_fail", None, client_ip)
        await db.commit()
        raise HTTPException(status_code=403, detail="安全问题答案错误")
    # 找到 super_admin 账号，重置密码并重新启用
    result = await db.execute(
        select(User).where(User.role == UserRole.SUPER_ADMIN).order_by(User.id)
    )
    super_admin = result.scalars().first()
    if not super_admin:
        raise HTTPException(status_code=404, detail="未找到超级管理员账号")
    _require_strong_password(req.new_password, super_admin.username, super_admin.email)
    super_admin.password_hash = hash_password(req.new_password)
    super_admin.is_active = True
    super_admin.must_change_password = True
    super_admin.password_changed_at = _now()
    await _revoke_user_sessions(db, super_admin.id)
    _log(db, super_admin.id, "account.recover", None, client_ip)
    await db.commit()
    return {"ok": True, "username": super_admin.username}


# ---------- 安全问题管理（仅 super_admin） ----------
@router.put("/security-question", response_model=SecurityQuestionOut)
async def update_security_question(
    req: SecurityQuestionUpdate,
    request: Request,
    user: dict = Depends(require_role(Role.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    answer_hash = hash_password(security_answer_digest(req.answer))
    q = await db.get(SecurityQuestion, 1)
    if not q:
        q = SecurityQuestion(id=1, question=req.question, answer=answer_hash)
        db.add(q)
    else:
        q.question = req.question
        q.answer = answer_hash
    _log(db, user, "security_question.update", None, get_client_ip(request))
    await db.commit()
    return SecurityQuestionOut(question=q.question)
