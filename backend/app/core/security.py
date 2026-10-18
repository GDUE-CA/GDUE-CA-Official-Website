"""JWT 认证、密码哈希、角色权限依赖、登录会话校验、内网访问控制。"""
import ipaddress
from datetime import UTC, datetime, timedelta
from enum import Enum
from functools import lru_cache

import bcrypt
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.csrf import SESSION_COOKIE
from app.core.middleware import get_client_ip
from app.db.session import get_db

settings = get_settings()

# ---------- 登录会话超时常量 ----------
# 默认空闲超时：30 分钟无任何认证请求 → 会话失效
IDLE_TIMEOUT = timedelta(minutes=30)
# 勾选「记住此设备」：空闲超时放宽到 30 天
IDLE_TIMEOUT_REMEMBER = timedelta(days=30)
# 「记住此设备」token 硬顶：30 天
REMEMBER_DEVICE_DAYS = 30


# ---------- 角色 ----------
class Role(str, Enum):
    SUPER_ADMIN = "super_admin"  # 超级管理员：全部权限 + 可管理账号
    ADMIN = "admin"              # 管理员：活动管理、报名审核、Bug查看、导出
    EDITOR = "editor"            # 编辑（管理员级）：活动内容编辑、查看报名 / Bug
    MEMBER = "member"            # 普通成员：仅个人资料 / 登录设备，无后台权限
    # 访客 = 未登录用户，只能访问公开页面与公开表单，不对应账号


ROLE_RANK = {Role.MEMBER: 1, Role.EDITOR: 2, Role.ADMIN: 3, Role.SUPER_ADMIN: 4}
# 进入后台管理的最低角色；这些角色的账号仅允许从内网访问
ADMIN_TIER = Role.EDITOR


def role_at_least(required: Role, user_role: Role) -> bool:
    """判断 user_role 是否 >= required"""
    return ROLE_RANK.get(user_role, 0) >= ROLE_RANK[required]


def is_admin_tier(role: Role) -> bool:
    return role_at_least(ADMIN_TIER, role)


# ---------- 管理员可信 IP 白名单（IPv4 / IPv6 / 两种 CIDR 混合） ----------
@lru_cache
def _cached_networks(
    entries: tuple[str, ...],
) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    """把白名单条目解析为 Network 对象（单 IP 自动视为 /32、/128 网段）。

    运行时容错：非法条目跳过（Web 保存时已整体校验拒绝，环境变量沿用宽松解析）。
    """
    nets: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
    for entry in entries:
        try:
            nets.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            continue
    return tuple(nets)


def _ip_in_trusted_entries(ip: str | None, entries: tuple[str, ...]) -> bool:
    """运行时匹配：源 IP 与白名单条目各按自身协议构造对象，仅同协议做网段包含判断。

    - 客户端为 IPv4 → 构造 IPv4Address，只与列表内 IPv4Network 比对，跳过全部 IPv6 条目；
    - 客户端为 IPv6 → 构造 IPv6Address，只与列表内 IPv6Network 比对，跳过全部 IPv4 条目；
    - 命中任意一条网段即放行；不做 IPv4-mapped-IPv6 等隐式协议转换（禁止跨协议比对）。
    """
    if not ip:
        return False
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr.version == n.version and addr in n for n in _cached_networks(entries))


async def is_admin_network(request: Request, db: AsyncSession) -> bool:
    """管理员级账号的可信来源 IP 校验（白名单开关）。

    优先级：数据库 Web 配置（SystemSetting.admin_trusted_ips）→ 环境变量
    ADMIN_TRUSTED_IPS → 全部放行。任一来源非空即开启白名单模式：仅列表内
    IPv4 / IPv6 / CIDR 命中才放行，其余来源拒绝。
    仅作用于管理员类账号；普通用户路径不经过此校验。
    """
    from app.db.models import SystemSetting

    ss = await db.get(SystemSetting, 1)
    db_entries = tuple(ss.admin_trusted_ips or []) if ss else ()
    if db_entries:
        return _ip_in_trusted_entries(get_client_ip(request), db_entries)
    env_entries = tuple(settings.admin_trusted_ips_list)
    if env_entries:
        return _ip_in_trusted_entries(get_client_ip(request), env_entries)
    return True


# ---------- 密码：bcrypt 加盐哈希，只存哈希不存原文 ----------
BCRYPT_ROUNDS = 12
# 账号不存在时也做一次等价哈希校验，防止通过响应时间枚举用户名
_DUMMY_HASH = bcrypt.hashpw(b"gdueca-dummy-password", bcrypt.gensalt(BCRYPT_ROUNDS))


def hash_password(password: str) -> str:
    raw = password.encode("utf-8")
    if len(raw) > 72:
        raise ValueError("密码过长（最多 72 字节）")
    return bcrypt.hashpw(raw, bcrypt.gensalt(BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    try:
        if not hashed:
            bcrypt.checkpw(plain.encode("utf-8")[:72], _DUMMY_HASH)
            return False
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def is_bcrypt_hash(value: str | None) -> bool:
    return bool(value) and value.startswith(("$2a$", "$2b$", "$2y$")) and len(value) == 60


# ---------- JWT ----------
def create_access_token(
    sub: str,
    role: Role,
    session_id: str,
    expires_delta: timedelta | None = None,
    extra_claims: dict | None = None,
) -> str:
    expire = datetime.now(UTC) + (expires_delta or timedelta(hours=settings.JWT_EXPIRE_HOURS))
    payload = {"sub": sub, "role": role.value, "exp": int(expire.timestamp()), "jti": session_id}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已失效，请重新登录")


def _extract_token(request: Request) -> str | None:
    """优先读取 HttpOnly 会话 Cookie；兼容非浏览器客户端的 Authorization: Bearer。"""
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        return token
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


# ---------- Break-Glass 应急会话（KV 存储，禁止业务库） ----------
# 会话只在 KV 存布尔标记式条目（无 user_id，不建虚拟 users 行）；TTL = 登录时刻起
# 全局空闲超时分钟数，不续期 —— 与普通管理员非记住设备的硬顶语义完全等价：
# 键存在 ⇔ 登录至今 ≤ idle 分钟 ⇔ 未超硬顶且未闲置超时。禁止永久会话。
BG_SESSION_PREFIX = "bg:session:"


async def bg_session_create(jti: str, username: str, ip: str | None, ua: str, idle_minutes: int) -> None:
    from app.core.kv import kv_set_json

    await kv_set_json(
        f"{BG_SESSION_PREFIX}{jti}",
        {"username": username, "login_at": _utcnow_iso(), "ip": ip or "", "ua": (ua or "")[:256]},
        ttl_seconds=max(60, idle_minutes * 60),
    )


async def bg_session_get(jti: str) -> dict | None:
    """会话有效返回条目（含 jti）；已过期 / 不存在 / 手动登出 → None。"""
    from app.core.kv import kv_get_json

    data = await kv_get_json(f"{BG_SESSION_PREFIX}{jti}")
    if data:
        data = {**data, "jti": jti}
    return data


async def bg_session_revoke(jti: str) -> None:
    """手动登出 / 管理端强制下线。"""
    from app.core.kv import get_kv

    await get_kv().delete(f"{BG_SESSION_PREFIX}{jti}")


def _utcnow_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


# ---------- 依赖 ----------
async def _authenticate(request: Request, db: AsyncSession) -> tuple[dict, object]:
    """解析登录态并校验会话 / 账号状态，返回 (user_ctx, User)。

    - 无 token / token 无效 / 缺少 jti → 401（禁止匿名访问）
    - 会话已踢出 / 超过硬顶 / 空闲超时 → 401
    - 账号不存在或已停用 → 401
    - 角色以数据库为准（降权后立即生效，不信任 token 中的 role）
    """
    from app.db.models import LoginSession, User

    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="未登录或登录已失效")
    payload = decode_token(token)
    jti, sub = payload.get("jti"), payload.get("sub")
    if not jti or not sub:
        raise HTTPException(status_code=401, detail="登录已失效，请重新登录")

    # Break-Glass 应急会话：只认 KV 条目，永不查 users 表；豁免 RBAC，不豁免内网限制
    if payload.get("bg") is True:
        sess = await bg_session_get(jti)
        if not sess:
            raise HTTPException(status_code=401, detail="登录会话已失效，请重新登录")
        if not await is_admin_network(request, db):
            raise HTTPException(status_code=403, detail="请求来源不合法")
        return {
            "break_glass": True,
            "role": Role.SUPER_ADMIN.value,
            "jti": jti,
            "username": str(sub),
        }, None

    sess = (await db.execute(
        select(LoginSession).where(LoginSession.session_id == jti)
    )).scalar_one_or_none()
    now = datetime.now(UTC).replace(tzinfo=None)
    if not sess or sess.revoked or now > sess.expires_at or str(sess.user_id) != str(sub):
        raise HTTPException(status_code=401, detail="登录会话已失效，请重新登录")

    # 空闲超时：记住设备 → 30天硬顶；非记住设备 → 读取全局管理员配置（动态生效）
    from app.db.models import SystemSetting
    ss = await db.get(SystemSetting, 1)
    global_timeout_minutes = ss.session_idle_timeout_minutes if ss else 30
    idle_limit = IDLE_TIMEOUT_REMEMBER if sess.remember_device else timedelta(minutes=global_timeout_minutes)
    if now - sess.last_active_at > idle_limit:
        # 空闲超时：销毁会话记录（标记 revoked），用户必须重新登录
        sess.revoked = True
        sess.revoked_at = now
        raise HTTPException(status_code=401, detail="登录已超时，请重新登录")

    user = await db.get(User, sess.user_id)
    # 软删除账号（内容回收站中）与停用账号一律拒绝认证
    if not user or not user.is_active or user.is_deleted:
        raise HTTPException(status_code=401, detail="账号不存在或已停用")

    role = Role(user.role.value)
    # 管理员级账号来源 IP 白名单校验（默认空 = 不限制；即使 token 被盗，名单外来源也无法使用）
    if is_admin_tier(role) and not await is_admin_network(request, db):
        raise HTTPException(status_code=403, detail="请求来源不合法")

    # 滑动续期：活跃请求自动延长会话有效期
    sess.last_active_at = now
    ctx = {"user_id": str(user.id), "role": role.value, "jti": jti}
    return ctx, user


def require_role(
    required: Role,
    allow_pending_password_change: bool = False,
    allow_unverified_realname: bool = False,
):
    """角色权限依赖：确保已登录、会话有效、角色 >= required。

    首次登录 / 被重置密码的账号（must_change_password）在改密前只能访问
    显式放行的接口（查看自身信息、修改密码、退出登录）。
    实名验证（Phase 6）：未实名的管理员级账号（editor+/admin，super_admin 豁免）
    禁止访问后台业务接口，仅可浏览前台与提交实名材料（realname 接口显式放行）。
    """
    async def _dep(request: Request, db: AsyncSession = Depends(get_db, scope="function")) -> dict:
        ctx, user = await _authenticate(request, db)
        # Break-Glass：跳过角色 / 改密 / 实名全部校验，直接放行全部后台能力
        if ctx.get("break_glass"):
            return ctx
        role = Role(ctx["role"])
        if not role_at_least(required, role):
            raise HTTPException(status_code=403, detail="权限不足")
        if user.must_change_password and not allow_pending_password_change:
            raise HTTPException(status_code=403, detail="请先修改初始密码",
                                headers={"X-Password-Change-Required": "1"})
        if (
            is_admin_tier(role)
            and role != Role.SUPER_ADMIN
            and not user.realname_verified
            and not allow_unverified_realname
        ):
            raise HTTPException(status_code=403, detail="请先完成实名验证",
                                headers={"X-Realname-Required": "1"})
        return ctx
    return _dep


async def get_optional_user(request: Request, db: AsyncSession = Depends(get_db, scope="function")) -> dict | None:
    """可选登录态：未登录 / 登录失效时返回 None（用于公开接口的差异化输出）。"""
    if not _extract_token(request):
        return None
    try:
        ctx, user = await _authenticate(request, db)
    except HTTPException:
        return None
    if ctx.get("break_glass"):
        return ctx
    if user.must_change_password:
        return None
    return ctx
