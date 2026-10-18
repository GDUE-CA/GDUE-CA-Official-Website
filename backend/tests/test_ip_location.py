"""本地 IP 属地（app.core.ip_location）：ip2region v3 解析、中文拼接规则、特殊地址。"""
import pytest

from app.core import ip_location
from app.core.ip_location import join_en, join_zh, resolve_country_code, resolve_location

needs_xdb = pytest.mark.skipif(
    not ip_location._XDB_PATH.exists() or ip_location._XDB_PATH.stat().st_size < 1024,
    reason="ip2region.xdb 未拉取（Git LFS）",
)


@needs_xdb
def test_ip2region_china_city_level():
    # 回归：数据指针是 4 字节，按 2 字节读会得到乱码 → (None, None)
    zh, _ = resolve_location("202.96.128.86")
    assert zh == "广东广州"
    assert resolve_location("61.135.169.121")[0] == "北京"  # 直辖市只显示一级
    assert resolve_country_code("202.96.128.86") == "CN"


@needs_xdb
def test_ip2region_foreign_uses_iso_for_chinese_name():
    zh, en = resolve_location("86.1.1.1")
    assert zh == "英国"
    assert en and en.startswith("United Kingdom")


def test_special_addresses():
    assert resolve_location("127.0.0.1") == ("local", "local")
    assert resolve_location("10.0.0.1") == ("intranet", "intranet")
    assert resolve_location("not-an-ip") == (None, None)
    assert resolve_location(None) == (None, None)


def test_join_zh_rules():
    assert join_zh("中国", "广东省", "广州市") == "广东广州"
    assert join_zh("中国", "北京市", "北京市") == "北京"
    assert join_zh("中国", "广西壮族自治区", "南宁市") == "广西南宁"
    assert join_zh("中国", "香港特别行政区", "0") == "香港"
    assert join_zh("美国", "加利福尼亚", "") == "美国 加利福尼亚"
    assert join_zh("0", "", "") is None


def test_join_en_rules():
    assert join_en("United Kingdom", "England") == "United Kingdom England"
    assert join_en("United States", "0") == "United States"
    assert join_en("", "England") is None
