"""全局中间件：可信代理 IP 解析、IP 黑白名单拦截、Host 域名白名单、安全响应头、限流。"""
import ipaddress
import logging
import time
from collections import defaultdict
from datetime import datetime, timezone
from functools import lru_cache
from typing import Awaitable, Callable

from fastapi import Request, Response

from app.core.bizcode import BizCode
from app.core.config import get_settings
from app.core.responses import fail

logger = logging.getLogger("gdueca.middleware")

# IP 规则缓存（替代旧 SystemSetting.ip_blacklist JSON 单字段）
# 结构：{"whitelist": [(rule_str, bound_user_id|None)], "blacklist": [(rule_str, reason|None, expires_at|None)]}
_ip_rules_cache: dict[str, list[tuple]] = {"whitelist": [], "blacklist": []}
_host_whitelist_cache: set[str] = set()
_cache_ts: float = 0
_CACHE_TTL = 30  # 秒


def _ip_to_str(raw: str) -> str | None:
    """把单个地址字符串规范化；非法返回 None"""
    if not raw:
        return None
    client = raw.strip()
    # 去掉 IPv6 端口包裹 [::1]:1234
    if client.startswith("[") and "]" in client:
        client = client[1:client.index("]")]
    try:
        return _normalize_ip(str(ipaddress.ip_address(client)))
    except ValueError:
        return None


def _ip_hit_rule(ip: str, rule: str) -> bool:
    """判断 ip 是否命中黑名单/白名单的一条规则（支持 CIDR 与单 IP）"""
    try:
        if "/" in rule:
            net = ipaddress.ip_network(rule, strict=False)
            return ipaddress.ip_address(ip) in net
        return ipaddress.ip_address(ip) == ipaddress.ip_address(rule)
    except ValueError:
        return False


def _normalize_ip(ip: str) -> str:
    """规范化 IP：IPv4-mapped IPv6（::ffff:a.b.c.d）转为点分 IPv4，其余保持原样。"""
    try:
        obj = ipaddress.ip_address(ip)
        if isinstance(obj, ipaddress.IPv6Address) and obj.ipv4_mapped:
            return str(obj.ipv4_mapped)
        return str(obj)
    except ValueError:
        return ip


@lru_cache
def _networks(spec: str) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    nets = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            nets.append(ipaddress.ip_network(part, strict=False))
        except ValueError:
            continue
    return tuple(nets)


def ip_in_networks(ip: str | None, spec: str) -> bool:
    """ip 是否落在逗号分隔的 CIDR 列表内。"""
    if not ip:
        return False
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr.version == n.version and addr in n for n in _networks(spec))


def _is_trusted_proxy(ip: str | None) -> bool:
    return ip_in_networks(ip, get_settings().TRUSTED_PROXIES)


def get_client_ip(request: Request) -> str | None:
    """
    获取真实客户端 IP，用于访问控制 / 表单留痕 / 审计。

    只有直连方是可信代理时才采信 X-Forwarded-For / X-Real-IP，
    并从 XFF 右侧向左取第一个非可信代理地址，防止客户端伪造 XFF 冒充内网。
    """
    peer = _ip_to_str(request.client.host) if request.client else None
    if not _is_trusted_proxy(peer):
        return peer

    xff = request.headers.get("x-forwarded-for", "")
    hops = [ip for ip in (_ip_to_str(p) for p in xff.split(",")) if ip]
    for ip in reversed(hops):
        if not _is_trusted_proxy(ip):
            return ip
    real_ip = _ip_to_str(request.headers.get("x-real-ip", ""))
    if real_ip:
        return real_ip
    return hops[0] if hops else peer


def get_request_host(request: Request) -> str:
    """请求的原始 Host（可信代理转发时取 X-Forwarded-Host）；不含端口。"""
    peer = _ip_to_str(request.client.host) if request.client else None
    host = ""
    if _is_trusted_proxy(peer):
        host = request.headers.get("x-forwarded-host", "").split(",")[0].strip()
    host = host or request.headers.get("host", "")
    if host.startswith("["):
        return host[1:host.index("]")] if "]" in host else host
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


def is_https(request: Request) -> bool:
    """请求是否经 HTTPS 到达（可信代理转发时看 X-Forwarded-Proto）。"""
    peer = _ip_to_str(request.client.host) if request.client else None
    if _is_trusted_proxy(peer):
        proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
        if proto:
            return proto == "https"
    return request.url.scheme == "https"


async def ip_rules_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """
    IP 黑白名单拦截。

    - 黑名单命中：返回 403 JSON `{error:"banned", reason, expires_at, permanent}`，
      供前端弹窗展示违规原因 + 解封倒计时 + 联系管理员。
    - 白名单命中：设置 `request.state.trusted_ip = True`，供下游依赖豁免网络层限制。
      若白名单规则绑定了 `bound_user_id`，设置 `request.state.trusted_user_id`
      供登录中间件实现 opt-in 可信 IP 自动登录。
    - 旧 SystemSetting.ip_blacklist 已在启动时迁移为永久 ip_rules，此处不再读取。
    """
    global _ip_rules_cache, _host_whitelist_cache, _cache_ts

    # 跳过健康检查
    if request.url.path == "/health":
        return await call_next(request)

    # 刷新缓存
    now = time.time()
    if now - _cache_ts > _CACHE_TTL:
        try:
            from datetime import datetime as _dt
            from app.db.models import IpRule, IpRuleType, SystemSetting
            from app.db.session import async_session
            async with async_session() as s:
                from sqlalchemy import select
                rows = (await s.execute(
                    select(IpRule).where(IpRule.type == IpRuleType.BLACKLIST)
                )).scalars().all()
                blacklist = [
                    (r.rule, r.reason, r.expires_at.replace(tzinfo=timezone.utc) if r.expires_at else None)
                    for r in rows
                ]
                rows = (await s.execute(
                    select(IpRule).where(IpRule.type == IpRuleType.WHITELIST)
                )).scalars().all()
                whitelist = [
                    (r.rule, r.bound_user_id,
                     r.expires_at.replace(tzinfo=timezone.utc) if r.expires_at else None)
                    for r in rows
                ]
                _ip_rules_cache = {"whitelist": whitelist, "blacklist": blacklist}
                rec = await s.get(SystemSetting, 1)
                _host_whitelist_cache = set(rec.allowed_hosts or []) if rec else set()
                _cache_ts = now
        except Exception:
            # 沿用旧缓存继续服务，但要留下记录：规则可能未生效
            logger.warning("刷新 IP 规则 / 域名白名单缓存失败，沿用旧缓存", exc_info=True)

    # IP 检查
    ip = get_client_ip(request)
    if ip:
        # 白名单优先（可信 IP 豁免黑名单）
        trusted = False
        for rule, bound_uid, exp in _ip_rules_cache["whitelist"]:
            if exp and now >= exp.timestamp():
                continue
            if _ip_hit_rule(ip, rule):
                trusted = True
                if bound_uid:
                    request.state.trusted_user_id = str(bound_uid)
                break
        request.state.trusted_ip = trusted

        if not trusted:
            for rule, reason, exp in _ip_rules_cache["blacklist"]:
                if exp and now >= exp.timestamp():
                    continue
                if _ip_hit_rule(ip, rule):
                    data: dict = {"reason": reason or ""}
                    if exp:
                        data["expires_at"] = exp.isoformat(timespec="seconds").replace("+00:00", "Z")
                        data["permanent"] = False
                    else:
                        data["expires_at"] = None
                        data["permanent"] = True
                    return fail(
                        BizCode.BANNED_IP,
                        params={"reason": reason or ""},
                        data=data,
                    )

    # Host 检查
    host = get_request_host(request)
    if _host_whitelist_cache and host not in _host_whitelist_cache:
        return Response(status_code=403, content="域名不在白名单内",
                        media_type="text/plain; charset=utf-8")

    return await call_next(request)


# 向后兼容旧引用（system.py / 其他模块可能仍 import ip_blacklist_middleware）
ip_blacklist_middleware = ip_rules_middleware


# ---------- 限流（令牌桶，内存） ----------
# 默认每分钟每 IP 120 次、突发 30 次；可经 env RATE_LIMIT_PER_MIN / RATE_LIMIT_BURST 覆盖
_settings = get_settings()
_RATE_PER_MIN = max(1, _settings.RATE_LIMIT_PER_MIN)
_BURST = max(1, _settings.RATE_LIMIT_BURST)
# 限流豁免：健康检查、公开静态资源
_RATE_EXEMPT_PATHS = ("/health",)
# 令牌桶：{ip: [tokens, last_refill_ts]}
_rate_buckets: dict[str, list] = defaultdict(lambda: [_BURST, time.time()])


async def rate_limit_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """基于 IP 的令牌桶限流。超限返回 429 + Retry-After。"""
    path = request.url.path
    if path.startswith(_RATE_EXEMPT_PATHS) or path.startswith("/uploads/"):
        return await call_next(request)

    ip = get_client_ip(request) or "unknown"
    bucket = _rate_buckets[ip]
    now = time.time()
    # 按速率补充令牌
    refill = (now - bucket[1]) * (_RATE_PER_MIN / 60.0)
    bucket[0] = min(_BURST, bucket[0] + refill)
    bucket[1] = now
    if bucket[0] < 1:
        retry_after = max(1, int(60 / _RATE_PER_MIN))
        resp = fail(BizCode.RATE_LIMITED)
        resp.headers["Retry-After"] = str(retry_after)
        return resp
    bucket[0] -= 1
    return await call_next(request)


# ---------- 安全响应头 ----------
# API 只返回 JSON / 文件，不需要执行任何脚本：最严格 CSP
_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
# 头像等静态上传文件：只允许作为图片展示，禁止被当成页面执行脚本
_UPLOAD_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
# Swagger / ReDoc 页面需要从 CDN 加载脚本，仅在 ENABLE_API_DOCS 时存在
_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


async def security_headers_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    response = await call_next(request)
    path = request.url.path
    headers = response.headers
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Referrer-Policy", "no-referrer")
    headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
    headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if path.startswith("/uploads/"):
        headers.setdefault("Content-Security-Policy", _UPLOAD_CSP)
    elif not path.startswith(_DOCS_PATHS):
        headers.setdefault("Content-Security-Policy", _API_CSP)
    # 带登录态的接口响应禁止缓存（防止共享设备 / 代理缓存泄露个人信息）
    if path.startswith("/api/"):
        headers.setdefault("Cache-Control", "no-store")
    if is_https(request):
        headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response
