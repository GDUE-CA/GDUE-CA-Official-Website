"""登录陌生设备邮箱二次验证（2FA）回归测试。

覆盖：
- 首次登录发码，resend_after = 完整冷却（前端据此开始倒计时）
- 冷却内再次登录沿用旧码（不重复发信），resend_after 为剩余冷却
- 冷却过后再次登录发新码，旧码失效、新码可用（修复：旧码未过期时重新登录不发信）
- 重发：冷却内返回剩余秒数；冷却后发送成功返回完整冷却
- 投递失败：登录按失败处理，且不进入冷却
"""
import asyncio
import re
import time

import pytest
from sqlalchemy import select

from app.api import auth
from app.core.config import get_settings
from app.core.kv import get_kv
from app.core.security import Role, hash_password
from app.db.models import User
from tests.conftest import csrf, make_client
from tests.test_db_trace import _with_session

pytestmark = pytest.mark.login2fa

USERNAME = "login2fa_member"
PASSWORD = "L0gin#2fa-Member26"
EMAIL = "login2fa@catyuki.com"


@pytest.fixture
def mails(monkeypatch):
    """截获验证码邮件：记录 (收件人, 验证码)。"""
    sent: list[tuple[str, str]] = []

    async def fake_send(to_addr, subject, body):
        sent.append((to_addr, re.search(r"\b(\d{6})\b", body).group(1)))
        return True

    monkeypatch.setattr(auth, "send_email", fake_send)
    return sent


@pytest.fixture
def client(app):
    async def seed(maker):
        async with maker() as s:
            if not (await s.execute(select(User).where(User.username == USERNAME))).scalar_one_or_none():
                s.add(User(username=USERNAME, email=EMAIL, password_hash=hash_password(PASSWORD),
                           role=Role.MEMBER, must_change_password=False, must_set_security_questions=False,
                           student_id="00000098", real_name="二次验证", phone="+8600000000098"))
                await s.commit()
    _with_session(seed)
    return make_client(app)


def _login(client):
    r = client.post("/api/auth/login", headers=csrf(client),
                    json={"username": USERNAME, "password": PASSWORD})
    return r


def _uid() -> str:
    async def q(maker):
        async with maker() as s:
            return (await s.execute(select(User.id).where(User.username == USERNAME))).scalar_one()
    return str(_with_session(q))


def _expire_cooldown():
    """把发送时刻回拨到冷却之前，模拟冷却已过（旧码仍在有效期内）。"""
    past = int(time.time()) - get_settings().EMAIL_CODE_RESEND_INTERVAL_SECONDS - 1
    asyncio.run(get_kv().set(f"login2fa:sent:{_uid()}", str(past), 600))


def test_first_login_sends_code_and_full_cooldown(client, mails):
    r = _login(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["requires_2fa"] is True and body["code_sent"] is True
    assert body["resend_after"] == get_settings().EMAIL_CODE_RESEND_INTERVAL_SECONDS
    assert [m[0] for m in mails] == [EMAIL]


def test_relogin_within_cooldown_reuses_code(client, mails):
    _login(client)
    r = _login(client)
    body = r.json()
    assert body["requires_2fa"] is True and body["code_sent"] is False
    assert 0 < body["resend_after"] <= get_settings().EMAIL_CODE_RESEND_INTERVAL_SECONDS
    assert len(mails) == 1


def test_relogin_after_cooldown_sends_new_code(client, mails):
    _login(client)
    _expire_cooldown()
    body = _login(client).json()
    assert body["code_sent"] is True
    assert len(mails) == 2
    old_code, new_code = mails[0][1], mails[1][1]
    if old_code != new_code:
        r = client.post("/api/auth/login/2fa/verify", headers=csrf(client),
                        json={"username": USERNAME, "code": old_code})
        assert r.status_code != 200, "旧码应已失效"
    r = client.post("/api/auth/login/2fa/verify", headers=csrf(client),
                    json={"username": USERNAME, "code": new_code})
    assert r.status_code == 200, r.text


def test_resend_reports_backend_cooldown(client, mails):
    _login(client)
    r = client.post("/api/auth/login/2fa/resend", headers=csrf(client), json={"username": USERNAME})
    body = r.json()
    assert body["ok"] is False and body["resend_after"] > 0
    assert len(mails) == 1

    _expire_cooldown()
    body = client.post("/api/auth/login/2fa/resend", headers=csrf(client), json={"username": USERNAME}).json()
    assert body["ok"] is True
    assert body["resend_after"] == get_settings().EMAIL_CODE_RESEND_INTERVAL_SECONDS
    assert len(mails) == 2


def test_send_failure_blocks_login_without_cooldown(client, monkeypatch):
    async def fail_send(*args):
        return False

    monkeypatch.setattr(auth, "send_email", fail_send)
    r = _login(client)
    assert r.status_code == 401
    assert asyncio.run(get_kv().get(f"login2fa:sent:{_uid()}")) is None
