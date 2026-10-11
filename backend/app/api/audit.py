"""操作日志查询（只读）：audit_logs 分页 + 搜索 + 动作前缀筛选 + 日期/用户/目标筛选 + CSV 导出。

审计记录由各业务模块写入（登录/审核/内容变更/媒体/渠道配置等），
本模块仅提供后台检索视图，不提供修改与删除（审计不可篡改）。
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.models import AuditLog, User
from app.db.session import get_db
from app.schemas.common import UTCDatetime
from app.utils.crud import apply_search, paginate
from app.utils.export import to_csv

router = APIRouter(prefix="/api/admin/audit-logs", tags=["audit-logs"])

# CSV 导出上限：防一次性拉全表
EXPORT_LIMIT = 2000


class AuditLogOut(BaseModel):
    """操作日志输出（username 由列表接口回填）。"""
    id: int
    user_id: int | None = None
    username: str | None = None
    action: str
    target: str | None = None
    detail: str | None = None
    ip: str | None = None
    trace_id: str | None = None
    created_at: UTCDatetime


def _apply_filters(
    stmt,
    *,
    action: str | None,
    q: str | None,
    user_id: int | None,
    target: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
):
    """列表与导出共用的筛选：动作前缀 + 关键词 + 用户 + 目标前缀 + 日期区间。"""
    if action:
        # 前缀匹配：login 命中 login 与 login.oauth 等
        stmt = stmt.where(AuditLog.action.like(f"{action}%"))
    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if target:
        stmt = stmt.where(AuditLog.target.like(f"{target}%"))
    if date_from is not None:
        stmt = stmt.where(AuditLog.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(AuditLog.created_at <= date_to)
    return apply_search(stmt, [AuditLog.action, AuditLog.detail, AuditLog.ip], q)


async def _fill_usernames(db: AsyncSession, rows: list[AuditLog]) -> dict[int, str]:
    user_ids = {r.user_id for r in rows if r.user_id}
    if not user_ids:
        return {}
    name_rows = (await db.execute(
        select(User.id, User.username).where(User.id.in_(user_ids))
    )).all()
    return {uid: uname for uid, uname in name_rows}


@router.get("")
async def list_audit_logs(
    page: int = 1,
    page_size: int = Query(default=20, le=50),
    action: str | None = None,
    q: str | None = None,
    user_id: int | None = None,
    target: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    user: dict = Depends(require_permission("audit_logs", "view")),
    db: AsyncSession = Depends(get_db),
):
    """操作日志分页列表：action 前缀筛选（如 login / activity.）+ 关键词搜索 + 日期/用户/目标筛选。"""
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    stmt = _apply_filters(
        stmt, action=action, q=q, user_id=user_id,
        target=target, date_from=date_from, date_to=date_to,
    )

    result = await paginate(db, stmt, page, min(page_size, 50))
    names = await _fill_usernames(db, result["items"])
    result["items"] = [
        AuditLogOut(
            id=r.id, user_id=r.user_id, username=names.get(r.user_id),
            action=r.action, target=r.target, detail=r.detail,
            ip=r.ip, trace_id=r.trace_id, created_at=r.created_at,
        ).model_dump(mode="json")
        for r in result["items"]
    ]
    return result


@router.get("/export")
async def export_audit_logs(
    action: str | None = None,
    q: str | None = None,
    user_id: int | None = None,
    target: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    user: dict = Depends(require_permission("audit_logs", "view")),
    db: AsyncSession = Depends(get_db),
):
    """操作日志 CSV 导出：与列表同一套筛选，上限 2000 行（含用户名回填）。"""
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    stmt = _apply_filters(
        stmt, action=action, q=q, user_id=user_id,
        target=target, date_from=date_from, date_to=date_to,
    ).limit(EXPORT_LIMIT)
    rows = (await db.execute(stmt)).scalars().all()
    names = await _fill_usernames(db, list(rows))
    data = to_csv(
        [
            {
                "id": r.id,
                "username": names.get(r.user_id, ""),
                "action": r.action,
                "target": r.target,
                "detail": r.detail,
                "ip": r.ip,
                "trace_id": r.trace_id,
                "created_at": r.created_at,
            }
            for r in rows
        ],
        [
            ("ID", "id"), ("用户名", "username"), ("动作", "action"),
            ("目标", "target"), ("详情", "detail"), ("IP", "ip"),
            ("TraceID", "trace_id"), ("时间", "created_at"),
        ],
        free_text_keys={"detail"},
    )
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="audit_logs.csv"'},
    )
