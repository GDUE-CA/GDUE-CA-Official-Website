"""traceId 与统一日志：生成 / 采信可信代理传入值 / 拒绝伪造与非法值 / 审计关联 / 500 兜底。"""
import logging
import re

from fastapi.testclient import TestClient

from tests.conftest import csrf, make_client

HEX32 = re.compile(r"^[0-9a-f]{32}$")


def test_response_carries_generated_trace_id(app):
    r = make_client(app).get("/api/system/settings")
    assert HEX32.match(r.headers["x-trace-id"])


def test_trace_id_from_trusted_proxy_is_kept(app):
    client = make_client(app)  # 直连方 127.0.0.1 为可信代理
    r = client.get("/api/system/settings", headers={"X-Request-ID": "nginx-req-0001"})
    assert r.headers["x-trace-id"] == "nginx-req-0001"


def test_trace_id_from_untrusted_client_is_ignored(app):
    client = TestClient(app, client=("8.8.8.8", 40000))
    r = client.get("/api/system/settings", headers={"X-Trace-Id": "forged-trace-0001"})
    assert r.headers["x-trace-id"] != "forged-trace-0001"
    assert HEX32.match(r.headers["x-trace-id"])


def test_invalid_trace_id_rejected(app):
    client = make_client(app)
    for bad in ["short", "a" * 65, "evil\nINFO fake log line", "x y z 12345678"]:
        r = client.get("/api/system/settings", headers={"X-Trace-Id": bad})
        assert HEX32.match(r.headers["x-trace-id"]), bad


def test_access_log_line_has_trace_and_no_query(app, caplog):
    client = make_client(app)
    with caplog.at_level(logging.INFO, logger="gdueca.access"):
        r = client.get("/api/activities?category=13800000000")
    tid = r.headers["x-trace-id"]
    records = [rec for rec in caplog.records if rec.name == "gdueca.access" and rec.trace_id == tid]
    assert records, "缺少带 traceId 的访问日志"
    msg = records[-1].getMessage()
    assert "GET /api/activities 200" in msg
    assert "13800000000" not in msg  # 查询参数不落日志


def test_audit_log_records_trace_id(app):
    import asyncio
    from sqlalchemy import select
    from app.db.models import AuditLog
    from app.db.session import async_session

    client = make_client(app)
    r = client.post("/api/bugs", headers=csrf(client),
                    json={"contact_email": "t@qq.com", "description": "trace 测试"})
    assert r.status_code == 201
    tid = r.headers["x-trace-id"]

    async def fetch():
        async with async_session() as s:
            return (await s.execute(select(AuditLog).where(AuditLog.trace_id == tid))).scalars().all()
    rows = asyncio.run(fetch())
    assert [row.action for row in rows] == ["bug.submit"]


def test_unhandled_exception_returns_trace_id(app, caplog):
    @app.get("/api/__boom_for_test")
    async def boom():
        raise RuntimeError("boom")

    client = TestClient(app, client=("127.0.0.1", 50000), raise_server_exceptions=False)
    with caplog.at_level(logging.ERROR, logger="gdueca.error"):
        r = client.get("/api/__boom_for_test")
    assert r.status_code == 500
    body = r.json()
    # 新响应壳：request_id（与响应头 X-Request-Id / X-Trace-Id 同值）
    assert body["request_id"] == r.headers["x-request-id"] == r.headers["x-trace-id"]
    assert "boom" not in r.text  # 不向客户端泄露异常细节
    assert any(rec.trace_id == body["request_id"] and rec.exc_info for rec in caplog.records)


def test_formatters():
    from app.core.log import JsonFormatter, TextFormatter
    import json
    rec = logging.LogRecord("gdueca.test", logging.INFO, __file__, 1, "hello %s", ("世界",), None)
    rec.trace_id = "abc12345"
    rec.status = 200
    assert re.search(r"INFO  \[trace=abc12345\] gdueca\.test \| hello 世界$", TextFormatter().format(rec))
    data = json.loads(JsonFormatter().format(rec))
    assert data["trace_id"] == "abc12345" and data["msg"] == "hello 世界" and data["status"] == 200
