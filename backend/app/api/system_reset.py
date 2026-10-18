"""系统重置接口（V0.5.7，管理端最高危操作）。

POST /api/admin/system/reset：提交系统重置异步任务。
- 权限：require_permission("system_reset", "manage")——仅 super_admin；
  Break-Glass 应急账号经 require_permission 自动旁路（绕过前端直连同样鉴权）；
- 三重确认的最后一道在后端：请求体必须逐字携带 confirm_text="I confirm system reset"；
- 同一时刻只允许一个未终态的重置任务（pending/running），否则 409；
- 执行体见 app/core/system_reset.py：强制备份失败即中止、全表清空、审计豁免、
  会话全失效、进度与结果写入 background_tasks（通知中心同源可见）。
"""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import BREAK_GLASS_ACTOR, ctx_uid, is_break_glass, log_action
from app.core.background_tasks import create_task, launch
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.responses import BizException, ok
from app.core.bizcode import BizCode
from app.core.system_reset import run_system_reset
from app.db.models import BackgroundTask, BackgroundTaskCategory, BackgroundTaskStatus, User
from app.db.session import get_db

router = APIRouter(prefix="/api/admin/system", tags=["system-reset"])

# 固定英文确认文案（前端输入框 placeholder 与后端校验共用此常量，禁止修改文案）
CONFIRM_TEXT = "I confirm system reset"


class SystemResetRequest(BaseModel):
    confirm_text: str = Field(min_length=1, max_length=128)


@router.post("/reset")
async def submit_system_reset(
    body: SystemResetRequest,
    request: Request,
    user: dict = Depends(require_permission("system_reset", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """提交系统重置：立刻返回 task_id，后台按 备份→清空→清理→下线 顺序执行。"""
    # 第二道确认（第一道在前端 UI）：文本必须逐字匹配
    if body.confirm_text != CONFIRM_TEXT:
        raise BizException(
            BizCode.BAD_REQUEST,
            params={"detail": f"确认文本不匹配，必须逐字输入 {CONFIRM_TEXT}"},
        )

    # 同一时刻禁止并发重置
    active = (await db.execute(
        select(BackgroundTask).where(
            BackgroundTask.category == BackgroundTaskCategory.SYSTEM_RESET,
            BackgroundTask.status.in_([
                BackgroundTaskStatus.PENDING,
                BackgroundTaskStatus.RUNNING,
            ]),
        )
    )).scalars().first()
    if active:
        raise BizException(
            BizCode.CONFLICT,
            params={"detail": "已有进行中的系统重置任务，请等待其结束"},
        )

    # 操作者身份快照（BG 无 users 行；普通超管记录 uid+username，供豁免审计行追溯）
    uid = ctx_uid(user)
    if is_break_glass(user):
        actor = BREAK_GLASS_ACTOR
    else:
        op = await db.get(User, uid) if uid is not None else None
        actor = f"reset:{uid}:{op.username}" if op else f"reset:{uid or '?'}"
    ip = get_client_ip(request)

    # 认证/会话中间件可能已在请求会话留下未提交 DML（如 last_active_at 续期）。
    # SQLite 下 create_task 的独立连接会与其争用写锁（database is locked），
    # 先把请求事务落盘释放锁，再创建任务行。
    await db.commit()

    task = await create_task(
        title="系统重置",
        category=BackgroundTaskCategory.SYSTEM_RESET,
        created_by_user_id=uid,
    )
    # 提交动作留痕（该记录会被随后的重置清空，仅保留执行成功那一条豁免行）
    log_action(
        db, user, "system.reset.submit",
        detail=f"task_id={task.id} confirm_text_verified=1",
        ip=ip,
    )
    await db.commit()

    # launch 必须在请求事务提交之后：重置任务会立即备份/清库，
    # 不能与尚未落盘的请求事务争锁
    launch(run_system_reset(task.id, actor=actor, ip=ip))
    return ok({"task_id": task.id})
