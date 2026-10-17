"""V0.5.8 注册三步接口端到端验证（隔离临时库，严禁触碰 dev 库）。

运行：cd backend && python scripts/verify_p3_register_steps.py
覆盖：
- POST /api/auth/register/send-code：非法邮箱 422、占位域 400、已占用邮箱 400、
  重发间隔提示、验证码一次性 KV 存储（SMTP 未配置经 monkeypatch 捕获）；
- GET /api/auth/register/check-username：可用/占用/长度 422；
- POST /api/auth/register：缺 code 422、错误码 400、码与邮箱不匹配 400、
  正确码 201、一次性（复用同码再注册 400）、注册后可登录、role 强制 member。
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

WORK = Path(tempfile.mkdtemp(prefix="gdueca-p3-verify-"))
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


async def _bootstrap() -> None:
    """建表 + 默认设置 + 超管（root@club.local 用作「已占用邮箱」样本）。"""
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

# 捕获注册验证码：SMTP 未配置，monkeypatch send_email 直接从邮件正文取 6 位码
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
    """重置限流 / 防爆破计数 / KV（分段验证互不影响）。"""
    from app.core import middleware, rate_limit
    from app.core.kv import reset_kv
    rate_limit.reset()
    middleware._rate_buckets.clear()
    reset_kv()


def send_code(client: TestClient, email: str):
    return client.post("/api/auth/register/send-code", headers=csrf_h(client),
                       json={"email": email})


def register(client: TestClient, tag: str, email: str, code: str):
    return client.post("/api/auth/register", headers=csrf_h(client), json={
        "username": f"p3{tag}",
        "display_name": f"三步测试{tag}",
        "password": MEMBER_PWD,
        "confirm_password": MEMBER_PWD,
        "email": email,
        "code": code,
        "security_questions": [
            {"position": 1, "question": "sq.first_pet", "answer": "旺财", "is_custom": False},
            {"position": 2, "question": "sq.birth_city", "answer": "广州", "is_custom": False},
            {"position": 3, "question": "sq.first_school", "answer": "实验小学", "is_custom": False},
        ],
    })


with TestClient(app) as client:
    print("\n[1] send-code 校验")
    reset_limits()
    r = client.post("/api/auth/register/send-code", headers=csrf_h(client),
                    json={"email": "not-an-email"})
    check("非法邮箱格式 422", r.status_code == 422, r.text[:200])

    r = send_code(client, "ghost@users.placeholder")
    check("占位域邮箱 400", r.status_code == 400, r.text[:200])

    r = send_code(client, "root@club.local")
    check("已占用邮箱 400（明确提示）", r.status_code == 400 and "邮箱已被使用" in r.text,
          r.text[:200])

    reset_limits()
    r = send_code(client, "p3first@club.local")
    check("正常发码 200", r.status_code == 200, r.text[:200])
    check("验证码已捕获", "p3first@club.local" in _CAPTURED)
    r = send_code(client, "p3first@club.local")
    check("重发间隔提示", r.status_code == 200 and "间隔未到" in r.text, r.text[:200])

    print("\n[2] check-username")
    r = client.get("/api/auth/register/check-username", params={"username": "root"})
    check("占用用户名 available=false", r.status_code == 200
          and r.json()["available"] is False, r.text[:200])
    r = client.get("/api/auth/register/check-username", params={"username": "brandnewuser"})
    check("新用户名 available=true", r.status_code == 200
          and r.json()["available"] is True, r.text[:200])
    r = client.get("/api/auth/register/check-username", params={"username": "x"})
    check("过短用户名 422", r.status_code == 422, r.text[:200])

    print("\n[3] register 验证码核验")
    reset_limits()
    r = client.post("/api/auth/register", headers=csrf_h(client), json={
        "username": "p3nocode", "display_name": "无码", "password": MEMBER_PWD,
        "confirm_password": MEMBER_PWD, "email": "p3nocode@club.local",
        "security_questions": [
            {"position": 1, "question": "sq.first_pet", "answer": "旺财", "is_custom": False},
            {"position": 2, "question": "sq.birth_city", "answer": "广州", "is_custom": False},
            {"position": 3, "question": "sq.first_school", "answer": "实验小学", "is_custom": False},
        ],
    })
    check("缺 code 字段 422", r.status_code == 422, r.text[:300])

    reset_limits()
    send_code(client, "p3wrong@club.local")
    r = register(client, "wrong", "p3wrong@club.local", "000000")
    real_code = _CAPTURED["p3wrong@club.local"]
    check("错误验证码 400", r.status_code == 400 and "验证码" in r.text, r.text[:300])
    check("捕获码非 000000（防误中）", real_code != "000000")

    # 码与邮箱不匹配：给 A 邮箱发码，用 B 邮箱 + A 的码注册
    reset_limits()
    send_code(client, "p3bind@club.local")
    bound_code = _CAPTURED["p3bind@club.local"]
    r = register(client, "mismatch", "p3other@club.local", bound_code)
    check("码与邮箱不匹配 400", r.status_code == 400, r.text[:300])

    print("\n[4] 注册全链路 + 一次性")
    reset_limits()
    send_code(client, "p3full@club.local")
    code = _CAPTURED["p3full@club.local"]
    r = register(client, "full", "p3full@club.local", code)
    check("正确码注册 201", r.status_code == 201, r.text[:300])
    if r.status_code == 201:
        body = r.json()
        data = body.get("data", body)
        check("role 强制 member", str(data.get("role")).lower() == "member", str(data)[:200])

    # 同码复用（换用户名）必须失败：一次性已核销
    r = register(client, "reuse", "p3full@club.local", code)
    check("同码复用 400/码作废", r.status_code in (400, 422), r.text[:300])

    # 新账号可登录
    r = client.post("/api/auth/login", headers=csrf_h(client),
                    json={"username": "p3full", "password": MEMBER_PWD})
    check("新账号登录 200", r.status_code == 200, r.text[:200])

    # 已注册邮箱再发码 → 占用 400
    reset_limits()
    r = send_code(client, "p3full@club.local")
    check("注册后该邮箱发码 400", r.status_code == 400 and "邮箱已被使用" in r.text,
          r.text[:200])

    print("\n[5] 第二步换邮箱服务端强制（回退第一步才可更换）")
    reset_limits()
    send_code(client, "p3swap@club.local")
    swap_code = _CAPTURED["p3swap@club.local"]
    # 用户在第二步擅自改成另一个邮箱提交 → 服务端码核验不过
    r = register(client, "swap", "p3swap2@club.local", swap_code)
    check("换邮箱提交 400", r.status_code == 400, r.text[:300])
    # 用原邮箱 + 原码（未被错误尝试作废，因错误尝试发生在别的邮箱键上）仍可注册
    r = register(client, "swap", "p3swap@club.local", swap_code)
    check("原邮箱+原码 201", r.status_code == 201, r.text[:300])

print(f"\n========== 结果：{PASS} PASS / {FAIL} FAIL ==========")
sys.exit(1 if FAIL else 0)
