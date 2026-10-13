"""IP 归属地解析（双语）。

数据源（登录记录的物理地点，login_sessions.location_zh / location_en）：
- 中文（zh-cn / zh-hk 界面）：ip2region 离线 xdb 库（app/data/ip2region.xdb）
  国内 → 「广东广州」（省 + 市，去后缀）；国际 → 「国家 一级行政区」
- 英文（en / ja 界面）：GeoLite2（maxminddb-geolite2 内置数据）
  → "United States California" / "United Kingdom London"（Country + Subdivision，
  无 Subdivision 时回退 City）

特殊结果统一存枚举 code，由前端按语言渲染：
- local    本机回环
- intranet 校园内网（私有地址段）

任一数据源缺失或查询失败均优雅降级（返回 None，前端显示「地区未知」）。
"""
import logging
from functools import lru_cache
from ipaddress import IPv4Address, ip_address
from pathlib import Path

# ---------- ip2region 离线 xdb（中文） ----------

_XDB_PATH = Path(__file__).resolve().parent.parent / "data" / "ip2region.xdb"
_xdb_buf: bytes | None = None


def _search_ip2region(ip_str: str) -> str | None:
    """xdb v2.0 二分查询，返回原始「国家|区域|省份|城市|ISP」字符串。"""
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

    lo, hi = 0, (e_ptr - s_ptr) // 14  # 每条索引 14 字节
    while lo <= hi:
        mid = (lo + hi) // 2
        p = s_ptr + mid * 14
        if ip_int < int.from_bytes(buf[p:p + 4], "little"):
            hi = mid - 1
        elif ip_int > int.from_bytes(buf[p + 4:p + 8], "little"):
            lo = mid + 1
        else:
            data_len = int.from_bytes(buf[p + 8:p + 10], "little")
            data_ptr = int.from_bytes(buf[p + 10:p + 12], "little")
            return buf[data_ptr:data_ptr + data_len].decode("utf-8", errors="replace")
    return None


def _format_zh(raw: str | None) -> str | None:
    """ip2region 原始结果 → 展示文本。

    国内（country=中国）：省 + 市，去「省」「市」后缀 →「广东广州」；
      直辖市/省市同名只显示一级 →「北京」。
    国际：国家 + 一级行政区，空格分隔 →「美国 加利福尼亚」。
    """
    if not raw:
        return None
    parts = raw.split("|")
    if len(parts) < 5:
        return None
    country, _region, province, city, _isp = (
        parts[0].strip(), parts[1].strip(), parts[2].strip(), parts[3].strip(), parts[4].strip()
    )
    if not country or country == "0":
        return None

    if country == "中国":
        p = province.replace("省", "").replace("特别行政区", "")
        c = city.replace("市", "")
        if not p or p == "0":
            return country
        if not c or c == "0" or c == p:
            return p
        return f"{p}{c}"

    # 国际：国家 + 一级行政区
    if province and province != "0":
        return f"{country} {province}"
    return country


# ---------- GeoLite2（英文） ----------

_geo_reader = None
_geo_loaded = False


def _geolite2_reader():
    """惰性加载 GeoLite2 reader（包未安装则返回 None）。"""
    global _geo_reader, _geo_loaded
    if not _geo_loaded:
        _geo_loaded = True
        try:
            from geolite2 import geolite2
            _geo_reader = geolite2.reader()
        except Exception:
            logging.getLogger("gdueca.ip_location").info("GeoLite2 不可用，英文登录地点将不显示")
            _geo_reader = None
    return _geo_reader


def _format_en(ip_str: str) -> str | None:
    """GeoLite2 → "Country Subdivision"（无 Subdivision 回退 City）。"""
    reader = _geolite2_reader()
    if reader is None:
        return None
    try:
        rec = reader.get(ip_str)
    except Exception:
        return None
    if not rec:
        return None

    names = lambda d: (d or {}).get("names", {}).get("en")  # noqa: E731
    country = names(rec.get("country")) or names(rec.get("registered_country"))
    if not country:
        return None
    subs = rec.get("subdivisions") or []
    level1 = names(subs[0]) if subs else None
    if not level1:
        level1 = names(rec.get("city"))
    return f"{country} {level1}" if level1 else country


# ---------- 对外入口 ----------

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

    # 公网：中文用 ip2region（仅 IPv4），英文用 GeoLite2（v4/v6）
    zh = _format_zh(_search_ip2region(ip)) if addr.version == 4 else None
    en = _format_en(ip)
    return (zh, en)


def resolve_location(ip: str | None) -> tuple[str | None, str | None]:
    """解析 IP → (location_zh, location_en)。

    返回值三种形态：
    - ("local"/"intranet", 同) 特殊枚举，前端 i18n 渲染
    - (地名, 地名) 公网解析结果，原文展示
    - (None, None) 无法解析
    """
    if not ip:
        return (None, None)
    ip = ip.strip()
    # 代理链 "client, proxy1, ..." 只取第一个
    if "," in ip:
        ip = ip.split(",")[0].strip()
    if not ip:
        return (None, None)
    return _resolve_cached(ip)


@lru_cache(maxsize=2048)
def _resolve_country_cached(ip: str) -> str | None:
    """GeoLite2 → ISO-3166-1 alpha-2 国家代码（大写）；回环/私有/失败返回 None。"""
    try:
        addr = ip_address(ip)
    except ValueError:
        return None
    if addr.is_loopback or addr.is_private:
        return None
    reader = _geolite2_reader()
    if reader is None:
        return None
    try:
        rec = reader.get(ip)
    except Exception:
        return None
    if not rec:
        return None
    iso = (rec.get("country") or {}).get("iso_code")
    if not iso:
        iso = (rec.get("registered_country") or {}).get("iso_code")
    return iso.upper() if iso else None


def resolve_country_code(ip: str | None) -> str | None:
    """解析 IP → ISO-3166-1 alpha-2 国家代码（大写）；无法解析返回 None。"""
    if not ip:
        return None
    ip = ip.strip()
    if "," in ip:
        ip = ip.split(",")[0].strip()
    if not ip:
        return None
    return _resolve_country_cached(ip)
