"""IP 归属地解析（双语，本地离线库）。

数据源（登录记录 / 评论的 IP 属地，location_zh / location_en）：
- ip2region 离线 xdb（app/data/ip2region.xdb，v3 格式，仅 IPv4）：
  记录为「国家|省份|城市|ISP|ISO」；国内为中文，国外为英文原文
  - 中文：国内 → 「广东广州」（省 + 市，去后缀）；国外 → 按 ISO 查中文国名「英国」
  - 英文：仅国外记录可用 → "United Kingdom England"
- GeoLite2（app/data/GeoLite2-City.mmdb，经 maxminddb 读取，v4/v6）：
  - 英文 "United States California"（Country + Subdivision，无 Subdivision 时回退 City）
  - 中文取 names.zh-CN（同样的拼接规则）
  中文优先 ip2region（国内到市级），英文优先 GeoLite2。

本地库查不到（IPv6 / 库缺失 / 损坏）时，由 app.core.ip_intel.resolve_location_full
回退远程风控接口补全；本模块只做本地解析，不发网络请求。

特殊结果统一存枚举 code，由前端按语言渲染：
- local    本机回环
- intranet 校园内网（私有地址段）

任一数据源缺失或查询失败均优雅降级（返回 None，前端显示「地区未知」）。
"""
import logging
from functools import lru_cache
from ipaddress import IPv4Address, ip_address
from pathlib import Path

from app.data.geo_data import get_country

logger = logging.getLogger("gdueca.ip_location")

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# ---------- ip2region 离线 xdb ----------

_XDB_PATH = _DATA_DIR / "ip2region.xdb"
_xdb_buf: bytes | None = None


def _search_ip2region(ip_str: str) -> str | None:
    """xdb 二分查询，返回原始记录字符串（v3：「国家|省份|城市|ISP|ISO」）。"""
    global _xdb_buf
    try:
        ip_int = int(IPv4Address(ip_str))
    except ValueError:
        return None
    if _xdb_buf is None:
        try:
            _xdb_buf = _XDB_PATH.read_bytes()
        except OSError:
            _xdb_buf = b""  # 标记加载失败，避免每次请求重复读盘
    buf = _xdb_buf
    if not buf:
        return None

    # 向量索引：定位 (il0, il1) 桶的起止指针
    il0 = (ip_int >> 24) & 0xFF
    il1 = (ip_int >> 16) & 0xFF
    idx = 256 + (il0 * 256 + il1) * 8
    s_ptr = int.from_bytes(buf[idx:idx + 4], "little")
    e_ptr = int.from_bytes(buf[idx + 4:idx + 8], "little")
    if e_ptr < s_ptr:
        return None

    # 每条索引 14 字节：起始 IP(4) + 结束 IP(4) + 数据长度(2) + 数据指针(4)
    lo, hi = 0, (e_ptr - s_ptr) // 14
    while lo <= hi:
        mid = (lo + hi) // 2
        p = s_ptr + mid * 14
        if ip_int < int.from_bytes(buf[p:p + 4], "little"):
            hi = mid - 1
        elif ip_int > int.from_bytes(buf[p + 4:p + 8], "little"):
            lo = mid + 1
        else:
            data_len = int.from_bytes(buf[p + 8:p + 10], "little")
            data_ptr = int.from_bytes(buf[p + 10:p + 14], "little")
            return buf[data_ptr:data_ptr + data_len].decode("utf-8", errors="replace")
    return None


def _clean(v: str | None) -> str:
    """ip2region / 纯真库的空值是 "0" 或空串，统一为空串。"""
    v = (v or "").strip()
    return "" if v == "0" else v


_PROVINCE_SUFFIXES = ("特别行政区", "壮族自治区", "回族自治区", "维吾尔自治区", "自治区", "省", "市")


def _strip_suffix(name: str, suffixes: tuple[str, ...]) -> str:
    for s in suffixes:
        if name.endswith(s) and len(name) > len(s):
            return name[: -len(s)]
    return name


def join_zh(country: str | None, province: str | None, city: str | None) -> str | None:
    """中文地名拼接（ip2region / 纯真库 / GeoLite2 共用）。

    国内（country=中国）：省 + 市，去「省」「市」后缀 →「广东广州」；
      直辖市/省市同名只显示一级 →「北京」。
    国外：国家 + 一级行政区，空格分隔 →「美国 加利福尼亚」。
    """
    country, province, city = _clean(country), _clean(province), _clean(city)
    if not country:
        return None
    if country == "中国":
        p, c = _strip_suffix(province, _PROVINCE_SUFFIXES), _strip_suffix(city, ("市",))
        if not p:
            return country
        if not c or c == p:
            return p
        return f"{p}{c}"
    return f"{country} {province}" if province else country


def join_en(country: str | None, level1: str | None) -> str | None:
    """英文地名拼接："Country Subdivision"。"""
    country, level1 = _clean(country), _clean(level1)
    if not country:
        return None
    return f"{country} {level1}" if level1 else country


def _format_ip2region(raw: str | None) -> tuple[str | None, str | None]:
    """ip2region v3 记录 → (中文, 英文)。

    国内记录本身是中文，英文留空交给 GeoLite2 / 远程补全；
    国外记录是英文原文，中文按 ISO 代码查国名（行政区无中文数据，只显示国家）。
    """
    if not raw:
        return (None, None)
    parts = raw.split("|")
    if len(parts) < 5:
        return (None, None)
    country, province, city, iso = parts[0], parts[1], parts[2], _clean(parts[4]).upper()
    if _clean(country) == "中国":
        return (join_zh(country, province, city), None)
    known = get_country(iso) if iso else None
    return (known.name_zh if known else None, join_en(country, province))


# ---------- GeoLite2（maxminddb） ----------

_GEOIP_PATH = _DATA_DIR / "GeoLite2-City.mmdb"
_geo_reader = None
_geo_loaded = False


def _geolite2_reader():
    """惰性加载 GeoLite2 reader（maxminddb 未安装或库文件缺失/损坏则返回 None）。"""
    global _geo_reader, _geo_loaded
    if not _geo_loaded:
        _geo_loaded = True
        try:
            import maxminddb
            _geo_reader = maxminddb.open_database(str(_GEOIP_PATH))
        except Exception as e:
            logger.warning("GeoLite2 不可用（%s），本地英文属地将不显示", e.__class__.__name__)
            _geo_reader = None
    return _geo_reader


def _geolite2_record(ip_str: str) -> dict | None:
    reader = _geolite2_reader()
    if reader is None:
        return None
    try:
        rec = reader.get(ip_str)
    except Exception:
        return None
    return rec if isinstance(rec, dict) else None


def _mm_name(node: object, lang: str) -> str | None:
    if not isinstance(node, dict):
        return None
    name = (node.get("names") or {}).get(lang)
    return name if isinstance(name, str) else None


def format_maxmind(rec: dict | None) -> tuple[str | None, str | None]:
    """MaxMind 记录 → (中文, 英文)。本地 GeoLite2 与远程 maxmind 结果结构相同，共用。"""
    if not rec:
        return (None, None)
    subs = rec.get("subdivisions") or []
    sub = subs[0] if subs else None

    def pick(lang: str) -> tuple[str | None, str | None]:
        country = _mm_name(rec.get("country"), lang) or _mm_name(rec.get("registered_country"), lang)
        level1 = _mm_name(sub, lang) or _mm_name(rec.get("city"), lang)
        return country, level1

    zh_country, zh_level1 = pick("zh-CN")
    en_country, en_level1 = pick("en")
    return (join_zh(zh_country, zh_level1, None), join_en(en_country, en_level1))


# ---------- 对外入口 ----------

def _first_hop(ip: str | None) -> str | None:
    """代理链 "client, proxy1, ..." 只取第一个。"""
    if not ip:
        return None
    ip = ip.split(",")[0].strip()
    return ip or None


@lru_cache(maxsize=2048)
def _resolve_cached(ip: str) -> tuple[str | None, str | None]:
    try:
        addr = ip_address(ip)
    except ValueError:
        return (None, None)
    if addr.is_loopback:
        return ("local", "local")
    if addr.is_private:
        return ("intranet", "intranet")

    # 公网：中文 ip2region 优先（国内到市级），英文 GeoLite2 优先
    x_zh, x_en = _format_ip2region(_search_ip2region(ip)) if addr.version == 4 else (None, None)
    g_zh, g_en = format_maxmind(_geolite2_record(ip))
    return (x_zh or g_zh, g_en or x_en)


def resolve_location(ip: str | None) -> tuple[str | None, str | None]:
    """本地解析 IP → (location_zh, location_en)。

    返回值三种形态：
    - ("local"/"intranet", 同) 特殊枚举，前端 i18n 渲染
    - (地名, 地名) 公网解析结果，原文展示（任一侧可能为 None）
    - (None, None) 无法解析
    """
    ip = _first_hop(ip)
    return _resolve_cached(ip) if ip else (None, None)


@lru_cache(maxsize=2048)
def _resolve_country_cached(ip: str) -> str | None:
    """GeoLite2 → ISO-3166-1 alpha-2 国家代码（大写），失败回退 ip2region；回环/私有返回 None。"""
    try:
        addr = ip_address(ip)
    except ValueError:
        return None
    if addr.is_loopback or addr.is_private:
        return None
    rec = _geolite2_record(ip)
    if rec:
        iso = (rec.get("country") or {}).get("iso_code") or (rec.get("registered_country") or {}).get("iso_code")
        if iso:
            return iso.upper()
    if addr.version == 4:
        raw = _search_ip2region(ip)
        parts = raw.split("|") if raw else []
        if len(parts) >= 5 and len(_clean(parts[4])) == 2:
            return _clean(parts[4]).upper()
    return None


def resolve_country_code(ip: str | None) -> str | None:
    """解析 IP → ISO-3166-1 alpha-2 国家代码（大写）；无法解析返回 None。"""
    ip = _first_hop(ip)
    return _resolve_country_cached(ip) if ip else None
