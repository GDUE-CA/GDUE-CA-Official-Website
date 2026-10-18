"""IP 情报（app.core.ip_intel）：响应解析、缓存、限流熔断与本地降级。"""
import asyncio

import pytest

from app.core import ip_intel
from app.core.kv import reset_kv

SAMPLE = {
    "status": "ok",
    "ip": "2409:8a04:8731:be60:125e:9ab1:935d:a2a",
    "results": {
        "ipinfo": {"asn": "AS24547", "country": "CN", "name": "Hebei Mobile Communication Company Limited"},
        "iplocate": {"asn": "24547", "country_code": "CN", "org": "China Mobile Communications Group Co., Ltd"},
        "maxmind": {"autonomous_system_number": 24547, "country": {"iso_code": "CN"}},
        "qqwry": {"area": "移动", "data": {"city": "石家庄", "country": "中国", "province": "河北"}},
    },
}


# 风控接口真实响应（IPv6，英国 BT；无 qqwry，maxmind 无行政区）
SAMPLE_V6_GB = {
    "status": "ok",
    "ip": "2a00:23cc:b5f6:8901:d541:97ff:39fb:c9b0",
    "results": {
        "ipinfo": {"asn": "AS2856", "country": "GB", "country_name": "United Kingdom",
                   "name": "British Telecommunications Limited"},
        "iplocate": {"asn": "2856", "country_code": "GB", "org": "British Telecommunications Limited"},
        "ipsb": {"asn": 2856, "city": "Lambeth", "country": "United Kingdom", "country_code": "GB",
                 "region": "England", "region_code": "ENG"},
        "maxmind": {
            "autonomous_system_number": 2856,
            "country": {"iso_code": "GB", "names": {"en": "United Kingdom", "zh-CN": "英国"}},
            "registered_country": {"iso_code": "GB", "names": {"en": "United Kingdom", "zh-CN": "英国"}},
        },
    },
}
V6_GB = SAMPLE_V6_GB["ip"]


@pytest.fixture(autouse=True)
def _fresh_kv():
    reset_kv()
    yield
    reset_kv()


def test_parse_prefers_ipinfo():
    intel = ip_intel._parse(SAMPLE)
    assert intel.country_code == "CN"
    assert intel.asn == "AS24547"
    assert intel.org == "Hebei Mobile Communication Company Limited"
    assert intel.source == "remote"


def test_parse_extracts_qqwry():
    intel = ip_intel._parse(SAMPLE)
    assert intel.qqwry == {"country": "中国", "province": "河北", "city": "石家庄", "area": "移动"}


def test_parse_qqwry_only_maps_china_to_cn():
    body = {"results": {"qqwry": {"area": "电信", "data": {"country": "中国", "province": "广东", "city": "广州"}}}}
    intel = ip_intel._parse(body)
    assert intel.country_code == "CN"
    assert intel.qqwry["city"] == "广州"


def test_parse_qqwry_only_foreign_keeps_detail_without_code():
    body = {"results": {"qqwry": {"area": "", "data": {"country": "美国", "province": "", "city": ""}}}}
    intel = ip_intel._parse(body)
    assert intel.country_code is None
    assert intel.qqwry["country"] == "美国"


def test_parse_ignores_empty_qqwry():
    body = {"results": {"ipinfo": {"country": "US"}, "qqwry": {"area": "", "data": {}}}}
    assert ip_intel._parse(body).qqwry is None


def test_parse_falls_back_to_maxmind_and_prefixes_asn():
    body = {"results": {"maxmind": {"autonomous_system_number": 15169, "country": {"iso_code": "us"}}}}
    intel = ip_intel._parse(body)
    assert intel.country_code == "US"
    assert intel.asn == "AS15169"


def test_parse_rejects_missing_country():
    assert ip_intel._parse({"results": {"ipinfo": {"country": ""}}}) is None


def test_non_public_skips_remote(monkeypatch):
    async def boom(*a, **k):
        raise AssertionError("should not fetch")

    monkeypatch.setattr(ip_intel, "_fetch", boom)
    out = asyncio.run(ip_intel.lookup_many(["127.0.0.1", "10.0.0.1", "not-an-ip"]))
    assert all(v.country_code is None for v in out.values())


def test_cache_hit_avoids_second_fetch(monkeypatch):
    calls = []

    async def fake(client, base, ip):
        calls.append(ip)
        return ip_intel._parse(SAMPLE)

    monkeypatch.setattr(ip_intel, "_fetch", fake)
    ip = "8.8.8.8"
    first = asyncio.run(ip_intel.lookup_many([ip]))
    second = asyncio.run(ip_intel.lookup_many([ip]))
    assert first[ip].country_code == second[ip].country_code == "CN"
    assert second[ip].qqwry == first[ip].qqwry  # 缓存往返保留纯真库字段
    assert second[ip].source == "remote"
    assert calls == [ip]


def test_batch_budget_and_local_fallback(monkeypatch):
    calls = []

    async def fake(client, base, ip):
        calls.append(ip)
        return ip_intel._parse(SAMPLE)

    monkeypatch.setattr(ip_intel, "_fetch", fake)
    ips = [f"8.8.{i}.8" for i in range(ip_intel._MAX_FETCH_PER_BATCH + 3)]
    out = asyncio.run(ip_intel.lookup_many(ips))
    assert len(calls) == ip_intel._MAX_FETCH_PER_BATCH
    assert set(out) == set(ips)
    assert sum(1 for v in out.values() if v.source == "local") == 3


def test_rate_limit_opens_breaker(monkeypatch):
    calls = []

    async def limited(client, base, ip):
        calls.append(ip)
        raise ip_intel._RateLimited(429)

    monkeypatch.setattr(ip_intel, "_fetch", limited)
    asyncio.run(ip_intel.lookup_many(["8.8.8.8", "1.1.1.1"]))
    assert calls == ["8.8.8.8"]  # 首个 429 即停
    asyncio.run(ip_intel.lookup_many(["9.9.9.9"]))
    assert calls == ["8.8.8.8"]  # 熔断期间不再请求


def test_parse_location_from_maxmind_and_ipsb():
    intel = ip_intel._parse(SAMPLE_V6_GB)
    assert intel.location_zh == "英国"
    assert intel.location_en == "United Kingdom England"


def test_parse_location_prefers_qqwry_for_chinese():
    intel = ip_intel._parse(SAMPLE)
    assert intel.location_zh == "河北石家庄"
    assert intel.location_en == "China"  # 无 ipsb / maxmind 名称 → 按国家代码


def test_resolve_location_full_fills_ipv6_from_remote(monkeypatch):
    async def fake(client, base, ip):
        return ip_intel._parse(SAMPLE_V6_GB)

    monkeypatch.setattr(ip_intel, "resolve_location", lambda ip: (None, None))
    monkeypatch.setattr(ip_intel, "_fetch", fake)
    assert asyncio.run(ip_intel.resolve_location_full(V6_GB)) == ("英国", "United Kingdom England")


def test_resolve_location_full_keeps_complete_local(monkeypatch):
    async def boom(*a, **k):
        raise AssertionError("should not fetch")

    monkeypatch.setattr(ip_intel, "resolve_location", lambda ip: ("广东广州", "China Guangdong"))
    monkeypatch.setattr(ip_intel, "_fetch", boom)
    assert asyncio.run(ip_intel.resolve_location_full("202.96.128.86")) == ("广东广州", "China Guangdong")


def test_resolve_location_full_only_fills_missing_side(monkeypatch):
    async def fake(client, base, ip):
        return ip_intel._parse(SAMPLE_V6_GB)

    monkeypatch.setattr(ip_intel, "resolve_location", lambda ip: ("本地中文", None))
    monkeypatch.setattr(ip_intel, "_fetch", fake)
    assert asyncio.run(ip_intel.resolve_location_full(V6_GB)) == ("本地中文", "United Kingdom England")


def test_resolve_location_full_degrades_on_remote_failure(monkeypatch):
    async def broken(client, base, ip):
        raise RuntimeError("network down")

    monkeypatch.setattr(ip_intel, "resolve_location", lambda ip: (None, None))
    monkeypatch.setattr(ip_intel, "_fetch", broken)
    assert asyncio.run(ip_intel.resolve_location_full(V6_GB)) == (None, None)


def test_resolve_location_full_skips_remote_for_private(monkeypatch):
    async def boom(*a, **k):
        raise AssertionError("should not fetch")

    monkeypatch.setattr(ip_intel, "_fetch", boom)
    assert asyncio.run(ip_intel.resolve_location_full("192.168.1.2")) == ("intranet", "intranet")
