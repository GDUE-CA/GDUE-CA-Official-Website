"""访问统计 GeoIP 回归测试：top_ips 携带可读属地，缺库时降级不 500。

注：文件名以 z 开头，使本文件在 test_security / test_trace 之后执行——
全文件共享 session 级测试库，超管首次改密会改变初始态（同 test_zmembers_import 约定）。
"""
from tests.test_security import _admin_client


def test_access_top_ips_have_location(app):
    client, headers = _admin_client(app)
    r = client.get("/api/admin-stats/access", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "top_ips" in body
    for entry in body["top_ips"]:
        assert "location_zh" in entry and "location_en" in entry
        assert "region" in entry


def test_access_loopback_resolves_local(app):
    """本机登录必然产生 127.0.0.1 审计行：属地应为 local，绝不 unknown 崩溃。"""
    client, headers = _admin_client(app)
    r = client.get("/api/admin-stats/access", headers=headers)
    assert r.status_code == 200, r.text
    loop = [e for e in r.json()["top_ips"] if e["ip"] == "127.0.0.1"]
    assert loop, "expected loopback audit rows from test logins"
    assert loop[0]["region"] == "loopback"
    assert loop[0]["location_zh"] == "local"
