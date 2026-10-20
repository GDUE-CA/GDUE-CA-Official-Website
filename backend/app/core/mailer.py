"""邮件发送（底层基础设施，与任何上层业务无关）。

发信通道由 MAIL_PROVIDER 选择：
- smtp（默认）：标准库 smtplib，阻塞 IO 放入线程池，不阻塞事件循环；
- graph：Microsoft Graph sendMail（客户端凭据流，HTTPS 443），
  适用于 Exchange Online 停用 SMTP 基本认证、或云主机封禁出站 SMTP 端口的场景。

- 通道未配置 → is_configured()=False，调用方自行降级（如忘记密码验证码
  在开发环境仅记录到服务端日志，绝不通过 API 响应回传）；
- 单次发信有总超时 _SEND_TIMEOUT_SECONDS（smtplib 的 timeout 按每个解析地址分别计时，
  多地址主机连不通时可累计数分钟，必须在外层兜底）；
- 发送失败只记日志并返回 False，绝不向调用方抛出凭据 / 令牌等内部信息。

禁止在本模块写入任何社团业务文案/逻辑；邮件模板由调用方提供。
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
import time
from email.message import EmailMessage
from email.utils import formataddr
from urllib.parse import quote

import httpx

from app.core.config import get_settings

logger = logging.getLogger("gdueca.mailer")

_SEND_TIMEOUT_SECONDS = 20
_HTTP_TIMEOUT_SECONDS = 10

_GRAPH_TOKEN_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
_GRAPH_SEND_URL = "https://graph.microsoft.com/v1.0/users/{sender}/sendMail"
_GRAPH_SCOPE = "https://graph.microsoft.com/.default"
# 令牌提前过期余量，避免临界点请求被拒
_TOKEN_SKEW_SECONDS = 120


class MailError(Exception):
    """发信失败（消息只含状态码 / 错误码，不含凭据）。"""


def _provider() -> str:
    return get_settings().MAIL_PROVIDER.strip().lower() or "smtp"


def current_provider() -> str:
    """当前发信通道名（smtp / graph），供启动告警与后台状态展示使用。"""
    return _provider()


def _graph_sender() -> str:
    s = get_settings()
    return (s.GRAPH_SENDER or s.SMTP_FROM).strip()


def is_configured() -> bool:
    """当前发信通道是否已配置。"""
    s = get_settings()
    if _provider() == "graph":
        return all(v.strip() for v in (
            s.GRAPH_TENANT_ID, s.GRAPH_CLIENT_ID, s.GRAPH_CLIENT_SECRET, _graph_sender(),
        ))
    return bool(s.SMTP_HOST.strip())


# ---------- SMTP ----------

def _send_smtp_sync(to_addr: str, subject: str, body: str) -> None:
    s = get_settings()
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((s.SMTP_FROM_NAME, s.SMTP_FROM or s.SMTP_USERNAME))
    msg["To"] = to_addr
    # 纯文本即可（验证码场景）；HTML 模板后续按需扩展
    msg.set_content(body)
    if s.SMTP_USE_SSL:
        with smtplib.SMTP_SSL(s.SMTP_HOST, s.SMTP_PORT, timeout=15) as smtp:
            if s.SMTP_USERNAME:
                smtp.login(s.SMTP_USERNAME, s.SMTP_PASSWORD)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(s.SMTP_HOST, s.SMTP_PORT, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls()
            if s.SMTP_USERNAME:
                smtp.login(s.SMTP_USERNAME, s.SMTP_PASSWORD)
            smtp.send_message(msg)


# ---------- Microsoft Graph ----------

_graph_token: tuple[str, float] | None = None  # (access_token, 过期时间 monotonic)
_graph_token_lock = asyncio.Lock()


def _graph_client() -> httpx.AsyncClient:
    """独立函数便于测试注入 MockTransport。"""
    return httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS)


def _graph_error_code(resp: httpx.Response) -> str:
    """提取 Graph / Entra 错误码（如 ErrorAccessDenied、invalid_client），不含响应正文其余内容。"""
    try:
        data = resp.json()
    except ValueError:
        return "-"
    if not isinstance(data, dict):
        return "-"
    err = data.get("error")
    if isinstance(err, dict):
        return str(err.get("code") or "-")
    return str(err or "-")


async def _graph_access_token(client: httpx.AsyncClient, *, force: bool = False) -> str:
    """客户端凭据流取应用令牌；进程内缓存到过期前 _TOKEN_SKEW_SECONDS。"""
    global _graph_token
    async with _graph_token_lock:
        if not force and _graph_token and _graph_token[1] > time.monotonic():
            return _graph_token[0]
        s = get_settings()
        resp = await client.post(
            _GRAPH_TOKEN_URL.format(tenant=quote(s.GRAPH_TENANT_ID.strip(), safe="")),
            data={
                "grant_type": "client_credentials",
                "client_id": s.GRAPH_CLIENT_ID.strip(),
                "client_secret": s.GRAPH_CLIENT_SECRET,
                "scope": _GRAPH_SCOPE,
            },
        )
        if resp.status_code != 200:
            raise MailError(f"graph token HTTP {resp.status_code} {_graph_error_code(resp)}")
        data = resp.json()
        token = data.get("access_token")
        if not isinstance(token, str) or not token:
            raise MailError("graph token missing access_token")
        ttl = int(data.get("expires_in") or 3600)
        _graph_token = (token, time.monotonic() + max(ttl - _TOKEN_SKEW_SECONDS, 60))
        return token


async def _send_graph(to_addr: str, subject: str, body: str) -> None:
    s = get_settings()
    sender = _graph_sender()
    payload = {
        "message": {
            "subject": subject,
            "body": {"contentType": "Text", "content": body},
            "from": {"emailAddress": {"address": sender, "name": s.SMTP_FROM_NAME}},
            "toRecipients": [{"emailAddress": {"address": to_addr}}],
        },
        # 验证码类邮件不留存到发件箱
        "saveToSentItems": False,
    }
    url = _GRAPH_SEND_URL.format(sender=quote(sender, safe="@"))
    async with _graph_client() as client:
        token = await _graph_access_token(client)
        resp = await client.post(url, json=payload, headers={"Authorization": f"Bearer {token}"})
        if resp.status_code == 401:
            # 令牌被提前吊销 / 权限刚变更：强制刷新后重试一次
            token = await _graph_access_token(client, force=True)
            resp = await client.post(url, json=payload, headers={"Authorization": f"Bearer {token}"})
        if resp.status_code != 202:
            raise MailError(f"graph sendMail HTTP {resp.status_code} {_graph_error_code(resp)}")


# ---------- 对外入口 ----------

async def send_email(to_addr: str, subject: str, body: str) -> bool:
    """发送纯文本邮件；成功 True，失败/未配置 False（失败原因仅写日志）。

    开发环境（ENVIRONMENT=dev）：不调用任何邮件通道，直接返回成功，
    并将邮件正文（含验证码）写入服务端日志，便于本地调试时从日志读取验证码；
    生产环境（prod，默认）：按现有通道真实投递，未配置 / 失败照常返回 False。
    """
    if get_settings().is_dev:
        # 开发环境跳过邮件发送：仅记录日志（不调用 SMTP/Graph、不真正发信）
        logger.warning(
            "开发环境跳过邮件发送（ENVIRONMENT=dev）收件人=%s 主题=%s\n%s",
            to_addr, subject, body,
        )
        return True
    provider = _provider()
    if not is_configured():
        logger.warning("邮件通道未配置（provider=%s），邮件未发送（收件人=%s 主题=%s）",
                       provider, to_addr, subject)
        return False
    try:
        if provider == "graph":
            send = _send_graph(to_addr, subject, body)
        else:
            send = asyncio.to_thread(_send_smtp_sync, to_addr, subject, body)
        await asyncio.wait_for(send, timeout=_SEND_TIMEOUT_SECONDS)
        # 「已提交」≠「已送达」：Graph 202 / SMTP 接收后仍可能延迟、进垃圾箱，排查投递时以此为准
        logger.info("邮件已提交（provider=%s 收件人=%s 主题=%s）", provider, to_addr, subject)
        return True
    except MailError as e:
        logger.error("邮件发送失败（provider=%s 收件人=%s 主题=%s）：%s", provider, to_addr, subject, e)
        return False
    except TimeoutError:
        logger.error("邮件发送超时（provider=%s 收件人=%s 主题=%s，>%ss）",
                     provider, to_addr, subject, _SEND_TIMEOUT_SECONDS)
        return False
    except Exception:  # noqa: BLE001 —— 不向调用方泄露内部错误
        logger.exception("邮件发送失败（provider=%s 收件人=%s 主题=%s）", provider, to_addr, subject)
        return False
