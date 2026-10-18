"""后台异步任务查询 / 关闭接口（新响应壳）。

权限模型：
- /api/admin/* 全局中间件已强制「登录 + 管理员级角色」；本模块再用
  require_role(Role.EDITOR) 显式声明同一门槛（两层防御）；
- 规范要求「每个用户只能查看自己创建的后台任务；管理员可浏览全部」：
  非管理员级账号（member）在全局门即被 403，无法到达本模块，
  因此到达者均具备浏览全部任务的资格；created_by_user_id 仍随任务返回，
  便于前端/审计溯源。

通知行为：任务行即通知数据源（数据同源），dismiss = 用户手动关闭通知；
未关闭的任务永不自动消失，刷新后仍可见。
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.responses import BizException, ok
from app.core.bizcode import BizCode
from app.core.security import Role, require_role
from app.db.models import BackgroundTask
from app.db.session import get_db
from app.schemas.background_task import BackgroundTaskListOut, BackgroundTaskOut

router = APIRouter(prefix="/api/admin", tags=["background-tasks"])


@router.get("/background-tasks")
async def list_background_tasks(
    include_dismissed: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(require_role(Role.EDITOR)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """后台任务列表（新的在前）；默认仅返回用户尚未手动关闭的任务。"""
    stmt = select(BackgroundTask)
    if not include_dismissed:
        stmt = stmt.where(BackgroundTask.dismissed_at.is_(None))
    rows = (await db.execute(
        stmt.order_by(BackgroundTask.created_at.desc()).limit(limit)
    )).scalars().all()
    return ok(BackgroundTaskListOut(
        items=[BackgroundTaskOut.model_validate(r) for r in rows]
    ).model_dump(mode="json"))


@router.get("/background-task/{task_id}")
async def get_background_task(
    task_id: str,
    user: dict = Depends(require_role(Role.EDITOR)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """单任务完整信息（前端 800ms 轮询；进入终态后前端停止轮询）。"""
    row = await db.get(BackgroundTask, task_id)
    if not row:
        raise BizException(BizCode.NOT_FOUND, params={"detail": "任务不存在"})
    return ok(BackgroundTaskOut.model_validate(row).model_dump(mode="json"))


@router.post("/background-task/{task_id}/dismiss")
async def dismiss_background_task(
    task_id: str,
    user: dict = Depends(require_role(Role.EDITOR)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """用户手动关闭任务通知（幂等）；关闭后从通知中心/悬浮弹窗消失，记录仍保留。"""
    from datetime import datetime, timezone

    row = await db.get(BackgroundTask, task_id)
    if not row:
        raise BizException(BizCode.NOT_FOUND, params={"detail": "任务不存在"})
    if row.dismissed_at is None:
        row.dismissed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    return ok({"dismissed": True})
