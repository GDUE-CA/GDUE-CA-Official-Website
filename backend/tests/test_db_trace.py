"""数据库写操作 trace（app.core.db_trace）：只读无 trace、写操作 1:1 trace、行级变更、脱敏、
心跳列忽略、回滚作废、后台事务、批量语句、审计查询接口。"""
import asyncio
import re
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core import db_trace
from app.core.config import get_settings
from app.core.security import Role, hash_password
from app.db.models import AuditLog, DbChangeLog, DbTrace, LoginSession, Tag, User, utcnow
from tests.conftest import csrf, make_client

HEX32 = re.compile(r"^[0-9a-f]{32}$")
ADMIN = "dbtrace_admin"
ADMIN_PASSWORD = "DbTrace#Admin-2026"


def _with_session(fn):
    """一次性 engine（严禁在临时 loop 里触碰共享 engine，见 conftest）。"""
    async def _run():
        eng = create_async_engine(get_settings().DATABASE_URL, future=True)
        try:
            return await fn(async_sessionmaker(eng, expire_on_commit=False))
        finally:
            await eng.dispose()
    return asyncio.run(_run())


def _in_request(fn, request_id: str):
    token = db_trace.begin_request(request_id=request_id, method="POST", path="/api/test", ip="203.0.113.9")
    try:
        result = _with_session(fn)
        return result, db_trace.committed_trace_id()
    finally:
        db_trace.end_request(token)


def _trace_rows(trace_id: str):
    async def fn(maker):
        async with maker() as s:
            traces = (await s.execute(select(DbTrace).where(DbTrace.trace_id == trace_id))).scalars().all()
            changes = (await s.execute(
                select(DbChangeLog).where(DbChangeLog.trace_id == trace_id).order_by(DbChangeLog.id)
            )).scalars().all()
            return traces, changes
    return _with_session(fn)


def test_one_trace_per_request_with_row_level_changes(app):
    async def fn(maker):
        async with maker() as s:
            tag = Tag(name="dbtrace-a", slug="dbtrace-a")
            s.add(tag)
            await s.commit()
            tag.name = "dbtrace-b"
            await s.commit()  # 同一请求内多次提交共用一个 trace
            await s.delete(tag)
            await s.commit()
            return tag.id

    tag_id, trace_id = _in_request(fn, "req-dbtrace-0001")
    assert HEX32.match(trace_id)
    traces, changes = _trace_rows(trace_id)
    assert len(traces) == 1
    t = traces[0]
    assert (t.request_id, t.source, t.method, t.path, t.ip) == (
        "req-dbtrace-0001", "request", "POST", "/api/test", "203.0.113.9")

    assert [(c.table_name, c.row_pk, c.op) for c in changes] == [
        ("tags", str(tag_id), "insert"), ("tags", str(tag_id), "update"), ("tags", str(tag_id), "delete"),
    ]
    assert changes[0].changes["name"] == "dbtrace-a"
    assert changes[1].changes == {"name": ["dbtrace-a", "dbtrace-b"]}
    assert changes[2].changes["name"] == "dbtrace-b"


def test_sensitive_columns_are_masked(app):
    async def fn(maker):
        async with maker() as s:
            s.add(User(username="dbtrace_masked", email="masked@gdue-ca.cn",
                       password_hash=hash_password("Masked#Pwd-2026"), role=Role.MEMBER,
                       real_name="脱敏测试", student_id="00000097", phone="+8600000000097"))
            await s.commit()

    _, trace_id = _in_request(fn, "req-dbtrace-0002")
    _, changes = _trace_rows(trace_id)
    user_change = next(c for c in changes if c.table_name == "users")
    assert user_change.changes["password_hash"] == "***"
    assert user_change.changes["username"] == "dbtrace_masked"


def test_heartbeat_only_update_has_no_trace(app):
    async def seed(maker):
        async with maker() as s:
            u = User(username="dbtrace_hb", email="hb@gdue-ca.cn",
                     password_hash=hash_password("Heart#Beat-2026"), role=Role.MEMBER,
                     real_name="心跳测试", student_id="00000098", phone="+8600000000098")
            s.add(u)
            await s.flush()
            s.add(LoginSession(user_id=u.id, session_id="dbtrace-hb-sess", device_name="x",
                               device_model="x", user_agent="x", login_at=utcnow(),
                               last_active_at=utcnow(), expires_at=utcnow()))
            await s.commit()
    _with_session(seed)

    async def touch(maker):
        async with maker() as s:
            sess = (await s.execute(
                select(LoginSession).where(LoginSession.session_id == "dbtrace-hb-sess")
            )).scalar_one()
            sess.last_active_at = utcnow()
            await s.commit()

    _, trace_id = _in_request(touch, "req-dbtrace-0003")
    assert trace_id is None


def test_rollback_discards_trace(app):
    async def fn(maker):
        async with maker() as s:
            s.add(Tag(name="dbtrace-rolled", slug="dbtrace-rolled"))
            await s.flush()
            await s.rollback()
            assert db_trace.committed_trace_id() is None
            s.add(Tag(name="dbtrace-kept", slug="dbtrace-kept"))
            await s.commit()

    _, trace_id = _in_request(fn, "req-dbtrace-0004")
    traces, changes = _trace_rows(trace_id)
    assert len(traces) == 1
    assert [c.changes["name"] for c in changes] == ["dbtrace-kept"]


def test_background_transactions_get_separate_traces(app):
    async def fn(maker):
        async with maker() as s:
            s.add(Tag(name="dbtrace-bg-1", slug="dbtrace-bg-1"))
            await s.commit()
            s.add(Tag(name="dbtrace-bg-2", slug="dbtrace-bg-2"))
            await s.commit()
        async with maker() as s:
            rows = (await s.execute(
                select(DbChangeLog.trace_id, DbTrace.source)
                .join(DbTrace, DbTrace.trace_id == DbChangeLog.trace_id)
                .where(DbChangeLog.table_name == "tags", DbChangeLog.op == "insert")
                .order_by(DbChangeLog.id.desc()).limit(2)
            )).all()
            return rows

    rows = _with_session(fn)
    assert len({r.trace_id for r in rows}) == 2
    assert {r.source for r in rows} == {"background"}


def test_bulk_statement_is_recorded(app):
    async def fn(maker):
        async with maker() as s:
            s.add(Tag(name="dbtrace-bulk", slug="dbtrace-bulk"))
            await s.commit()
            await s.execute(delete(Tag).where(Tag.name == "dbtrace-bulk"))
            await s.commit()

    _, trace_id = _in_request(fn, "req-dbtrace-0005")
    _, changes = _trace_rows(trace_id)
    bulk = next(c for c in changes if c.op == "bulk_delete")
    assert bulk.table_name == "tags" and bulk.row_pk is None
    assert "DELETE FROM tags" in bulk.changes["statement"]
    assert "dbtrace-bulk" in bulk.changes["params"].values()
    assert bulk.changes["rowcount"] == 1


def test_bulk_statement_affecting_no_rows_has_no_trace(app):
    async def fn(maker):
        async with maker() as s:
            await s.execute(delete(Tag).where(Tag.name == "dbtrace-no-such-tag"))
            await s.commit()

    _, trace_id = _in_request(fn, "req-dbtrace-0006")
    assert trace_id is None


def test_purge_expired_respects_retention(app):
    from datetime import timedelta

    async def fn(maker):
        now = utcnow().replace(tzinfo=None)
        async with maker() as s:
            for tid, age in (("dbtrace-old-0001", 31), ("dbtrace-new-0001", 29)):
                at = now - timedelta(days=age)
                s.add(DbTrace(trace_id=tid, source="background", created_at=at))
                s.add(DbChangeLog(trace_id=tid, table_name="tags", op="insert", created_at=at))
            await s.commit()
            purged = await db_trace.purge_expired(
                s, now - timedelta(days=get_settings().DB_TRACE_RETENTION_DAYS))
            await s.commit()
            left = set((await s.execute(
                select(DbTrace.trace_id).where(DbTrace.trace_id.like("dbtrace-%-0001"))
            )).scalars())
            left_changes = set((await s.execute(
                select(DbChangeLog.trace_id).where(DbChangeLog.trace_id.like("dbtrace-%-0001"))
            )).scalars())
            return purged, left, left_changes

    purged, left, left_changes = _with_session(fn)
    assert get_settings().DB_TRACE_RETENTION_DAYS == 30
    assert purged >= 1
    assert left == left_changes == {"dbtrace-new-0001"}


def _admin_client(app):
    async def seed(maker):
        async with maker() as s:
            exists = (await s.execute(select(User).where(User.username == ADMIN))).scalar_one_or_none()
            if not exists:
                s.add(User(username=ADMIN, email="dbtrace-admin@gdue-ca.cn",
                           password_hash=hash_password(ADMIN_PASSWORD), role=Role.SUPER_ADMIN,
                           must_change_password=False, must_set_security_questions=False,
                           student_id="00000099", real_name="审计测试", phone="+8600000000099"))
                await s.commit()
    _with_session(seed)
    client = make_client(app)
    r = client.post("/api/auth/login", headers=csrf(client),
                    json={"username": ADMIN, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return client, {"X-CSRF-Token": r.json()["csrf_token"]}


def test_http_trace_header_and_query_api(app):
    client, headers = _admin_client(app)

    # 已登录的只读请求：会话滑动续期不算写操作
    r = client.get("/api/auth/me")
    assert r.status_code == 200, r.text
    assert "x-trace-id" not in r.headers

    r = client.post("/api/bugs", headers=headers,
                    json={"contact_email": "t@qq.com", "description": "db trace 接口测试"})
    assert r.status_code == 201, r.text
    trace_id, request_id = r.headers["x-trace-id"], r.headers["x-request-id"]

    detail = client.get(f"/api/admin/db-traces/{trace_id}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["trace"]["request_id"] == request_id
    assert body["trace"]["user_id"] is None  # 公开接口按匿名提交处理，不读取登录态
    assert body["trace"]["path"] == "/api/bugs"
    tables = {c["table_name"] for c in body["changes"]}
    assert {"bug_reports", "audit_logs"} <= tables
    assert [a["action"] for a in body["audit_logs"]] == ["bug.submit"]

    listing = client.get("/api/admin/db-traces", params={"table": "bug_reports"}).json()
    assert trace_id in [t["trace_id"] for t in listing["items"]]

    audit = client.get("/api/admin/audit-logs", params={"trace_id": trace_id}).json()
    assert [(a["request_id"], a["trace_id"]) for a in audit["items"]] == [(request_id, trace_id)]

    # 需登录的写接口：trace 记录操作者
    r = client.put("/api/admin/comments/settings", headers=headers, json={"comments_enabled": True})
    assert r.status_code == 200, r.text
    settings_trace = client.get(f"/api/admin/db-traces/{r.headers['x-trace-id']}").json()["trace"]
    assert settings_trace["username"] == ADMIN and settings_trace["method"] == "PUT"

    assert client.get("/api/admin/db-traces/" + "0" * 32).status_code == 404
    assert make_client(app).get(f"/api/admin/db-traces/{trace_id}").status_code == 401


def test_all_get_db_dependencies_use_function_scope():
    """混用默认 scope 会在同一请求内创建两个会话，且默认 scope 在响应发出后才提交。"""
    app_dir = Path(__file__).resolve().parents[1] / "app"
    offenders = [
        f"{p.relative_to(app_dir)}:{i}"
        for p in app_dir.rglob("*.py")
        for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1)
        if "Depends(get_db)" in line
    ]
    assert not offenders, offenders
