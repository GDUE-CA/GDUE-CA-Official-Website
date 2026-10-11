"""审计日志筛选 + 导出回归测试。

注：文件名以 z 开头，使本文件在 test_security / test_trace 之后执行——
全文件共享 session 级测试库，超管首次改密会改变初始态（同 test_zmembers_import 约定）。
"""
from tests.conftest import make_client
from tests.test_security import _admin_client


def test_audit_filter_params_accepted(app):
    client, headers = _admin_client(app)
    r = client.get(
        "/api/admin/audit-logs?date_from=2026-01-01&date_to=2026-12-31&target=login",
        headers=headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body and "total" in body


def test_audit_filter_user_id(app):
    client, headers = _admin_client(app)
    me = client.get("/api/auth/me", headers=headers).json()
    r = client.get(f"/api/admin/audit-logs?user_id={me['id']}", headers=headers)
    assert r.status_code == 200, r.text
    assert "items" in r.json()


def test_audit_export_unauthenticated_is_401(app):
    client = make_client(app)
    with client:
        pass
    r = client.get("/api/admin/audit-logs/export")
    assert r.status_code == 401


def test_audit_export_csv(app):
    client, headers = _admin_client(app)
    r = client.get("/api/admin/audit-logs/export?action=login", headers=headers)
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers["content-type"]
    assert "audit_logs" in r.headers["content-disposition"]
