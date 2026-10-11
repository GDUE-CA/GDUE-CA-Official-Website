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
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.csrf import CSRF_COOKIE, SESSION_COOKIE, cookie_secure, new_csrf_token, set_csrf_cookie
from app.core.ip_location import resolve_location
from app.core.middleware import get_client_ip
from app.core.password_policy import check_password_strength
from app.core.permissions import PERMISSION_MODULES, require_permission
from app.core.rate_limit import rate_limit
from app.core.security import (
    REMEMBER_DEVICE_DAYS,
    Role,
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
    User,
    UserRole,
)
from app.db.session import get_db
from app.schemas.auth import (
    AvatarUploadOut,
    ChangePasswordRequest,
    ForgotPasswordRequest,
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
settings = get_settings()


def _log(db: AsyncSession, user_id: int | None, action: str, detail: str | None, ip: str | None):
    db.add(AuditLog(user_id=user_id, action=action, detail=detail, ip=ip))


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
    if not req.username and not req.email:
        raise HTTPException(status_code=400, detail="必须提供 username 或 email")
    client_ip = get_client_ip(request)
    account_hint = (req.username or str(req.email) or "")[:64]
    user = (await db.execute(
        select(User).where(or_(User.username == req.username, User.email == req.email))
    )).scalar_one_or_none()
    now = _now()

    # 账号锁定中：不做密码校验，直接拒绝
    if user and user.locked_until and now < user.locked_until:
        _log(db, user.id, "login.locked", None, client_ip)
        await db.commit()
        minutes = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        raise HTTPException(status_code=423, detail=f"登录失败次数过多，账号已锁定，请 {minutes} 分钟后再试")

    # 软删除账号禁止登录（已送入内容回收站，30 天后物理清除）
    if user and user.is_deleted:
        _log(db, user.id, "login.deleted_account", None, client_ip)
        await db.commit()
        raise HTTPException(status_code=403, detail="账号已注销，如有疑问请联系管理员")

    if not verify_password(req.password, user.password_hash if user else None):
        if user:
            user.failed_login_count = (user.failed_login_count or 0) + 1
            if user.failed_login_count >= settings.LOGIN_MAX_FAILURES:
                user.locked_until = now + timedelta(minutes=settings.LOGIN_LOCK_MINUTES)
                user.failed_login_count = 0
                _log(db, user.id, "login.lock",
                     f"连续失败 {settings.LOGIN_MAX_FAILURES} 次，锁定 {settings.LOGIN_LOCK_MINUTES} 分钟",
                     client_ip)
        _log(db, user.id if user else None, "login.fail", f"account:{account_hint}", client_ip)
        await db.commit()
        raise HTTPException(status_code=401, detail="账号或密码错误")

    if not user.is_active:
        _log(db, user.id, "login.inactive", None, client_ip)
        await db.commit()
        raise HTTPException(status_code=403, detail="账号已停用")

    # 管理员级账号只能从内网登录
    if is_admin_tier(Role(user.role.value)) and not is_admin_network(request):
        _log(db, user.id, "login.denied_network", None, client_ip)
        await db.commit()
        raise HTTPException(status_code=403, detail="管理员账号仅允许通过内网登录")

    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now

    # 记住此设备 → 硬顶 30 天；否则沿用 JWT_EXPIRE_HOURS
    if req.remember_device:
        expires_delta = timedelta(days=REMEMBER_DEVICE_DAYS)
    else:
        expires_delta = timedelta(hours=settings.JWT_EXPIRE_HOURS)

    # 创建登录会话记录（设备 / IP / 登录地点 / UA）
    # 读取全局会话空闲超时配置（仅用于新会话的 expires_at 计算）
    from app.db.models import SystemSetting as _SS
    ss = await db.get(_SS, 1)
    global_timeout_minutes = ss.session_idle_timeout_minutes if ss else 30

    ua = request.headers.get("user-agent", "") or ""
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
    """撤销当前会话并清除 Cookie；登录态已失效时也能安全调用。"""
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        try:
            payload = decode_token(token)
        except HTTPException:
            payload = {}
        jti = payload.get("jti")
        if jti:
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
    _log(db, int(user["user_id"]), "session.revoke",
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
    _log(db, int(user["user_id"]), "session.revoke_others",
         f"count:{len(rows)}", get_client_ip(request))
    await db.commit()
    return {"ok": True, "revoked": len(rows)}


# ---------- 当前用户 ----------
@router.get("/me", response_model=UserOut)
async def me(
    user: dict = Depends(require_role(Role.MEMBER, allow_pending_password_change=True, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    u = await db.get(User, int(user["user_id"]))
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    return u


# ---------- 个人资料 ----------
AVATAR_MAX_SIZE = 5 * 1024 * 1024  # 5MB
AVATAR_DIR = Path("uploads/avatars")


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
    if req.student_id is not None:
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
    if req.default_currency is not None:
        v = req.default_currency.strip() or None
        if v is not None and v.upper() not in ("CNY", "USD", "EUR", "GBP", "JPY"):
            raise HTTPException(status_code=400, detail="无效的货币单位")
        u.default_currency = v.upper() if v else v

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
    """上传头像（jpg/png/webp，最大 5MB）；按文件内容识别类型，拒绝伪装文件；
    统一 80% 质量压缩后存储。"""
    data = await file.read(AVATAR_MAX_SIZE + 1)
    if len(data) > AVATAR_MAX_SIZE:
        raise HTTPException(status_code=400, detail="文件大小不能超过 5MB")
    ext = _sniff_image(data)
    if not ext:
        raise HTTPException(status_code=400, detail="仅支持 JPG/PNG/WEBP 格式")

    # P0：图片统一 80% 质量压缩（超 2048px 等比缩放），压缩结果更大时回退原字节
    from app.core.images import compress_image

    data, ext = compress_image(data, ext)

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


# ---------- 修改密码 ----------
@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER, allow_pending_password_change=True, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    u = await db.get(User, int(user["user_id"]))
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    if not verify_password(req.old_password, u.password_hash):
        _log(db, u.id, "password.change_fail", None, get_client_ip(request))
        await db.commit()
        raise HTTPException(status_code=400, detail="旧密码错误")
    if req.new_password == req.old_password:
        raise HTTPException(status_code=400, detail="新密码不能与旧密码相同")
    _require_strong_password(req.new_password, u.username, u.email)
    u.password_hash = hash_password(req.new_password)
    u.must_change_password = False
    u.password_changed_at = _now()
    # 改密后其他设备全部下线
    await _revoke_user_sessions(db, u.id, keep_jti=user.get("jti"))
    _log(db, u.id, "password.change", None, get_client_ip(request))
    await db.commit()
    return {"ok": True}


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
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(
        stmt.offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    return {"items": list(rows), "total": total, "page": page, "page_size": page_size}


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
    _log(db, int(user["user_id"]), "user.create", f"user:{new_user.id} role:{req.role.value}",
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
    if int(user["user_id"]) == user_id:
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
    _log(db, int(user["user_id"]), "user.delete", f"user:{user_id} soft", get_client_ip(request))


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    req: UserUpdate,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """更新账号信息：自己可改基础资料，super_admin 额外可改 role/is_active/permission_overrides。"""
    is_self = int(user["user_id"]) == user_id
    is_super = user["role"] == Role.SUPER_ADMIN.value
    if not (is_self or is_super):
        raise HTTPException(status_code=403, detail="只能修改自己的信息")
    if not is_super and (req.role is not None or req.is_active is not None
                         or req.permission_overrides is not None):
        raise HTTPException(status_code=403, detail="无权修改角色、账号状态或权限")

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
            _log(db, int(user["user_id"]), "user.role_change",
                 f"user:{user_id} {u.role.value}->{req.role.value}", get_client_ip(request))
            u.role = UserRole(req.role.value)
            await _revoke_user_sessions(db, user_id)
        if req.is_active is not None and req.is_active != u.is_active:
            u.is_active = req.is_active
            if not req.is_active:
                await _revoke_user_sessions(db, user_id)

    _log(db, int(user["user_id"]), "user.update", f"user:{user_id}", get_client_ip(request))
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
    me = int(user["user_id"])
    if me in body.ids:
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
    _log(db, me, "user.batch_update",
         f"is_active={body.is_active} updated={updated} not_found={not_found}",
         get_client_ip(request))
    await db.commit()
    return {"updated": len(updated), "not_found": not_found}


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
    u.failed_login_count = 0
    u.locked_until = None
    # 重置后全部会话下线，须用临时密码重新登录
    await _revoke_user_sessions(db, user_id)
    _log(db, int(user["user_id"]), "user.reset_password", f"user:{user_id}",
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
    reset_req.handled_by = int(user["user_id"])
    reset_req.handled_at = _now()
    _log(db, int(user["user_id"]), f"password_reset.{req.status}", f"reset:{reset_id}",
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
        row.handled_by = int(user["user_id"])
        row.handled_at = _now()
    _log(db, int(user["user_id"]), f"password_reset.batch_{req.status.value}",
         ",".join(str(i) for i in req.ids), get_client_ip(request))
    await db.commit()
    return {"updated": len(rows)}


# ---------- 安全问题（紧急恢复，仅内网可用） ----------
def security_answer_digest(answer: str) -> str:
    """答案规范化（去首尾空格 + 小写）后取 SHA-256，再交给 bcrypt（规避 72 字节上限）。"""
    return hashlib.sha256(answer.strip().lower().encode("utf-8")).hexdigest()


def _require_intranet(request: Request) -> None:
    if not is_admin_network(request):
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
    super_admin.failed_login_count = 0
    super_admin.locked_until = None
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
    _log(db, int(user["user_id"]), "security_question.update", None, get_client_ip(request))
    await db.commit()
    return SecurityQuestionOut(question=q.question)
