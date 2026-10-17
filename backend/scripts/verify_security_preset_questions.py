"""V0.5.8 安全问题预设题库（DB 化 + CRUD + 黑名单）端到端验证（隔离临时库，严禁触碰 dev 库）。

运行：cd backend && python scripts/verify_security_preset_questions.py
覆盖：
- 启动 seed：10 条内置题入库；公开 presets 端点按 X-Locale 返回 zh/en 文本对象数组；
- 后台 CRUD：新增 / 编辑 / 停用 / 删除；管理员录入同样过黑名单（422）；
- 已使用题禁止物理删除（400）；停用后公开列表消失、提交该文本 422，历史 key 仍兼容；
- 注册：预设 key / 题库文本快照两种形态均 201；
- 自定义问题黑名单：隐私关键词 / 手机号形态 / 敏感政治历史均 422；合法自定义 201。
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

WORK = Path(tempfile.mkdtemp(prefix="gdueca-sq-verify-"))
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
    """建表 + 默认设置 + 超管（独立一次性 engine）。"""
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
    import re
    m = re.search(r"验证码：(\d{6})", body)
    if m:
        _CAPTURED[to_addr.strip()] = m.group(1)
    return True


auth_api.send_email = _capture_mail


def csrf_h(client: TestClient) -> dict:
    return {"X-CSRF-Token": client.get("/api/auth/csrf").json()["csrf_token"]}


def login_admin(client: TestClient) -> dict:
    r = client.post("/api/auth/login", headers=csrf_h(client),
                    json={"username": "root", "password": ADMIN_PWD})
    assert r.status_code == 200, f"超管登录失败：{r.status_code} {r.text[:200]}"
    return {"X-CSRF-Token": r.json()["csrf_token"]}


def register(client: TestClient, tag: str, questions: list[dict]):
    """V0.5.8 三步注册：send-code → 捕获验证码 → /register 携带 code。"""
    reset_limits()
    email = f"p2{tag}@club.local"
    r = client.post("/api/auth/register/send-code", headers=csrf_h(client),
                    json={"email": email})
    assert r.status_code == 200, f"send-code 失败：{r.status_code} {r.text[:200]}"
    code = _CAPTURED.get(email)
    assert code, f"未捕获到 {email} 的注册验证码"
    return client.post("/api/auth/register", headers=csrf_h(client), json={
        "username": f"p2{tag}",
        "display_name": f"题库测试{tag}",
        "password": MEMBER_PWD,
        "confirm_password": MEMBER_PWD,
        "email": email,
        "code": code,
        "phone": "+8613900000000",
        "security_questions": questions,
    })


def three(q1="sq.first_pet", q2="sq.birth_city", q3="sq.first_school"):
    return [
        {"position": 1, "question": q1, "answer": "旺财", "is_custom": False},
        {"position": 2, "question": q2, "answer": "广州", "is_custom": False},
        {"position": 3, "question": q3, "answer": "实验小学", "is_custom": False},
    ]


def custom_at(pos: int, question: str, answer: str = "这个答案足够长"):
    return {"position": pos, "question": question, "answer": answer, "is_custom": True}


def reset_limits() -> None:
    """重置限流 / 防爆破计数（注册接口 5/hour，分段验证需清空避免跨段累积 429）。"""
    from app.core import middleware, rate_limit
    from app.core.kv import reset_kv
    rate_limit.reset()
    middleware._rate_buckets.clear()
    reset_kv()


with TestClient(app) as client:
    admin = login_admin(client)

    print("\n[1] seed 与公开 presets 端点（locale 切换）")
    r = client.get("/api/auth/security-questions/presets", headers={"X-Locale": "zh-CN"})
    check("presets zh 200", r.status_code == 200, r.text[:200])
    presets = r.json()["data"]["presets"]
    check("seed ≥10 条", len(presets) >= 10, str(len(presets)))
    first = next((p for p in presets if p["key"] == "sq.first_pet"), None)
    check("zh 文本匹配", first is not None and first["question"] == "你第一只宠物的名字？",
          str(first))
    check("结构为对象数组", all(set(p) >= {"key", "question"} for p in presets))

    r = client.get("/api/auth/security-questions/presets", headers={"X-Locale": "en-GB"})
    presets_en = r.json()["data"]["presets"]
    first_en = next((p for p in presets_en if p["key"] == "sq.first_pet"), None)
    check("en 文本匹配", first_en is not None
          and first_en["question"] == "What was the name of your first pet?", str(first_en))

    print("\n[2] 后台 CRUD + 黑名单录入拦截")
    r = client.get("/api/admin/security-questions/presets", headers=admin)
    check("后台列表 200", r.status_code == 200, r.text[:200])
    rows = r.json()["data"]["presets"]
    check("列表含 usage_count", "usage_count" in rows[0])

    r = client.post("/api/admin/security-questions/presets", headers=admin, json={
        "question_zh": "你的学号是多少？",
        "question_en": "What is your favourite colour?",
    })
    check("黑名单：学号 422", r.status_code == 422, r.text[:200])
    r = client.post("/api/admin/security-questions/presets", headers=admin, json={
        "question_zh": "你对纳粹有什么看法？",
        "question_en": "What is your favourite colour?",
    })
    check("黑名单：纳粹 422", r.status_code == 422, r.text[:200])

    r = client.post("/api/admin/security-questions/presets", headers=admin, json={
        "question_zh": "你最喜欢的一门学科是什么？",
        "question_en": "What is your favourite subject?",
        "sort_order": 100,
    })
    check("新增 201", r.status_code in (200, 201), r.text[:200])
    created = r.json()["data"]
    pid = created["id"]
    check("新选题 key 为 None", created["key"] is None)
    check("新选题默认启用", created["enabled"] is True)

    r = client.put(f"/api/admin/security-questions/presets/{pid}", headers=admin, json={
        "question_zh": "你最喜欢的一门课程是什么？", "enabled": False,
    })
    check("编辑+停用 200", r.status_code == 200
          and r.json()["data"]["question_zh"] == "你最喜欢的一门课程是什么？"
          and r.json()["data"]["enabled"] is False, r.text[:200])

    r = client.delete(f"/api/admin/security-questions/presets/{pid}", headers=admin)
    check("未使用题可删除 204", r.status_code == 204, r.text[:200])

    print("\n[3] 已使用题删除保护 + 停用语义")
    r = client.get("/api/admin/security-questions/presets", headers=admin)
    target = next(p for p in r.json()["data"]["presets"] if p["key"] == "sq.favorite_book")

    # 用户以「题库文本快照」形态注册（zh 文本）
    r = register(client, "usebook", three(q3=target["question_zh"]))
    check("题库文本快照注册 201", r.status_code == 201, r.text[:300])

    r = client.delete(f"/api/admin/security-questions/presets/{target['id']}", headers=admin)
    check("已使用题删除 400", r.status_code == 400, r.text[:200])

    r = client.put(f"/api/admin/security-questions/presets/{target['id']}", headers=admin,
                   json={"enabled": False})
    check("停用 200", r.status_code == 200, r.text[:200])
    r = client.get("/api/auth/security-questions/presets", headers={"X-Locale": "zh-CN"})
    check("停用后公开列表消失",
          all(p["key"] != "sq.favorite_book" for p in r.json()["data"]["presets"]))

    r = register(client, "disabled", three(q3="你最喜欢的一本书？"))
    check("停用题文本提交 422", r.status_code == 422, r.text[:300])
    r = register(client, "legacykey", three(q3="sq.favorite_book"))
    check("历史 key 形态仍兼容 201", r.status_code == 201, r.text[:300])

    print("\n[4] 注册自定义问题黑名单")
    reset_limits()
    r = register(client, "badid", [
        {"position": 1, "question": "sq.first_pet", "answer": "旺财", "is_custom": False},
        custom_at(2, "我的身份证号是多少？"),
        {"position": 3, "question": "sq.birth_city", "answer": "广州", "is_custom": False},
    ])
    check("隐私关键词 422", r.status_code == 422, r.text[:300])

    r = register(client, "badphone", [
        {"position": 1, "question": "sq.first_pet", "answer": "旺财", "is_custom": False},
        custom_at(2, "我的手机是13800138000对吗？"),
        {"position": 3, "question": "sq.birth_city", "answer": "广州", "is_custom": False},
    ])
    check("手机号形态 422", r.status_code == 422, r.text[:300])

    r = register(client, "badnazi", [
        {"position": 1, "question": "sq.first_pet", "answer": "旺财", "is_custom": False},
        custom_at(2, "你怎么看待希特勒？"),
        {"position": 3, "question": "sq.birth_city", "answer": "广州", "is_custom": False},
    ])
    check("敏感政治历史 422", r.status_code == 422, r.text[:300])

    r = register(client, "okmixed", [
        {"position": 1, "question": "sq.first_pet", "answer": "旺财", "is_custom": False},
        custom_at(2, "我第一次独自旅行去了哪座城市？", "云南大理古城"),
        {"position": 3, "question": "sq.birth_city", "answer": "广州", "is_custom": False},
    ])
    check("合法自定义+预设混合 201", r.status_code == 201, r.text[:300])

print(f"\n结果：{PASS} PASS / {FAIL} FAIL")
sys.exit(1 if FAIL else 0)
