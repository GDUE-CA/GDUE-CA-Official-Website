"""IP 情报：国家代码 + ASN / 运营商（后台访问统计用）。

数据源：风控服务 GET {IP_INFO_API_URL}/{ip}（ipinfo / iplocate / maxmind 多源），
国家代码取值优先级 ipinfo.country → maxmind.country.iso_code → iplocate.country_code。

限流约束：风控源站按 IP 限速（limit_req burst=10 nodelay），超限后 CDN WAF 还会临时封禁本机出口，
因此：
- 结果写入 KV 缓存（成功 7 天，失败 10 分钟），同一 IP 不重复请求；
- 单次批量最多新查 _MAX_FETCH_PER_BATCH 个 IP，且串行请求；未查到的本次先用本地 GeoLite2，
  后续刷新再逐步补齐；
- 收到 429 / 403 立即熔断 10 分钟，期间只用本地库。

任何失败都降级为本地 GeoLite2 国家代码，绝不向调用方抛异常。
"""
import json
import logging
from dataclasses import asdict, dataclass
from ipaddress import ip_address

import httpx

from app.core.config import get_settings
from app.core.ip_location import resolve_country_code
from app.core.kv import get_kv

logger = logging.getLogger("gdueca.ip_intel")

_CACHE_PREFIX = "ipintel:"
_BREAKER_KEY = "ipintel:breaker"
_CACHE_TTL_OK = 7 * 86400
_CACHE_TTL_FAIL = 600
_BREAKER_TTL = 600
_MAX_FETCH_PER_BATCH = 8  # 低于源站 burst=10，留余量
_TIMEOUT_SECONDS = 4


@dataclass
class IpIntel:
    """单个 IP 的情报；字段均可能为 None。source = remote（风控接口）/ local（GeoLite2）"""

    country_code: str | None = None
    asn: str | None = None
    org: str | None = None
    source: str = "local"


def _is_public(ip: str) -> bool:
    try:
        addr = ip_address(ip)
    except ValueError:
        return False
    return addr.is_global


def _local(ip: str) -> IpIntel:
    return IpIntel(country_code=resolve_country_code(ip), source="local")


def _parse(body: dict) -> IpIntel | None:
    """风控接口响应 → IpIntel；没有任何国家代码时返回 None。"""
    results = body.get("results") or {}
    ipinfo = results.get("ipinfo") or {}
    iplocate = results.get("iplocate") or {}
    maxmind = results.get("maxmind") or {}

    country = (
        ipinfo.get("country")
        or (maxmind.get("country") or {}).get("iso_code")
        or iplocate.get("country_code")
    )
    if not isinstance(country, str) or len(country) != 2 or not country.isalpha():
        return None

    asn = ipinfo.get("asn") or iplocate.get("asn") or maxmind.get("autonomous_system_number")
    if asn is not None:
        asn = str(asn)
        if not asn.upper().startswith("AS"):
            asn = f"AS{asn}"
    org = (
        ipinfo.get("name")
        or iplocate.get("org")
        or maxmind.get("autonomous_system_organization")
    )
    return IpIntel(
        country_code=country.upper(),
        asn=asn,
        org=org if isinstance(org, str) else None,
        source="remote",
    )


class _RateLimited(Exception):
    pass


async def _fetch(client: httpx.AsyncClient, base: str, ip: str) -> IpIntel | None:
    """请求风控接口；被限流时打开熔断并抛出 _RateLimited。"""
    resp = await client.get(f"{base.rstrip('/')}/{ip}")
    if resp.status_code in (403, 429):
        raise _RateLimited(resp.status_code)
    if resp.status_code != 200:
        return None
    body = resp.json()
    if not isinstance(body, dict) or body.get("status") != "ok":
        return None
    return _parse(body)


async def lookup_many(ips: list[str]) -> dict[str, IpIntel]:
    """批量查询 IP 情报：缓存命中直接用，未命中按配额串行请求，其余降级本地库。"""
    out: dict[str, IpIntel] = {}
    kv = get_kv()
    pending: list[str] = []

    for ip in dict.fromkeys(ips):
        if not _is_public(ip):
            out[ip] = IpIntel()
            continue
        try:
            cached = await kv.get(_CACHE_PREFIX + ip)
        except Exception:
            cached = None
        if cached is not None:
            data = json.loads(cached)
            # 失败占位（空对象）只记录「近期查过」，展示仍用本地库
            out[ip] = IpIntel(**data) if data else _local(ip)
        else:
            pending.append(ip)

    base = get_settings().IP_INFO_API_URL.strip()
    budget = _MAX_FETCH_PER_BATCH if base else 0
    try:
        if budget and await kv.exists(_BREAKER_KEY):
            budget = 0
    except Exception:
        pass

    if budget and pending:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            for ip in pending[:budget]:
                try:
                    intel = await _fetch(client, base, ip)
                except _RateLimited as e:
                    logger.warning("ip_intel | 风控接口限流（HTTP %s），熔断 %ss", e.args[0], _BREAKER_TTL)
                    await _safe_set(kv, _BREAKER_KEY, "1", _BREAKER_TTL)
                    break
                except Exception as e:
                    logger.info("ip_intel | 查询失败 ip=%s err=%s", ip, e.__class__.__name__)
                    intel = None
                if intel:
                    out[ip] = intel
                    await _safe_set(kv, _CACHE_PREFIX + ip, json.dumps(asdict(intel)), _CACHE_TTL_OK)
                else:
                    await _safe_set(kv, _CACHE_PREFIX + ip, "{}", _CACHE_TTL_FAIL)

    for ip in pending:
        out.setdefault(ip, _local(ip))
    return out


async def _safe_set(kv, key: str, value: str, ttl: int) -> None:
    try:
        await kv.setex(key, ttl, value)
    except Exception:
        pass
