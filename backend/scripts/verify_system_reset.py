"""V0.5.7 系统重置 + 备份文件列表 端到端验证脚本（隔离临时库，严禁触碰 dev 库）。

运行：cd backend && python scripts/verify_system_reset.py
覆盖：
- TR-1.1/TR-1.2 备份导出任务、文件列表/下载/路径穿越防护；
- TR-2.1 权限矩阵（匿名/editor/admin 拒绝、super 通过、BG ctx 旁路）、错误确认文本 400、并发 409；
- TR-2.2 备份失败注入 → FAILED 且数据/文件原样；
- TR-2.3 成功路径：全部表清空（仅豁免 3 行）、回到向导态、uploads 清理、exports 保留、
  旧 cookie 401、BG KV 会话清除；
- TR-2.4 代码层无 DROP（本脚本仅 DELETE/SELECT/INSERT）。
"""
from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import sys
import tempfile
import time
from datetime import datetime, timezone
from enum import Enum as PyEnum
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

WORK = Path(tempfile.mkdtemp(prefix="gdueca-reset-verify-"))
os.environ.update({
    "DATABASE_URL": f"sqlite+aiosqlite:///{WORK / 'verify.db'}",
    "CORS_ORIGINS": "",
})
os.chdir(WORK)
print(f"[env] 隔离工作目录：{WORK}")

PASS = 0
FAIL = 0


def check(name: str, cond: bool, extra: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name} {extra}")


async def _bootstrap() -> None:
    """建表 + 默认设置 + 3 个不同角色用户（独立一次性 engine）。"""
    import bcrypt
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import get_settings
    from app.core.security import Role, hash_password
    from app.db.models import Base, SystemSetting, User

    eng = create_async_engine(
        get_settings().DATABASE_URL, echo=False,
        connect_args={"check_same_thread": False},
    )
    try:
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        maker = async_sessionmaker(eng, expire_on_commit=False)
        async with maker() as s:
            s.add(SystemSetting(id=1, system_initialized=True))
            for uname, role in (("root", Role.SUPER_ADMIN),
                                ("adm", Role.ADMIN),
                                ("ed", Role.EDITOR)):
                s.add(User(
                    username=uname,
                    email=f"{uname}@club.local",
                    password_hash=hash_password("Gd#Ca-Str0ng!Pwd"),
                    role=role,
                    must_change_password=False,
                    realname_verified=True,
                    student_id=f"0000000{role.value[0]}",
                    real_name=uname,
                    phone="+8613800000000",
                ))
            await s.commit()
    finally:
        await eng.dispose()


asyncio.run(_bootstrap())

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.db.models import (  # noqa: E402
    AuditLog,
    BackgroundTask,
    BackgroundTaskCategory,
    BackgroundTaskStatus,
    Base,
)


def db_path() -> Path:
    return WORK / "verify.db"


def table_counts() -> dict[str, int]:
    con = sqlite3.connect(db_path())
    try:
        return {
            t.name: con.execute(f"SELECT COUNT(*) FROM {t.name}").fetchone()[0]
            for t in Base.metadata.sorted_tables
        }
    finally:
        con.close()


def task_row(task_id: str) -> dict:
    con = sqlite3.connect(db_path())
    con.row_factory = sqlite3.Row
    try:
        r = con.execute(
            "SELECT status, progress, message, result_payload FROM background_tasks WHERE id=?",
            (task_id,),
        ).fetchone()
        return dict(r) if r else {}
    finally:
        con.close()


def wait_finish(task_id: str, timeout: float = 60) -> dict:
    deadline = time.time() + timeout
    row = {}
    while time.time() < deadline:
        row = task_row(task_id)
        if row.get("status") in ("SUCCESS", "FAILED"):
            return row
        time.sleep(0.05)
    raise RuntimeError(f"任务 {task_id} 超时未结束：{row}")


def data_of(resp) -> dict:
    j = resp.json()
    return j.get("data", j) if isinstance(j, dict) else {}


def login(client: TestClient, username: str) -> None:
    tok = client.get("/api/auth/csrf").json()["csrf_token"]
    r = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Gd#Ca-Str0ng!Pwd"},
        headers={"X-CSRF-Token": tok},
    )
    assert r.status_code == 200, f"登录 {username} 失败：{r.status_code} {r.text[:200]}"


def csrf_h(client: TestClient) -> dict:
    return {"X-CSRF-Token": client.get("/api/auth/csrf").json()["csrf_token"]}


async def _seed_every_table() -> None:
    """给每张（非空表除外）表插 1 行最小合法数据，证明重置确实全表清空。"""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import get_settings

    eng = create_async_engine(
        get_settings().DATABASE_URL, echo=False,
        connect_args={"check_same_thread": False},
    )
    try:
        maker = async_sessionmaker(eng, expire_on_commit=False)
        async with maker() as s:
            conn = await s.connection()
            for table in Base.metadata.sorted_tables:
                existing = (await conn.execute(table.select().limit(1))).first()
                if existing:
                    continue
                values = {}
                for c in table.columns:
                    if c.nullable or c.primary_key or c.default is not None or c.server_default is not None:
                        continue
                    py = c.type.python_type
                    if isinstance(py, type) and issubclass(py, PyEnum):
                        values[c.name] = list(py)[0].value
                    elif py is bool:
                        values[c.name] = False
                    elif py is int:
                        values[c.name] = 1
                    elif py is float:
                        values[c.name] = 1.0
                    elif py is datetime:
                        values[c.name] = datetime.now(timezone.utc).replace(tzinfo=None)
                    else:
                        values[c.name] = "x"
                try:
                    await conn.execute(table.insert().values(**values))
                except Exception as e:  # 个别表有特殊约束：记录但不致命
                    print(f"  [seed-skip] {table.name}: {str(e)[:80]}")
            s.add(AuditLog(actor="seed", action="seed.old1", ip="10.0.0.1"))
            s.add(AuditLog(actor="seed", action="seed.old2", ip="10.0.0.2"))
            await s.commit()
    finally:
        await eng.dispose()


async def _set_fake_active(active: bool) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import get_settings

    eng = create_async_engine(
        get_settings().DATABASE_URL, echo=False,
        connect_args={"check_same_thread": False},
    )
    try:
        maker = async_sessionmaker(eng, expire_on_commit=False)
        async with maker() as s:
            if active:
                s.add(BackgroundTask(
                    id="fake-active-reset",
                    title="fake",
                    category=BackgroundTaskCategory.SYSTEM_RESET,
                    status=BackgroundTaskStatus.RUNNING,
                    progress=10,
                ))
            else:
                row = await s.get(BackgroundTask, "fake-active-reset")
                if row:
                    await s.delete(row)
            await s.commit()
    finally:
        await eng.dispose()


def _client() -> TestClient:
    # 指定 client 地址，使 get_client_ip 解析出 127.0.0.1（默认 testclient 非 IP）
    return TestClient(app, client=("127.0.0.1", 50000))


with _client() as client:
    # 只用一个 TestClient：每个 TestClient 自带独立 portal 事件循环，多客户端共享
    # engine 会让 aiosqlite 连接跨 loop 绑定，后台任务协程将永久挂起。
    su = client
    anon = _client()
    payload = {"confirm_text": "I confirm system reset"}
    # 权限矩阵：同一客户端串行切换登录身份
    login(su, "ed")
    check("editor 403", su.post("/api/admin/system/reset", json=payload, headers=csrf_h(su)).status_code == 403)
    login(su, "adm")
    check("admin 403", su.post("/api/admin/system/reset", json=payload, headers=csrf_h(su)).status_code == 403)
    login(su, "root")

    print("\n[1] 备份导出任务 + 文件列表/下载/路径穿越")
    r = su.post("/api/admin/db/export", headers=csrf_h(su))
    check("提交导出 200", r.status_code == 200, r.text[:150])
    export_tid = data_of(r)["task_id"]
    row = wait_finish(export_tid)
    check("导出任务 SUCCESS", row["status"] == "SUCCESS", row["message"])
    first_backup = json.loads(row["result_payload"])["filename"]

    r = su.get("/api/admin/db/exports")
    items = data_of(r)["items"]
    check("列表 200 且含备份", r.status_code == 200 and any(i["filename"] == first_backup for i in items))
    check("列表字段完整", all({"filename", "size_bytes", "created_at"} <= set(i) for i in items))
    check("时间为 UTC-Z", items[0]["created_at"].endswith("Z"))

    r = su.get(f"/api/admin/db/exports/{first_backup}/download")
    disk = (WORK / "exports" / first_backup).read_bytes()
    check("下载 200 且字节一致", r.status_code == 200 and r.content == disk)
    for bad in ["..%2f..%2fx", "..", ".", "foo/bar.sql", ""]:
        # 已登录客户端验证纯文件名白名单（匿名会先被鉴权拦截，测不到穿越防护）
        rr = su.get(f"/api/admin/db/exports/{bad}/download")
        check(f"非法文件名拒绝 {bad or '<empty>'}", rr.status_code in (400, 404))

    print("\n[2] 匿名拒绝 + 确认文本 + 409")
    check("匿名 401/403", anon.post("/api/admin/system/reset", json=payload).status_code in (401, 403))
    r = su.post("/api/admin/system/reset", json={"confirm_text": "wrong"}, headers=csrf_h(su))
    check("错误确认文本 400", r.status_code == 400)

    asyncio.run(_set_fake_active(True))
    r = su.post("/api/admin/system/reset", json=payload, headers=csrf_h(su))
    check("进行中重复提交 409", r.status_code == 409, r.text[:100])
    asyncio.run(_set_fake_active(False))

    # Break-Glass 旁路：直接驱动 require_permission 依赖，伪造 BG 认证 ctx
    import app.core.permissions as perm

    async def _fake_bg_auth(request, db):
        return ({"break_glass": True, "role": None, "user_id": None}, None)

    orig_auth = perm._authenticate
    perm._authenticate = _fake_bg_auth
    try:
        dep = perm.require_permission("system_reset", "manage")
        bg_ctx = asyncio.run(dep(request=None, db=None))
        check("BG ctx 权限旁路", bg_ctx.get("break_glass") is True)
    finally:
        perm._authenticate = orig_auth

    print("\n[3] 预置全表数据 + 哨兵文件")
    asyncio.run(_seed_every_table())
    sentinel = WORK / "uploads" / "avatars" / "sentinel.txt"
    sentinel.parent.mkdir(parents=True, exist_ok=True)
    sentinel.write_text("delete-me", encoding="utf-8")
    counts_before = table_counts()
    check("预置后 users=3", counts_before["users"] == 3, str(counts_before["users"]))
    check("预置后 audit_logs>=3", counts_before["audit_logs"] >= 3)

    from app.core.kv import get_kv
    asyncio.run(get_kv().set("bg:session:fake-jti", "{}", 600))
    check("BG 会话哨兵已写入 KV", asyncio.run(get_kv().get("bg:session:fake-jti")) is not None)

    print("\n[4] 备份失败注入 → 中止且数据不动")
    import app.core.system_reset as sr

    async def _boom():
        raise RuntimeError("mock export failure")

    orig = sr.perform_full_export
    sr.perform_full_export = _boom
    try:
        r = su.post("/api/admin/system/reset", json=payload, headers=csrf_h(su))
        check("失败场景仍可提交 200", r.status_code == 200, r.text[:120])
        bad_tid = data_of(r)["task_id"]
        row = wait_finish(bad_tid)
        check("任务 FAILED", row["status"] == "FAILED", row["message"])
        check("失败信息提示未清空", "未被清空" in row["message"])
        check("users 行数不变", table_counts()["users"] == 3)
        check("uploads 哨兵保留", sentinel.exists())
    finally:
        sr.perform_full_export = orig

    print("\n[5] 真实系统重置")
    r = su.post("/api/admin/system/reset", json=payload, headers=csrf_h(su))
    check("提交重置 200", r.status_code == 200, r.text[:150])
    tid = data_of(r)["task_id"]
    row = wait_finish(tid)
    check("重置任务 SUCCESS", row["status"] == "SUCCESS", row["message"])
    rp = json.loads(row["result_payload"])
    check("结果含备份文件名", bool(rp.get("backup_filename", "").startswith("full_dump_")))
    check("进度 100", row["progress"] == 100)

    print("\n[6] 清空范围核验（逐表）")
    counts = table_counts()
    bad_tables = {n: c for n, c in counts.items()
                  if c != 0 and n not in ("system_settings", "background_tasks", "audit_logs")}
    check("除三豁免表外全部为 0", not bad_tables, str(bad_tables))
    check("system_settings=1 默认行", counts["system_settings"] == 1)
    check("background_tasks=1（仅重置任务行）", counts["background_tasks"] == 1)
    check("audit_logs=1（仅豁免审计行）", counts["audit_logs"] == 1)

    con = sqlite3.connect(db_path())
    con.row_factory = sqlite3.Row
    ar = con.execute(
        "SELECT user_id, actor, action, ip, target, detail FROM audit_logs"
    ).fetchone()
    con.close()
    check("审计 action 正确", ar["action"] == "system.reset.execute")
    check("审计 user_id 为 NULL", ar["user_id"] is None, str(ar["user_id"]))
    check("审计 actor 含操作者", ar["actor"].startswith("reset:"), ar["actor"])
    check("审计 IP 非空", bool(ar["ip"]))
    check("审计 detail 含备份文件名", rp["backup_filename"] in ar["detail"])

    check("uploads 哨兵文件已删", not sentinel.exists())
    check("uploads/avatars 目录保留", (WORK / "uploads" / "avatars").is_dir())
    exports = list((WORK / "exports").glob("full_dump_*.sql"))
    check("exports 保留 2 份备份", len(exports) == 2, str([p.name for p in exports]))

    r = anon.get("/api/system-init/status")
    st = data_of(r)
    check("回到向导态 system_initialized=false", st.get("system_initialized") is False, str(st))

    print("\n[7] 会话失效核验")
    check("旧登录 cookie /me 401", su.get("/api/auth/me").status_code == 401)
    check("BG KV 会话已清除", asyncio.run(get_kv().get("bg:session:fake-jti")) is None)

    print("\n[8] 重走初始化（模拟向导产物）后备份列表/下载可见")
    from app.core.security import Role, hash_password
    from app.db.models import User as UserModel

    async def _reseed_admin():
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
        from app.core.config import get_settings
        from app.db.models import SystemSetting as SS
        eng = create_async_engine(
            get_settings().DATABASE_URL, connect_args={"check_same_thread": False}
        )
        try:
            async with async_sessionmaker(eng)() as s:
                # 等价于向导最后一步：system_initialized=true + 首位超管
                setting = await s.get(SS, 1)
                setting.system_initialized = True
                s.add(UserModel(
                    username="root2", email="root2@club.local",
                    password_hash=hash_password("Gd#Ca-Str0ng!Pwd"),
                    role=Role.SUPER_ADMIN, must_change_password=False,
                    realname_verified=True, student_id="00000009",
                    real_name="新超管", phone="+8613800000001",
                ))
                await s.commit()
        finally:
            await eng.dispose()

    asyncio.run(_reseed_admin())
    login(su, "root2")
    items = data_of(su.get("/api/admin/db/exports"))["items"]
    check("重置后备份在列表可见", any(i["filename"] == rp["backup_filename"] for i in items))
    r = su.get(f"/api/admin/db/exports/{rp['backup_filename']}/download")
    check("重置备份可下载 200", r.status_code == 200 and len(r.content) == rp["size_bytes"])

print(f"\n==== 结果：{PASS} PASS / {FAIL} FAIL ====")
sys.exit(1 if FAIL else 0)
