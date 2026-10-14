"""数据库全量导出执行器（后台异步任务 db_export 的业务体）。

- SQLite：在线备份 API 生成一致性快照后 iterdump 为 SQL 文本（服务运行中安全执行）；
- PostgreSQL：调用本机 pg_dump（plain 格式，输出 .sql）；
- 输出固定写入 ./exports/full_dump_YYYYMMDD_HHMMSS.sql（目录 0700 / 文件 0600）；
- 进度阶段与规范对齐：5 准备 → 20 开始转储 → 90 校验文件 → 100 完成；
  失败保持当前进度不回退，message / result_payload.error 写错误详情；
- 安全：错误信息绝不包含连接串（DSN 可能带口令），仅保留工具自身报错文本。
"""
from __future__ import annotations

import asyncio
import logging
import os
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path

from app.core.background_tasks import update_task
from app.core.config import get_settings
from app.db.models import BackgroundTaskStatus

logger = logging.getLogger("gdueca")

EXPORTS_DIR = Path("exports")


def _sqlite_path(url: str) -> Path:
    return Path(url.split(":///", 1)[1])


def _dump_sqlite_to_sql(db_path: Path, out: Path) -> None:
    """同步执行（在线程池调用）：只读连接 → 在线快照 → iterdump 写 SQL 文本。"""
    with tempfile.TemporaryDirectory() as tmp:
        snapshot = Path(tmp) / "snapshot.sqlite3"
        src = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        dst = sqlite3.connect(snapshot)
        with dst:
            src.backup(dst)
        src.close()
        dst.close()
        con = sqlite3.connect(f"file:{snapshot}?mode=ro", uri=True)
        try:
            with open(out, "w", encoding="utf-8", newline="\n") as f:
                for line in con.iterdump():
                    f.write(f"{line}\n")
        finally:
            con.close()


async def _run_pg_dump(dsn: str, out: Path) -> str | None:
    """调用 pg_dump；成功返回 None，失败返回（已脱敏的）错误文本。"""
    try:
        proc = await asyncio.create_subprocess_exec(
            "pg_dump", "--format=plain", f"--file={out}", dsn,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        return "未找到 pg_dump 可执行文件，请在服务器安装 PostgreSQL 客户端工具"
    _, stderr = await proc.communicate()
    if proc.returncode == 0:
        return None
    # pg_dump 报错文本可能回显连接参数，截断并剔除 DSN 原文防口令泄露
    err = stderr.decode("utf-8", errors="replace").replace(dsn, "***").strip()
    return err[-2000:] or f"pg_dump 退出码 {proc.returncode}"


async def run_db_export(task_id: str) -> None:
    """db_export 任务主流程（由 core.background_tasks.launch 调度）。"""
    S = BackgroundTaskStatus
    await update_task(task_id, status=S.RUNNING, progress=5, message="准备数据库导出")
    try:
        url = get_settings().DATABASE_URL
        EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(EXPORTS_DIR, 0o700)
        except OSError:
            pass  # Windows 无 POSIX 权限语义，忽略
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"full_dump_{stamp}.sql"
        out = EXPORTS_DIR / filename

        if url.startswith("sqlite"):
            await update_task(task_id, progress=20, message="生成数据库一致性快照并转储全部数据表")
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _dump_sqlite_to_sql, _sqlite_path(url), out)
            error = None
        elif url.startswith("postgresql"):
            await update_task(task_id, progress=20, message="调用 pg_dump 开始转储全部数据表")
            dsn = url.replace("postgresql+asyncpg://", "postgresql://")
            error = await _run_pg_dump(dsn, out)
        else:
            error = f"不支持的数据库类型：{url.split(':', 1)[0]}"

        if error:
            if out.exists():
                out.unlink(missing_ok=True)
            raise RuntimeError(error)

        await update_task(task_id, progress=90, message="校验生成备份文件")
        if not out.exists() or out.stat().st_size == 0:
            raise RuntimeError("导出文件未生成或内容为空")
        try:
            os.chmod(out, 0o600)
        except OSError:
            pass

        size = out.stat().st_size
        await update_task(
            task_id,
            status=S.SUCCESS,
            progress=100,
            message="数据库导出任务完成",
            result_payload={
                "filename": filename,
                "path": f"./exports/{filename}",
                "size_bytes": size,
            },
            finished=True,
        )
        logger.info("数据库导出完成：%s（%d 字节，task=%s）", out, size, task_id)
    except asyncio.CancelledError:
        raise
    except Exception as e:
        # 失败：进度保持当前值，仅更新状态与错误详情
        text = str(e)[:2000]
        await update_task(
            task_id,
            status=S.FAILED,
            message=text,
            result_payload={"error": text},
            finished=True,
        )
        logger.exception("数据库导出失败（task=%s）", task_id)
