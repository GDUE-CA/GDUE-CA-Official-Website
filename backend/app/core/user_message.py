"""站内私信推送辅助（通用底层，不含任何业务硬编码）。

业务模块在自身事务内调用 push_user_message 写入私信行；
本模块只负责建行，不 commit —— 提交时机由调用方控制（同事务原子性）。
"""
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import UserMessage


async def push_user_message(
    db: AsyncSession,
    user_id: int,
    *,
    title: str,
    content: str,
    link: str | None = None,
    kind: str = "general",
) -> UserMessage:
    """向指定用户写入一条站内私信（flush 不 commit，随调用方事务提交）。"""
    msg = UserMessage(
        user_id=user_id,
        kind=kind,
        title=title,
        content=content,
        link=link,
    )
    db.add(msg)
    await db.flush()
    return msg
