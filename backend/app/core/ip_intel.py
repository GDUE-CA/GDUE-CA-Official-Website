"""IP 情报：国家代码 + ASN / 运营商（后台访问统计用）。

数据源：风控服务 GET {IP_INFO_API_URL}/{ip}（ipinfo / iplocate / maxmind / qqwry 多源），
国家代码取值优先级 ipinfo.country → maxmind.country.iso_code → iplocate.country_code；
纯真库（qqwry）的中文国家 / 省 / 市 / area 原样透出，前端优先展示（只有 qqwry 时「中国」→ CN）。
同时解析双语属地 location_zh / location_en，供 resolve_location_full 在本地库查不到时补全
（评论 / 登录会话的 IP 属地；本地 ip2region 只支持 IPv4）：
- 中文：qqwry（国内到市级）→ maxmind names.zh-CN → 按国家代码查中文国名
- 英文：ipsb country + region → maxmind names.en

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
from app.core.ip_location import format_maxmind, join_en, join_zh, resolve_country_code, resolve_location
from app.core.kv import get_kv
from app.data.geo_data import get_country

logger = logging.getLogger("gdueca.ip_intel")

# 结构变化时递增版本号，使旧缓存失效
_CACHE_PREFIX = "ipintel:v3:"
_BREAKER_KEY = "ipintel:breaker"
_CACHE_TTL_OK = 7 * 86400
_CACHE_TTL_FAIL = 600
_BREAKER_TTL = 600
_MAX_FETCH_PER_BATCH = 8  # 低于源站 burst=10，留余量
_TIMEOUT_SECONDS = 4
# 请求链路内（发表评论 / 登录）同步补全属地时的超时：宁可留空也不拖慢请求
_INLINE_TIMEOUT_SECONDS = 1.5


@dataclass
class IpIntel:
    """单个 IP 的情报；字段均可能为 None。source = remote（风控接口）/ local（GeoLite2）"""

    country_code: str | None = None
    asn: str | None = None
    org: str | None = None
    # 纯真库：{"country", "province", "city", "area"}，均为中文原文，可能为空串
    qqwry: dict[str, str] | None = None
    location_zh: str | None = None
    location_en: str | None = None
    source: str = "local"


def _is_public(ip: str) -> bool:
    try:
        addr = ip_address(ip)
    except ValueError:
        return False
    return addr.is_global


def _local(ip: str) -> IpIntel:
    zh, en = resolve_location(ip)
    return IpIntel(country_code=resolve_country_code(ip), location_zh=zh, location_en=en, source="local")


def _parse_qqwry(raw: object) -> dict[str, str] | None:
    """纯真库结果 → {country, province, city, area}；全空时返回 None。"""
    if not isinstance(raw, dict):
        return None
    data = raw.get("data") if isinstance(raw.get("data"), dict) else {}

    def text(v: object) -> str:
        return v.strip() if isinstance(v, str) else ""

    out = {
        "country": text(data.get("country")),
        "province": text(data.get("province")),
        "city": text(data.get("city")),
        "area": text(raw.get("area")),
    }
    return out if any(out.values()) else None


def _parse_location(
    results: dict, qqwry: dict[str, str] | None, country: str | None,
) -> tuple[str | None, str | None]:
    """多源结果 → (中文属地, 英文属地)，规则见模块文档。"""
    mm_zh, mm_en = format_maxmind(results.get("maxmind") if isinstance(results.get("maxmind"), dict) else None)
    known = get_country(country) if country else None

    zh = (join_zh(qqwry["country"], qqwry["province"], qqwry["city"]) if qqwry else None) or mm_zh
    if not zh and known:
        zh = known.name_zh

    ipsb = results.get("ipsb") if isinstance(results.get("ipsb"), dict) else {}
    ipsb_country = ipsb.get("country") if isinstance(ipsb.get("country"), str) else None
    ipsb_region = ipsb.get("region") if isinstance(ipsb.get("region"), str) else None
    en = (join_en(ipsb_country, ipsb_region) if ipsb_region else None) or mm_en or join_en(ipsb_country, None)
    if not en and known:
        en = known.name_en
    return zh, en


def _parse(body: dict) -> IpIntel | None:
    """风控接口响应 → IpIntel；既无国家代码也无纯真库结果时返回 None。"""
    results = body.get("results") or {}
    ipinfo = results.get("ipinfo") or {}
    iplocate = results.get("iplocate") or {}
    maxmind = results.get("maxmind") or {}
    qqwry = _parse_qqwry(results.get("qqwry"))

    country = (
        ipinfo.get("country")
        or (maxmind.get("country") or {}).get("iso_code")
        or iplocate.get("country_code")
    )
    if not isinstance(country, str) or len(country) != 2 or not country.isalpha():
        country = "CN" if qqwry and qqwry["country"] == "中国" else None
    if not country and not qqwry:
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
    country = country.upper() if country else None
    zh, en = _parse_location(results, qqwry, country)
    return IpIntel(
        country_code=country,
        asn=asn,
        org=org if isinstance(org, str) else None,
        qqwry=qqwry,
        location_zh=zh,
        location_en=en,
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


async def lookup_many(ips: list[str], timeout: float = _TIMEOUT_SECONDS) -> dict[str, IpIntel]:
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
        async with httpx.AsyncClient(timeout=timeout) as client:
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


async def resolve_location_full(ip: str | None) -> tuple[str | None, str | None]:
    """IP → (location_zh, location_en)：先查本地库，任一侧缺失再用远程情报补全。

    远程查询受缓存 / 熔断 / 短超时约束，失败时保留本地结果，绝不抛异常。
    """
    zh, en = resolve_location(ip)
    if zh and en:
        return zh, en
    ip = (ip or "").split(",")[0].strip()
    if not _is_public(ip):
        return zh, en
    try:
        intel = (await lookup_many([ip], timeout=_INLINE_TIMEOUT_SECONDS))[ip]
    except Exception:
        return zh, en
    return zh or intel.location_zh, en or intel.location_en
