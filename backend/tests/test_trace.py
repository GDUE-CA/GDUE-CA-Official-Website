"""request id 与统一日志：生成 / 采信可信代理传入值 / 拒绝伪造与非法值 / 审计关联 / 500 兜底。

写操作 trace id 的行为见 test_db_trace.py。
"""
import logging
import re

from fastapi.testclient import TestClient

from tests.conftest import csrf, make_client

HEX32 = re.compile(r"^[0-9a-f]{32}$")


def test_response_carries_generated_request_id(app):
    r = make_client(app).get("/api/system/settings")
    assert HEX32.match(r.headers["x-request-id"])


def test_read_only_request_has_no_trace_id(app):
    r = make_client(app).get("/api/system/settings")
    assert "x-trace-id" not in r.headers


def test_request_id_from_trusted_proxy_is_kept(app):
    client = make_client(app)  # 直连方 127.0.0.1 为可信代理
    r = client.get("/api/system/settings", headers={"X-Request-ID": "nginx-req-0001"})
    assert r.headers["x-request-id"] == "nginx-req-0001"


def test_request_id_from_untrusted_client_is_ignored(app):
    client = TestClient(app, client=("8.8.8.8", 40000))
    r = client.get("/api/system/settings", headers={"X-Request-Id": "forged-reqid-0001"})
    assert r.headers["x-request-id"] != "forged-reqid-0001"
    assert HEX32.match(r.headers["x-request-id"])


def test_incoming_trace_header_is_never_trusted(app):
    # trace id 只由服务端在写操作时生成，可信代理传入的 X-Trace-Id 也不采信
    r = make_client(app).get("/api/system/settings", headers={"X-Trace-Id": "proxy-trace-0001"})
    assert "x-trace-id" not in r.headers
    assert r.headers["x-request-id"] != "proxy-trace-0001"


def test_invalid_request_id_rejected(app):
    client = make_client(app)
    for bad in ["short", "a" * 65, "evil\nINFO fake log line", "x y z 12345678"]:
        r = client.get("/api/system/settings", headers={"X-Request-Id": bad})
        assert HEX32.match(r.headers["x-request-id"]), bad


def test_access_log_line_has_request_id_and_no_query(app, caplog):
    client = make_client(app)
    with caplog.at_level(logging.INFO, logger="gdueca.access"):
        r = client.get("/api/activities?category=13800000000")
    rid = r.headers["x-request-id"]
    records = [rec for rec in caplog.records if rec.name == "gdueca.access" and rec.request_id == rid]
    assert records, "缺少带 request id 的访问日志"
    msg = records[-1].getMessage()
    assert "GET /api/activities 200" in msg
    assert "13800000000" not in msg  # 查询参数不落日志
    assert records[-1].trace_id is None  # 只读请求不分配 trace id


def test_audit_log_records_request_and_trace_id(app):
    import asyncio
    from sqlalchemy import select
    from app.db.models import AuditLog
    from app.db.session import async_session

    client = make_client(app)
    r = client.post("/api/bugs", headers=csrf(client),
                    json={"contact_email": "t@qq.com", "description": "trace 测试"})
    assert r.status_code == 201
    rid, tid = r.headers["x-request-id"], r.headers["x-trace-id"]
    assert HEX32.match(tid) and tid != rid

    async def fetch():
        async with async_session() as s:
            return (await s.execute(select(AuditLog).where(AuditLog.request_id == rid))).scalars().all()
    rows = asyncio.run(fetch())
    assert [(row.action, row.trace_id) for row in rows] == [("bug.submit", tid)]


def test_unhandled_exception_returns_request_id(app, caplog):
    @app.get("/api/__boom_for_test")
    async def boom():
        raise RuntimeError("boom")

    client = TestClient(app, client=("127.0.0.1", 50000), raise_server_exceptions=False)
    with caplog.at_level(logging.ERROR, logger="gdueca.error"):
        r = client.get("/api/__boom_for_test")
    assert r.status_code == 500
    body = r.json()
    # 新响应壳：request_id 与响应头 X-Request-Id 同值；无写操作不带 X-Trace-Id
    assert body["request_id"] == r.headers["x-request-id"]
    assert "x-trace-id" not in r.headers
    assert "boom" not in r.text  # 不向客户端泄露异常细节
    assert any(rec.request_id == body["request_id"] and rec.exc_info for rec in caplog.records)


def test_formatters():
    from app.core.log import JsonFormatter, TextFormatter
    import json
    rec = logging.LogRecord("gdueca.test", logging.INFO, __file__, 1, "hello %s", ("世界",), None)
    rec.request_id = "abc12345"
    rec.trace_id = None
    rec.status = 200
    assert re.search(r"INFO  \[req=abc12345\] gdueca\.test \| hello 世界$", TextFormatter().format(rec))
    data = json.loads(JsonFormatter().format(rec))
    assert data["request_id"] == "abc12345" and "trace_id" not in data
    assert data["msg"] == "hello 世界" and data["status"] == 200

    rec.trace_id = "def67890"
    assert "[req=abc12345 trace=def67890]" in TextFormatter().format(rec)
    assert json.loads(JsonFormatter().format(rec))["trace_id"] == "def67890"
