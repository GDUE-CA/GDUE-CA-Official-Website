"""数据库维护接口（管理端）。

POST /api/admin/db/export：数据库全量导出 —— 后台异步任务。
  提交即落库一条 background_task（pending / progress=0）并立刻返回 task_id，
  转储在服务器后台执行，不阻塞 HTTP 请求；进度/结果通过任务查询接口与
  通知中心获取（任务行即通知数据源）。导出操作写审计日志（独立于任务记录）。

导入维持现状：同步 + superadmin 专属 + 双重确认（高危、低频，后续如需异步
复用 background_task 框架即可）。
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.background_tasks import create_task, launch
from app.core.db_export import run_db_export
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.responses import ok
from app.db.models import BackgroundTaskCategory
from app.db.session import get_db
from app.schemas.background_task import BackgroundTaskSubmitOut

router = APIRouter(prefix="/api/admin/db", tags=["db-maintenance"])


@router.post("/export")
async def submit_db_export(
    request: Request,
    user: dict = Depends(require_permission("settings", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """提交一次完整数据库导出：立刻返回 task_id，后台异步执行。"""
    task = await create_task(
        title="数据库全量导出",
        category=BackgroundTaskCategory.DB_EXPORT,
        created_by_user_id=ctx_uid(user),
    )
    # 审计独立记录（background_task 只是展示层，不能替代审计）
    log_action(db, user, "system.db.export", detail=f"task_id={task.id}",
               ip=get_client_ip(request))
    launch(run_db_export(task.id))
    return ok(BackgroundTaskSubmitOut(task_id=task.id).model_dump(mode="json"))
