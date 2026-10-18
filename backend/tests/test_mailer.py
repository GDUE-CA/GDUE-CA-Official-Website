"""邮件通道（app.core.mailer）：Graph 客户端凭据流 + sendMail、令牌缓存与 401 重试、失败降级。"""
import asyncio
import json

import httpx
import pytest

from app.core import mailer
from app.core.config import get_settings

SENDER = "noreply@example.com"


@pytest.fixture
def graph(monkeypatch):
    s = get_settings()
    for k, v in {
        "MAIL_PROVIDER": "graph", "GRAPH_TENANT_ID": "tenant-1", "GRAPH_CLIENT_ID": "client-1",
        "GRAPH_CLIENT_SECRET": "secret-1", "GRAPH_SENDER": SENDER, "SMTP_FROM_NAME": "GDUE-CA",
    }.items():
        monkeypatch.setattr(s, k, v)
    monkeypatch.setattr(mailer, "_graph_token", None)
    calls: list[httpx.Request] = []
    state = {"send_status": [202], "token_status": 200}

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        if req.url.host == "login.microsoftonline.com":
            if state["token_status"] != 200:
                return httpx.Response(state["token_status"], json={"error": "invalid_client"})
            n = sum(1 for c in calls if c.url.host == "login.microsoftonline.com")
            return httpx.Response(200, json={"access_token": f"tok-{n}", "expires_in": 3600})
        status = state["send_status"].pop(0) if len(state["send_status"]) > 1 else state["send_status"][0]
        if status == 202:
            return httpx.Response(202)
        return httpx.Response(status, json={"error": {"code": "ErrorAccessDenied", "message": "x"}})

    monkeypatch.setattr(
        mailer, "_graph_client",
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    return calls, state


def _sends(calls):
    return [c for c in calls if c.url.host == "graph.microsoft.com"]


def test_graph_configured_requires_all_fields(graph, monkeypatch):
    assert mailer.is_configured()
    monkeypatch.setattr(get_settings(), "GRAPH_CLIENT_SECRET", "")
    assert not mailer.is_configured()


def test_graph_send_success_payload(graph):
    calls, _ = graph
    assert asyncio.run(mailer.send_email("user@qq.com", "验证码", "123456")) is True

    token_req = calls[0]
    assert token_req.url.path == "/tenant-1/oauth2/v2.0/token"
    form = dict(x.split("=", 1) for x in token_req.content.decode().split("&"))
    assert form["grant_type"] == "client_credentials" and form["client_id"] == "client-1"

    send = _sends(calls)[0]
    assert send.url.path == f"/v1.0/users/{SENDER}/sendMail"
    assert send.headers["Authorization"] == "Bearer tok-1"
    body = json.loads(send.content)
    assert body["saveToSentItems"] is False
    assert body["message"]["toRecipients"] == [{"emailAddress": {"address": "user@qq.com"}}]
    assert body["message"]["body"] == {"contentType": "Text", "content": "123456"}


def test_graph_token_is_cached(graph):
    calls, _ = graph
    asyncio.run(mailer.send_email("a@qq.com", "s", "b"))
    asyncio.run(mailer.send_email("b@qq.com", "s", "b"))
    assert sum(1 for c in calls if c.url.host == "login.microsoftonline.com") == 1
    assert len(_sends(calls)) == 2


def test_graph_401_refreshes_token_once(graph):
    calls, state = graph
    state["send_status"] = [401, 202]
    assert asyncio.run(mailer.send_email("a@qq.com", "s", "b")) is True
    assert [c.headers["Authorization"] for c in _sends(calls)] == ["Bearer tok-1", "Bearer tok-2"]


def test_graph_send_failure_returns_false_without_secret(graph, caplog):
    _, state = graph
    state["send_status"] = [403]
    assert asyncio.run(mailer.send_email("a@qq.com", "s", "b")) is False
    assert "ErrorAccessDenied" in caplog.text
    assert "secret-1" not in caplog.text and "tok-1" not in caplog.text


def test_graph_token_failure_returns_false(graph, caplog):
    calls, state = graph
    state["token_status"] = 401
    assert asyncio.run(mailer.send_email("a@qq.com", "s", "b")) is False
    assert "invalid_client" in caplog.text
    assert not _sends(calls)


def test_send_timeout_returns_false(graph, monkeypatch):
    async def slow(*a, **k):
        await asyncio.sleep(5)

    monkeypatch.setattr(mailer, "_SEND_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setattr(mailer, "_send_graph", slow)
    assert asyncio.run(mailer.send_email("a@qq.com", "s", "b")) is False


def test_smtp_default_unconfigured(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "MAIL_PROVIDER", "smtp")
    monkeypatch.setattr(s, "SMTP_HOST", "")
    assert not mailer.is_configured()
    assert asyncio.run(mailer.send_email("a@qq.com", "s", "b")) is False
