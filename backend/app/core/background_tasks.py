"""后台异步任务通用框架（底层基础设施，与具体业务无关）。

- 任务记录持久化在 background_tasks 表（禁止仅内存：进程重启记录不丢）；
- 任务协程注册到 ACTIVE_TASKS，应用关闭时统一取消并等待收尾，
  避免持有数据库连接的协程在 engine.dispose() 之后回调已销毁的事件循环；
- 启动时 recover_interrupted() 把上次进程遗留的 pending/running 记录
  标记为 failed（中断），避免通知中心出现永远「进行中」的僵尸任务。

新增一类后台任务只需：
  1) 在 BackgroundTaskCategory 加枚举值；
  2) 业务模块内写 `async def run_xxx(task_id)`，内部用 update_task() 报进度；
  3) API 提交端点 create_task() 落库后 launch(run_xxx(task_id))。
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Coroutine

from sqlalchemy import select

from app.db.models import (
    BackgroundTask,
    BackgroundTaskCategory,
    BackgroundTaskStatus,
)
from app.db.session import async_session

logger = logging.getLogger("gdueca")

# 正在执行的任务协程（仅运行期引用；任务状态真值永远在数据库）
ACTIVE_TASKS: set[asyncio.Task] = set()


def _now_naive() -> datetime:
    """DB 列存 naive UTC，统一去 tzinfo（项目既有时间约定）。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def create_task(
    title: str,
    category: BackgroundTaskCategory,
    created_by_user_id: int | None,
) -> BackgroundTask:
    """立刻落库一条 pending / progress=0 的任务记录并返回（提交接口随即返回 task_id）。"""
    task = BackgroundTask(
        id=str(uuid.uuid4()),
        title=title,
        category=category,
        status=BackgroundTaskStatus.PENDING,
        progress=0,
        message="",
        created_by_user_id=created_by_user_id,
    )
    async with async_session() as s:
        s.add(task)
        await s.commit()
    return task


async def update_task(
    task_id: str,
    *,
    status: BackgroundTaskStatus | None = None,
    progress: int | None = None,
    message: str | None = None,
    result_payload: dict[str, Any] | None = None,
    finished: bool = False,
) -> None:
    """更新任务状态/进度/消息（任务行即通知数据源，写库即对通知中心可见）。"""
    async with async_session() as s:
        row = await s.get(BackgroundTask, task_id)
        if not row:
            logger.warning("后台任务 %s 更新时记录不存在", task_id)
            return
        if status is not None:
            row.status = status
        if progress is not None:
            row.progress = max(0, min(100, progress))
        if message is not None:
            row.message = message[:512]
        if result_payload is not None:
            row.result_payload = result_payload
        if finished:
            row.finished_at = _now_naive()
        await s.commit()


def launch(coro: Coroutine[Any, Any, None]) -> asyncio.Task:
    """把任务协程投入事件循环后台执行；异常兜底写 failed，绝不让协程静默死亡。"""
    async def _guarded() -> None:
        try:
            await coro
        except asyncio.CancelledError:
            # 应用关闭被取消：记录保持 running，由下次启动的 recover_interrupted 收尾
            raise
        except Exception:
            logger.exception("后台任务协程未捕获异常")

    t = asyncio.create_task(_guarded())
    ACTIVE_TASKS.add(t)
    t.add_done_callback(ACTIVE_TASKS.discard)
    return t


async def recover_interrupted() -> None:
    """启动时把残留 pending/running 记录标记为 failed（进程重启导致中断）。"""
    async with async_session() as s:
        rows = (await s.execute(
            select(BackgroundTask).where(
                BackgroundTask.status.in_([
                    BackgroundTaskStatus.PENDING,
                    BackgroundTaskStatus.RUNNING,
                ])
            )
        )).scalars().all()
        for row in rows:
            row.status = BackgroundTaskStatus.FAILED
            row.message = "服务重启，任务中断"
            row.result_payload = {"error": "服务重启，任务中断"}
            row.finished_at = _now_naive()
        if rows:
            await s.commit()
            logger.info("已将 %d 条中断的后台任务标记为失败", len(rows))


async def shutdown() -> None:
    """应用关闭：取消全部在途任务协程并等待收尾（必须先于 engine.dispose()）。"""
    if not ACTIVE_TASKS:
        return
    for t in list(ACTIVE_TASKS):
        t.cancel()
    await asyncio.gather(*ACTIVE_TASKS, return_exceptions=True)
