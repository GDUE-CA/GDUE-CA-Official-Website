"""V0.5.8 一次性安全恢复码端到端验证（隔离临时库，严禁触碰 dev 库）。

运行：cd backend && python scripts/verify_p4_recovery_codes.py
覆盖：
- 未登录 401；生成 201 且明文仅此一次（格式 4×5 分组）；列表元数据不含明文/哈希；
- 作废：本人可作废、二次作废 400、他人物件 404、已使用码作废 400、作废后使用 400；
- 找回：错误码 400、不存在账号同文案 400（防枚举）、用户名/邮箱两种定位均可用、
  找回成功密码生效可登录、码一次性（复用 400）、找回后旧会话强制下线、审计落库。
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

WORK = Path(tempfile.mkdtemp(prefix="gdueca-p4-verify-"))
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


ADMIN_PWD = "Gd#Ca-Str0ng!Pwd"
MEMBER_PWD = "Mm#br-2025safePwd"
NEW_PWD = "Nn#ew-2025safePwd"


async def _bootstrap() -> None:
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
            s.add(User(
                username="root",
                email="root@club.local",
                password_hash=hash_password(ADMIN_PWD),
                role=Role.SUPER_ADMIN,
                must_change_password=False,
                realname_verified=True,
                student_id="00000000",
                real_name="root",
                phone="+8613800000000",
            ))
            await s.commit()
    finally:
        await eng.dispose()


asyncio.run(_bootstrap())

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
import app.api.auth as auth_api  # noqa: E402

_CAPTURED: dict[str, str] = {}


async def _capture_mail(to_addr: str, subject: str, body: str) -> bool:
    m = re.search(r"验证码：(\d{6})", body)
    if m:
        _CAPTURED[to_addr.strip()] = m.group(1)
    return True


auth_api.send_email = _capture_mail


def csrf_h(client: TestClient) -> dict:
    return {"X-CSRF-Token": client.get("/api/auth/csrf").json()["csrf_token"]}


def reset_limits() -> None:
    from app.core import middleware, rate_limit
    from app.core.kv import reset_kv
    rate_limit.reset()
    middleware._rate_buckets.clear()
    reset_kv()


def register_member(client: TestClient, tag: str) -> None:
    """经三步流程注册 member（send-code 捕获验证码）。"""
    reset_limits()
    email = f"p4{tag}@club.local"
    r = client.post("/api/auth/register/send-code", headers=csrf_h(client),
                    json={"email": email})
    assert r.status_code == 200, f"send-code 失败：{r.text[:200]}"
    r = client.post("/api/auth/register", headers=csrf_h(client), json={
        "username": f"p4{tag}", "display_name": f"恢复码测试{tag}",
        "password": MEMBER_PWD, "confirm_password": MEMBER_PWD,
        "email": email, "code": _CAPTURED[email],
        "security_questions": [
            {"position": 1, "question": "sq.first_pet", "answer": "旺财", "is_custom": False},
            {"position": 2, "question": "sq.birth_city", "answer": "广州", "is_custom": False},
            {"position": 3, "question": "sq.first_school", "answer": "实验小学", "is_custom": False},
        ],
    })
    assert r.status_code == 201, f"注册失败：{r.text[:300]}"


def login(client: TestClient, username: str, password: str) -> dict:
    r = client.post("/api/auth/login", headers=csrf_h(client),
                    json={"username": username, "password": password})
    assert r.status_code == 200, f"登录失败 {username}：{r.status_code} {r.text[:200]}"
    return {"X-CSRF-Token": r.json()["csrf_token"]}


with TestClient(app) as client:
    register_member(client, "alice")
    register_member(client, "bob")

    print("\n[1] 鉴权与生成")
    anon = TestClient(app)  # 独立无会话客户端
    anon.__enter__()
    r = anon.get("/api/auth/recovery-codes")
    check("未登录列表 401", r.status_code == 401, r.text[:200])

    alice = login(client, "p4alice", MEMBER_PWD)
    reset_limits()
    r = client.post("/api/auth/recovery-codes", headers=alice)
    check("生成 201", r.status_code in (200, 201), r.text[:300])
    code1 = r.json()["code"]
    check("明文格式 4×5 分组", bool(re.fullmatch(r"[A-Z2-9]{5}(-[A-Z2-9]{5}){3}", code1)), code1)
    item1 = r.json()["item"]
    check("item 元数据齐", item1["used_at"] is None and item1["revoked"] is False)

    r = client.get("/api/auth/recovery-codes", headers=alice)
    rows = r.json()
    check("列表含新码", any(x["id"] == item1["id"] for x in rows))
    check("列表不含明文/哈希", all("code" not in x and "code_sha256" not in x for x in rows))

    print("\n[2] 作废规则")
    r = client.post("/api/auth/recovery-codes", headers=alice)
    code2 = r.json()["code"]
    item2_id = r.json()["item"]["id"]
    r = client.delete(f"/api/auth/recovery-codes/{item2_id}", headers=alice)
    check("本人作废 204", r.status_code == 204, r.text[:200])
    r = client.delete(f"/api/auth/recovery-codes/{item2_id}", headers=alice)
    check("二次作废 400", r.status_code == 400, r.text[:200])

    bob = login(client, "p4bob", MEMBER_PWD)
    r = client.delete(f"/api/auth/recovery-codes/{item1['id']}", headers=bob)
    check("他人物件 404", r.status_code == 404, r.text[:200])

    print("\n[3] 找回：错误码 / 防枚举 / 作废码")
    reset_limits()
    r = client.post("/api/auth/forgot-password/recovery-reset", headers=csrf_h(client), json={
        "account": "p4alice", "recovery_code": "AAAAA-BBBBB-CCCCC-DDDDD",
        "new_password": NEW_PWD, "confirm_password": NEW_PWD,
    })
    check("错误码 400", r.status_code == 400, r.text[:300])
    msg_wrong = r.json()
    r = client.post("/api/auth/forgot-password/recovery-reset", headers=csrf_h(client), json={
        "account": "no_such_user", "recovery_code": code1,
        "new_password": NEW_PWD, "confirm_password": NEW_PWD,
    })
    check("不存在账号同文案 400（防枚举）",
          r.status_code == 400 and {k: v for k, v in r.json().items() if k != "request_id"}
          == {k: v for k, v in msg_wrong.items() if k != "request_id"},
          f"{r.text[:200]} vs {msg_wrong}")
    r = client.post("/api/auth/forgot-password/recovery-reset", headers=csrf_h(client), json={
        "account": "p4alice", "recovery_code": code2,
        "new_password": NEW_PWD, "confirm_password": NEW_PWD,
    })
    check("已作废码 400", r.status_code == 400, r.text[:300])

    print("\n[4] 找回成功：用户名定位 + 一次性 + 会话强退")
    # 先登录一个旧会话（重置后必须失效）
    old_session = login(client, "p4alice", MEMBER_PWD)
    r = client.get("/api/auth/me")
    check("旧会话重置前有效", r.status_code == 200, r.text[:200])

    reset_limits()
    r = client.post("/api/auth/forgot-password/recovery-reset", headers=csrf_h(client), json={
        "account": "p4alice", "recovery_code": code1.lower().replace("-", ""),
        "new_password": NEW_PWD, "confirm_password": NEW_PWD,
    })
    check("用户名定位找回 200（码大小写/分隔符规范化）", r.status_code == 200, r.text[:300])
    r = client.get("/api/auth/me")
    check("旧会话强制下线 401", r.status_code == 401, r.text[:200])
    r = client.post("/api/auth/login", headers=csrf_h(client),
                    json={"username": "p4alice", "password": NEW_PWD})
    check("新密码可登录", r.status_code == 200, r.text[:200])

    reset_limits()
    r = client.post("/api/auth/forgot-password/recovery-reset", headers=csrf_h(client), json={
        "account": "p4alice", "recovery_code": code1,
        "new_password": NEW_PWD, "confirm_password": NEW_PWD,
    })
    check("已使用码复用 400（一次性）", r.status_code == 400, r.text[:300])
    r = client.get("/api/auth/recovery-codes", headers=login(client, "p4alice", NEW_PWD))
    used = next(x for x in r.json() if x["id"] == item1["id"])
    check("used_at 已写入", used["used_at"] is not None)
    r = client.delete(f"/api/auth/recovery-codes/{item1['id']}",
                      headers={"X-CSRF-Token": client.get("/api/auth/csrf").json()["csrf_token"]})
    check("已使用码作废 400", r.status_code == 400, r.text[:200])

    print("\n[5] 找回成功：邮箱定位")
    alice_h = login(client, "p4alice", NEW_PWD)
    reset_limits()
    r = client.post("/api/auth/recovery-codes", headers=alice_h)
    code3 = r.json()["code"]
    reset_limits()
    r = client.post("/api/auth/forgot-password/recovery-reset", headers=csrf_h(client), json={
        "account": "p4alice@club.local", "recovery_code": code3,
        "new_password": MEMBER_PWD, "confirm_password": MEMBER_PWD,
    })
    check("邮箱定位找回 200", r.status_code == 200, r.text[:300])

    print("\n[6] 审计落库")
    from app.db.session import get_db  # noqa: F401 —— 确认模型侧无异常（审计行走 API 内 log_action）
    # 直接查库核对审计动作
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from app.core.config import get_settings
    from app.db.models import AuditLog

    async def _audit_actions() -> set[str]:
        eng = create_async_engine(get_settings().DATABASE_URL,
                                  connect_args={"check_same_thread": False})
        try:
            maker = async_sessionmaker(eng)
            async with maker() as s:
                rows = (await s.execute(select(AuditLog.action))).scalars().all()
                return set(rows)
        finally:
            await eng.dispose()

    actions = asyncio.run(_audit_actions())
    check("审计含 generate/use/revoke/use_failed",
          {"recovery_code.generate", "recovery_code.use",
           "recovery_code.revoke", "recovery_code.use_failed"} <= actions,
          str(sorted(a for a in actions if a.startswith("recovery"))))

    anon.__exit__(None, None, None)

print(f"\n========== 结果：{PASS} PASS / {FAIL} FAIL ==========")
sys.exit(1 if FAIL else 0)
