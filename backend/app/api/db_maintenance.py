"""数据库维护接口（管理端）。

POST /api/admin/db/export：数据库全量导出 —— 后台异步任务。
  提交即落库一条 background_task（pending / progress=0）并立刻返回 task_id，
  转储在服务器后台执行，不阻塞 HTTP 请求；进度/结果通过任务查询接口与
  通知中心获取（任务行即通知数据源）。导出操作写审计日志（独立于任务记录）。

GET /api/admin/db/exports：备份文件列表（直接扫描 ./exports 目录，按时间倒序）。
  系统重置自动生成的强制备份同样落在该目录，在此列表立即可见、可下载。

GET /api/admin/db/exports/{filename}/download：下载指定备份文件（纯文件名白名单，
  防路径穿越；权限 settings.view）。

导入维持现状：同步 + superadmin 专属 + 双重确认（高危、低频，后续如需异步
复用 background_task 框架即可）。
"""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.background_tasks import create_task, launch
from app.core.db_export import EXPORTS_DIR, run_db_export
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.responses import BizException, ok
from app.core.bizcode import BizCode
from app.db.models import BackgroundTaskCategory
from app.db.session import get_db
from app.schemas.background_task import BackgroundTaskSubmitOut

router = APIRouter(prefix="/api/admin/db", tags=["db-maintenance"])

# 备份文件名白名单：仅允许字母数字/点/下划线/连字符（full_dump_20261016_120000.sql
# 以及运维脚本生成的 .sqlite3.gz / .pgdump）；禁止分隔符与 ".."，杜绝路径穿越
_SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]+$")


def _resolve_export_file(filename: str):
    """把纯文件名解析为 exports 目录内的真实路径；非法或不存在抛 BizException。"""
    if not filename or not _SAFE_NAME.match(filename) or filename in (".", "..") \
            or filename.startswith("."):
        raise BizException(BizCode.BAD_REQUEST, params={"detail": "非法备份文件名"})
    path = (EXPORTS_DIR / filename).resolve()
    try:
        path.relative_to(EXPORTS_DIR.resolve())
    except ValueError:
        raise BizException(BizCode.BAD_REQUEST, params={"detail": "非法备份文件名"})
    if not path.is_file():
        raise BizException(BizCode.NOT_FOUND, params={"detail": "备份文件不存在"})
    return path


@router.post("/export")
async def submit_db_export(
    request: Request,
    user: dict = Depends(require_permission("settings", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
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


@router.get("/exports")
async def list_db_exports(
    user: dict = Depends(require_permission("settings", "view")),
):
    """列出 exports 目录内全部备份文件（新文件在前）。

    列表以文件系统为准（而非 background_tasks 记录），因此系统重置在异步任务中
    自动生成的强制备份无需额外登记即可在此出现并下载。
    """
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    items = []
    for p in EXPORTS_DIR.iterdir():
        if not p.is_file() or not _SAFE_NAME.match(p.name) or p.name.startswith("."):
            continue
        st = p.stat()
        mtime = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc)
        items.append({
            "filename": p.name,
            "size_bytes": st.st_size,
            # 后端统一输出带大写 Z 的 ISO-8601 UTC，前端负责格式化
            "created_at": mtime.strftime("%Y-%m-%dT%H:%M:%SZ"),
        })
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return ok({"items": items, "total": len(items)})


@router.get("/exports/{filename}/download")
async def download_db_export(
    filename: str,
    user: dict = Depends(require_permission("settings", "view")),
):
    """下载备份文件（纯文件名白名单 + 目录归属校验，防路径穿越）。"""
    path = _resolve_export_file(filename)
    return FileResponse(
        path,
        filename=filename,
        media_type="application/octet-stream",
    )
