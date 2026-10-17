"""系统重置执行器（V0.5.7，后台异步任务 system_reset 的业务体）。

硬性顺序（不可调换）：
1. 强制全库备份——直接复用 db_export.perform_full_export()，禁止另写导出代码；
   备份失败（异常/文件缺失/空文件）任务 FAILED 并立即终止，绝不触碰任何数据；
2. 单事务清空全部表行（按外键依赖逆序 DELETE，禁止 DROP DATABASE/TABLE）：
   - background_tasks 仅保留当前重置任务行（进度/通知数据源，行在通知在）；
   - audit_logs 清空后插入本次重置豁免行（user_id=NULL 规避 users 已清空的 FK，
     操作者身份写入 actor；IP/UTC 时间/备份文件名齐全）；
   - 重建 SystemSetting(id=1) 默认行，system_initialized=False → 回到首次部署向导态；
3. DB 提交后清理 uploads/ 磁盘文件（best-effort；exports/ 备份目录永不清理）；
4. 删除 KV 中全部 Break-Glass 会话（bg:session:*）；普通用户令牌因 users 行被清
   而在认证层自动失效（含无 jti 旧令牌）。

设计约束：错误信息脱敏；事务阶段异常整体回滚；仅文件清理失败不推翻重置结论
（数据库已不可回滚），改为结果告警计数。
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete

from app.core.background_tasks import update_task
from app.core.db_export import perform_full_export
from app.core.kv import get_kv
from app.db.models import (
    AuditLog,
    BackgroundTask,
    BackgroundTaskStatus,
    Base,
    SystemSetting,
)
from app.db.session import async_session
from app.core.security import BG_SESSION_PREFIX

logger = logging.getLogger("gdueca")

UPLOADS_DIR = Path("uploads")
# 启动时 main.py 保底创建的目录（清理文件后重建，保证静态挂载路径持续可用）
UPLOAD_KEEP_DIRS = ("avatars", "banners", "members", "blog", "memos")


async def _wipe_database(task_id: str, backup: dict, actor: str, ip: str | None) -> None:
    """单事务清空全部表行 + 写入豁免审计行 + 重建默认系统设置行。"""
    # sorted_tables 按依赖正序（父先子后），删除用逆序（子先父后），PG FK 下安全
    tables = list(reversed(Base.metadata.sorted_tables))
    async with async_session() as s:
        conn = await s.connection()
        for table in tables:
            if table.name == BackgroundTask.__tablename__:
                # 仅保留当前重置任务行（其余任务记录随重置清空）
                await conn.execute(
                    delete(BackgroundTask).where(BackgroundTask.id != task_id)
                )
                continue
            await conn.execute(table.delete())

        # 回到首次部署完成状态：唯一系统设置行，初始化向导标志为 false
        s.add(SystemSetting(id=1, system_initialized=False))

        # 唯一豁免的审计记录（user_id 必须为 NULL：users 已清空且 FK 无 ON DELETE）
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        s.add(AuditLog(
            user_id=None,
            actor=actor[:64],
            action="system.reset.execute",
            target=f"task:{task_id}",
            detail=(
                f"系统重置执行完成 backup={backup['filename']} "
                f"size={backup['size_bytes']} at={now_iso}"
            ),
            ip=ip,
        ))
        await s.commit()


def _purge_uploads() -> tuple[int, int]:
    """删除 uploads/ 下全部文件（保留目录结构）；返回 (删除文件数, 失败文件数)。"""
    deleted = 0
    failed = 0
    if UPLOADS_DIR.is_dir():
        for p in UPLOADS_DIR.rglob("*"):
            if not p.is_file():
                continue
            try:
                p.unlink()
                deleted += 1
            except OSError:
                failed += 1
                logger.exception("重置后清理上传文件失败：%s", p)
    for name in UPLOAD_KEEP_DIRS:
        try:
            (UPLOADS_DIR / name).mkdir(parents=True, exist_ok=True)
        except OSError:
            logger.warning("重建上传目录失败：%s", name)
    return deleted, failed


async def run_system_reset(
    task_id: str,
    *,
    actor: str,
    ip: str | None,
) -> None:
    """system_reset 任务主流程（由 api/system_reset.py 通过 launch 调度）。"""
    S = BackgroundTaskStatus
    # SQLite 下让提交请求的 teardown 事务先落盘，避免备份只读连接与写锁互等
    # （低频高危操作，250ms 退让可接受；PG 不受影响）
    await asyncio.sleep(0.25)
    await update_task(
        task_id, status=S.RUNNING, progress=5,
        message="系统重置：执行强制全库备份（备份失败将中止重置）",
    )
    backup: dict | None = None
    try:
        # 1) 强制备份：复用唯一导出入口，失败即终止
        backup = await perform_full_export()
        logger.info("系统重置前置备份完成：%s（task=%s）", backup["filename"], task_id)

        # 2) 清空数据库（事务，失败整体回滚）
        await update_task(task_id, progress=40, message="系统重置：清空全部业务数据表")
        await _wipe_database(task_id, backup, actor, ip)

        # 3) 清理磁盘文件（best-effort）
        await update_task(task_id, progress=80, message="系统重置：清理上传文件并使全部会话失效")
        deleted, failed_files = _purge_uploads()

        # 4) 撤销全部 Break-Glass 会话（普通用户会话随 users 清空自动失效）
        try:
            revoked_bg = await get_kv().delete_prefix(BG_SESSION_PREFIX)
        except Exception:
            revoked_bg = -1
            logger.exception("清理 Break-Glass KV 会话失败（task=%s）", task_id)

        message = f"系统重置完成，已回到初始化状态。备份文件：{backup['filename']}"
        payload = {
            "backup_filename": backup["filename"],
            "backup_path": backup["path"],
            "size_bytes": backup["size_bytes"],
            "files_deleted": deleted,
            "file_delete_failures": failed_files,
            "bg_sessions_revoked": revoked_bg,
        }
        if failed_files:
            message += f"；{failed_files} 个上传文件删除失败，请手动清理"
        await update_task(
            task_id, status=S.SUCCESS, progress=100,
            message=message, result_payload=payload, finished=True,
        )
        logger.warning("系统重置完成（task=%s）：%s", task_id, payload)
    except Exception as e:
        text = str(e)[:2000]
        await update_task(
            task_id, status=S.FAILED,
            message=f"系统重置失败，数据库未被清空：{text}",
            result_payload={
                "error": text,
                "backup_filename": backup["filename"] if backup else None,
                "aborted_before_wipe": backup is None,
            },
            finished=True,
        )
        logger.exception("系统重置失败（task=%s）", task_id)
