"""V0.5.8 忘记密码·人工审核找回账号端到端验证（隔离临时库，严禁触碰 dev 库）。

运行：cd backend && python scripts/verify_p5_manual_review.py
覆盖：
- identify：用户名/邮箱定位、脱敏邮箱、has_security_questions、未知账号 exists=false；
- manual-review 提交：双表单必填校验 422、身份证格式 422、账号匹配、
  旧密码仅存布尔比对结果、身份证加密入库（库中无明文）；
- 后台列表：身份证脱敏输出、matched_username 回填；
- approve：send_recovery_code 邮件发码→恢复码通道重置密码全链路；bind_contact_email 换绑；
  未匹配账号 400；重复处理 409；
- reject：理由必填、邮件通知、状态终态；审计落库。
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

WORK = Path(tempfile.mkdtemp(prefix="gdueca-p5-verify-"))
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
ID_CARD = "110101199003077758"


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
import app.api.recovery_review as review_api  # noqa: E402

_CODE_MAILS: dict[str, str] = {}
_REVIEW_MAILS: list[tuple[str, str, str]] = []


async def _capture_code_mail(to_addr: str, subject: str, body: str) -> bool:
    m = re.search(r"验证码：(\d{6})", body)
    if m:
        _CODE_MAILS[to_addr.strip()] = m.group(1)
    return True


async def _capture_review_mail(to_addr: str, subject: str, body: str) -> bool:
    _REVIEW_MAILS.append((to_addr.strip(), subject, body))
    return True


auth_api.send_email = _capture_code_mail
review_api.send_email = _capture_review_mail


def csrf_h(client: TestClient) -> dict:
    return {"X-CSRF-Token": client.get("/api/auth/csrf").json()["csrf_token"]}


def reset_limits() -> None:
    from app.core import middleware, rate_limit
    from app.core.kv import reset_kv
    rate_limit.reset()
    middleware._rate_buckets.clear()
    reset_kv()


def login(client: TestClient, account: str, password: str, key="username") -> dict:
    r = client.post("/api/auth/login", headers=csrf_h(client),
                    json={key: account, "password": password})
    assert r.status_code == 200, f"登录失败 {account}：{r.status_code} {r.text[:200]}"
    return {"X-CSRF-Token": r.json()["csrf_token"]}


def register_member(client: TestClient, tag: str) -> None:
    reset_limits()
    email = f"p5{tag}@club.local"
    r = client.post("/api/auth/register/send-code", headers=csrf_h(client),
                    json={"email": email})
    assert r.status_code == 200, r.text[:200]
    r = client.post("/api/auth/register", headers=csrf_h(client), json={
        "username": f"p5{tag}", "display_name": f"审核测试{tag}",
        "password": MEMBER_PWD, "confirm_password": MEMBER_PWD,
        "email": email, "code": _CODE_MAILS[email],
        "security_questions": [
            {"position": 1, "question": "sq.first_pet", "answer": "旺财", "is_custom": False},
            {"position": 2, "question": "sq.birth_city", "answer": "广州", "is_custom": False},
            {"position": 3, "question": "sq.first_school", "answer": "实验小学", "is_custom": False},
        ],
    })
    assert r.status_code == 201, r.text[:300]


def submit_review(client: TestClient, **kw):
    base = {"kind": "school", "contact_email": "applicant@example.com",
            "real_name": "张三", "student_id": "20240101"}
    base.update(kw)
    reset_limits()
    return client.post("/api/auth/forgot-password/manual-review",
                       headers=csrf_h(client), json=base)


with TestClient(app) as client:
    register_member(client, "alice")
    admin = login(client, "root", ADMIN_PWD)

    print("\n[1] identify 账号识别")
    r = client.post("/api/auth/forgot-password/identify", headers=csrf_h(client),
                    json={"account": "p5alice"})
    data = r.json()["data"] if "data" in r.json() else r.json()
    check("用户名定位 exists", r.status_code == 200 and data["exists"] is True, r.text[:200])
    check("脱敏邮箱格式", data["email_masked"] == "p5***@club.local", str(data))
    check("has_security_questions", data["has_security_questions"] is True)
    r = client.post("/api/auth/forgot-password/identify", headers=csrf_h(client),
                    json={"account": "p5alice@club.local"})
    data = r.json().get("data", r.json())
    check("邮箱定位 exists", data["exists"] is True, r.text[:200])
    r = client.post("/api/auth/forgot-password/identify", headers=csrf_h(client),
                    json={"account": "no_such_user"})
    data = r.json().get("data", r.json())
    check("未知账号 exists=false 且不回显邮箱",
          data["exists"] is False and data["email_masked"] is None, str(data))

    print("\n[2] manual-review 提交校验")
    r = submit_review(client, student_id=None)
    check("校内缺学号 422", r.status_code == 422, r.text[:300])
    r = submit_review(client, kind="external", student_id=None, id_card=None)
    check("社会缺身份证 422", r.status_code == 422, r.text[:300])
    r = submit_review(client, kind="external", student_id=None, id_card="12345")
    check("身份证格式错误 422", r.status_code == 422, r.text[:300])

    r = submit_review(client, account_hint="p5alice", old_password=MEMBER_PWD)
    check("校内工单提交 200", r.status_code == 200, r.text[:300])
    tid_school = r.json()["request_id"]
    r = submit_review(client, account_hint="p5alice", old_password="wrong-pass-123")
    tid_wrong_pwd = r.json()["request_id"]
    r = submit_review(client, kind="external", student_id=None, id_card=ID_CARD,
                      account_hint="p5alice")
    check("社会工单提交 200", r.status_code == 200, r.text[:300])
    tid_ext = r.json()["request_id"]
    r = submit_review(client)  # 分支3：无 account_hint
    check("无提示工单提交 200（分支3）", r.status_code == 200, r.text[:300])
    tid_nomatch = r.json()["request_id"]

    print("\n[3] 落库检查：加密/布尔/匹配")
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from app.core.config import get_settings
    from app.core.crypto import decrypt_secret
    from app.db.models import PasswordResetRequest

    async def _rows():
        eng = create_async_engine(get_settings().DATABASE_URL,
                                  connect_args={"check_same_thread": False})
        try:
            maker = async_sessionmaker(eng)
            async with maker() as s:
                rows = (await s.execute(select(PasswordResetRequest))).scalars().all()
                return {r0.id: (r0.kind, r0.matched_user_id, r0.old_password_matched,
                                r0.id_card_enc) for r0 in rows}
        finally:
            await eng.dispose()

    rows = asyncio.run(_rows())
    check("校内工单已匹配账号", rows[tid_school][1] is not None, str(rows.get(tid_school)))
    check("旧密码正确→True", rows[tid_school][2] is True)
    check("旧密码错误→False", rows[tid_wrong_pwd][2] is False)
    enc = rows[tid_ext][3]
    check("身份证库中无明文", enc is not None and ID_CARD not in enc, str(enc)[:60])
    check("身份证可解密", decrypt_secret(enc) == ID_CARD)
    check("无提示工单未匹配", rows[tid_nomatch][1] is None)

    print("\n[4] 后台列表（脱敏）")
    r = client.get("/api/auth/password-recovery-reviews", headers=admin)
    check("列表 200", r.status_code == 200, r.text[:200])
    items = {x["id"]: x for x in r.json()}
    ext = items[tid_ext]
    check("身份证脱敏展示", ext["id_card_masked"] == "1101**********7758",
          ext["id_card_masked"])
    check("响应不含明文身份证", ID_CARD not in r.text)
    check("matched_username 回填", ext["matched_username"] == "p5alice")
    check("kind 透传", ext["kind"] == "external" and items[tid_school]["kind"] == "school")

    print("\n[5] approve：send_recovery_code 全链路")
    _REVIEW_MAILS.clear()
    r = client.post(f"/api/auth/password-recovery-reviews/{tid_school}/approve",
                    headers=admin, json={"action": "send_recovery_code"})
    check("approve 200", r.status_code == 200, r.text[:300])
    check("通知邮件已捕获", len(_REVIEW_MAILS) == 1
          and _REVIEW_MAILS[0][0] == "applicant@example.com")
    m = re.search(r"恢复码：([A-Z2-9]{5}(?:-[A-Z2-9]{5}){3})", _REVIEW_MAILS[0][2])
    check("邮件含一次性恢复码", m is not None, _REVIEW_MAILS[0][2][:120])
    rcode = m.group(1)
    reset_limits()
    r = client.post("/api/auth/forgot-password/recovery-reset", headers=csrf_h(client), json={
        "account": "p5alice", "recovery_code": rcode,
        "new_password": NEW_PWD, "confirm_password": NEW_PWD,
    })
    check("恢复码通道重置 200", r.status_code == 200, r.text[:300])
    login(client, "p5alice", NEW_PWD)
    check("新密码可登录", True)
    admin = login(client, "root", ADMIN_PWD)  # 登录轮换 CSRF，刷新管理端令牌
    r = client.post(f"/api/auth/password-recovery-reviews/{tid_school}/approve",
                    headers=admin, json={"action": "send_recovery_code"})
    check("重复处理 409", r.status_code == 409, r.text[:200])

    print("\n[6] approve：bind_contact_email + 未匹配 400")
    r = client.post(f"/api/auth/password-recovery-reviews/{tid_nomatch}/approve",
                    headers=admin, json={"action": "send_recovery_code"})
    check("未匹配账号 approve 400", r.status_code == 400, r.text[:200])
    r = client.post(f"/api/auth/password-recovery-reviews/{tid_ext}/approve",
                    headers=admin, json={"action": "bind_contact_email"})
    check("换绑联系邮箱 200", r.status_code == 200, r.text[:300])
    r = client.post("/api/auth/login", headers=csrf_h(client),
                    json={"email": "applicant@example.com", "password": NEW_PWD})
    check("新绑定邮箱可登录", r.status_code == 200, r.text[:200])
    admin = login(client, "root", ADMIN_PWD)  # 登录轮换 CSRF，刷新管理端令牌

    print("\n[7] reject + 审计")
    r = client.post(f"/api/auth/password-recovery-reviews/{tid_wrong_pwd}/reject",
                    headers=admin, json={"reason": "  "})
    check("空理由 400/422", r.status_code in (400, 422), r.text[:200])
    _REVIEW_MAILS.clear()
    r = client.post(f"/api/auth/password-recovery-reviews/{tid_wrong_pwd}/reject",
                    headers=admin, json={"reason": "身份信息核验未通过"})
    check("reject 200", r.status_code == 200, r.text[:300])
    check("驳回邮件含理由", len(_REVIEW_MAILS) == 1
          and "身份信息核验未通过" in _REVIEW_MAILS[0][2])

    from app.db.models import AuditLog

    async def _actions() -> set[str]:
        eng = create_async_engine(get_settings().DATABASE_URL,
                                  connect_args={"check_same_thread": False})
        try:
            maker = async_sessionmaker(eng)
            async with maker() as s:
                return set((await s.execute(select(AuditLog.action))).scalars().all())
        finally:
            await eng.dispose()

    actions = asyncio.run(_actions())
    check("审计 submit/approve/reject 齐",
          {"recovery_review.submit", "recovery_review.approve",
           "recovery_review.reject"} <= actions,
          str(sorted(a for a in actions if a.startswith("recovery_review"))))

print(f"\n========== 结果：{PASS} PASS / {FAIL} FAIL ==========")
sys.exit(1 if FAIL else 0)
