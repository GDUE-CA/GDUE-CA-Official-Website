"""SMTP 邮件发送（底层基础设施，与任何上层业务无关）。

- SMTP_HOST 未配置 → is_configured()=False，调用方自行降级（如忘记密码验证码
  在开发环境仅记录到服务端日志，绝不通过 API 响应回传）；
- 标准库 smtplib 实现，无新增依赖；阻塞 IO 放入线程池，不阻塞事件循环；
- 发送失败只记日志并返回 False，绝不向调用方抛出 SMTP 凭据等内部信息。

禁止在本模块写入任何社团业务文案/逻辑；邮件模板由调用方提供。
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import get_settings

logger = logging.getLogger("gdueca.mailer")


def is_configured() -> bool:
    """SMTP 是否已配置（SMTP_HOST 非空）。"""
    return bool(get_settings().SMTP_HOST.strip())


def _send_sync(to_addr: str, subject: str, body: str) -> None:
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


async def send_email(to_addr: str, subject: str, body: str) -> bool:
    """发送纯文本邮件；成功 True，失败/未配置 False（失败原因仅写日志）。"""
    if not is_configured():
        logger.warning("SMTP 未配置，邮件未发送（收件人=%s 主题=%s）", to_addr, subject)
        return False
    try:
        await asyncio.to_thread(_send_sync, to_addr, subject, body)
        return True
    except Exception:  # noqa: BLE001 —— 不向调用方泄露 SMTP 内部错误
        logger.exception("邮件发送失败（收件人=%s 主题=%s）", to_addr, subject)
        return False
