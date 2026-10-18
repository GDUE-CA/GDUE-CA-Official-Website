"""操作日志查询（只读）：audit_logs 分页 + 搜索 + 动作前缀筛选 + 日期/用户/目标筛选 + CSV 导出；
数据库写操作审计：按 trace id 查看该次写入的全部行级变更，按表 / 行追溯变更历史。

审计记录由各业务模块写入（登录/审核/内容变更/媒体/渠道配置等），
db_traces / db_change_logs 由 app.core.db_trace 在写事务内自动写入；
本模块仅提供后台检索视图，不提供修改与删除（审计不可篡改）。
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_break_glass
from app.core.audit import log_action
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.db.models import AuditLog, DbChangeLog, DbTrace, User
from app.db.session import get_db
from app.schemas.common import UTCDatetime
from app.utils.crud import apply_search, paginate
from app.utils.export import to_csv

router = APIRouter(prefix="/api/admin/audit-logs", tags=["audit-logs"])

# CSV 导出上限：防一次性拉全表
EXPORT_LIMIT = 2000


class AuditLogOut(BaseModel):
    """操作日志输出（username 由列表接口回填；actor 为 Break-Glass 操作者标识）。"""
    id: int
    user_id: int | None = None
    username: str | None = None
    actor: str | None = None
    action: str
    target: str | None = None
    detail: str | None = None
    ip: str | None = None
    request_id: str | None = None
    # 数据库写操作 trace id（同事务的行级变更见 /api/admin/db-traces/{trace_id}）
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
    request_id: str | None = None,
    trace_id: str | None = None,
):
    """列表与导出共用的筛选：动作前缀 + 关键词 + 用户 + 目标前缀 + 日期区间 + request / trace id。"""
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
    if request_id:
        stmt = stmt.where(AuditLog.request_id == request_id)
    if trace_id:
        stmt = stmt.where(AuditLog.trace_id == trace_id)
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
    request_id: str | None = None,
    trace_id: str | None = None,
    user: dict = Depends(require_permission("audit_logs", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """操作日志分页列表：action 前缀筛选（如 login / activity.）+ 关键词搜索 + 日期/用户/目标筛选。"""
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    stmt = _apply_filters(
        stmt, action=action, q=q, user_id=user_id,
        target=target, date_from=date_from, date_to=date_to,
        request_id=request_id, trace_id=trace_id,
    )

    result = await paginate(db, stmt, page, min(page_size, 50))
    names = await _fill_usernames(db, result["items"])
    result["items"] = [
        AuditLogOut(
            id=r.id, user_id=r.user_id, username=names.get(r.user_id),
            actor=r.actor,
            action=r.action, target=r.target, detail=r.detail,
            ip=r.ip, request_id=r.request_id, trace_id=r.trace_id, created_at=r.created_at,
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
    db: AsyncSession = Depends(get_db, scope="function"),
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
                "actor": r.actor or "",
                "action": r.action,
                "target": r.target,
                "detail": r.detail,
                "ip": r.ip,
                "request_id": r.request_id,
                "trace_id": r.trace_id,
                "created_at": r.created_at,
            }
            for r in rows
        ],
        [
            ("ID", "id"), ("用户名", "username"), ("操作者", "actor"),
            ("动作", "action"), ("目标", "target"), ("详情", "detail"),
            ("IP", "ip"), ("RequestID", "request_id"), ("TraceID", "trace_id"),
            ("时间", "created_at"),
        ],
        free_text_keys={"detail"},
    )
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="audit_logs.csv"'},
    )


# ---------- 数据库写操作审计（trace id ↔ 一次写事务的全部行级变更） ----------
db_trace_router = APIRouter(prefix="/api/admin/db-traces", tags=["db-traces"])


class DbTraceOut(BaseModel):
    trace_id: str
    request_id: str | None = None
    source: str
    user_id: int | None = None
    username: str | None = None
    actor: str | None = None
    method: str | None = None
    path: str | None = None
    ip: str | None = None
    created_at: UTCDatetime


class DbChangeOut(BaseModel):
    """changes：insert → {列: 新值}；update → {列: [旧值, 新值]}；delete → {列: 旧值}；
    bulk_update / bulk_delete → {statement, params}。敏感列值为 ***。"""
    id: int
    table_name: str
    row_pk: str | None = None
    op: str
    changes: dict | None = None
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


async def _trace_out(db: AsyncSession, rows: list[DbTrace]) -> list[dict]:
    user_ids = {r.user_id for r in rows if r.user_id}
    names: dict[int, str] = {}
    if user_ids:
        names = dict((await db.execute(
            select(User.id, User.username).where(User.id.in_(user_ids))
        )).all())
    return [
        DbTraceOut(
            trace_id=r.trace_id, request_id=r.request_id, source=r.source,
            user_id=r.user_id, username=names.get(r.user_id), actor=r.actor,
            method=r.method, path=r.path, ip=r.ip, created_at=r.created_at,
        ).model_dump(mode="json")
        for r in rows
    ]


@db_trace_router.get("")
async def list_db_traces(
    page: int = 1,
    page_size: int = Query(default=20, le=50),
    table: str | None = Query(default=None, max_length=64),
    row_pk: str | None = Query(default=None, max_length=128),
    user_id: int | None = None,
    request_id: str | None = Query(default=None, max_length=64),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    user: dict = Depends(require_permission("audit_logs", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """写操作 trace 列表：按表（+ 行主键）追溯某行的变更历史，或按用户 / 请求 / 时间筛选。"""
    stmt = select(DbTrace).order_by(DbTrace.created_at.desc(), DbTrace.id.desc())
    if table:
        touched = select(DbChangeLog.trace_id).where(DbChangeLog.table_name == table)
        if row_pk:
            touched = touched.where(DbChangeLog.row_pk == row_pk)
        stmt = stmt.where(DbTrace.trace_id.in_(touched))
    if user_id is not None:
        stmt = stmt.where(DbTrace.user_id == user_id)
    if request_id:
        stmt = stmt.where(DbTrace.request_id == request_id)
    if date_from is not None:
        stmt = stmt.where(DbTrace.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(DbTrace.created_at <= date_to)
    result = await paginate(db, stmt, page, min(page_size, 50))
    result["items"] = await _trace_out(db, result["items"])
    return result


@db_trace_router.get("/{trace_id}")
async def get_db_trace(
    trace_id: str,
    user: dict = Depends(require_permission("audit_logs", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """单个 trace：发起上下文 + 该次写入的全部行级变更 + 同事务的业务操作日志。"""
    trace = (await db.execute(
        select(DbTrace).where(DbTrace.trace_id == trace_id)
    )).scalar_one_or_none()
    if trace is None:
        raise HTTPException(status_code=404, detail="trace 不存在")
    changes = (await db.execute(
        select(DbChangeLog).where(DbChangeLog.trace_id == trace_id).order_by(DbChangeLog.id)
    )).scalars().all()
    audits = (await db.execute(
        select(AuditLog).where(AuditLog.trace_id == trace_id).order_by(AuditLog.id)
    )).scalars().all()
    names = await _fill_usernames(db, list(audits))
    return {
        "trace": (await _trace_out(db, [trace]))[0],
        "changes": [DbChangeOut.model_validate(c).model_dump(mode="json") for c in changes],
        "audit_logs": [
            AuditLogOut(
                id=r.id, user_id=r.user_id, username=names.get(r.user_id), actor=r.actor,
                action=r.action, target=r.target, detail=r.detail, ip=r.ip,
                request_id=r.request_id, trace_id=r.trace_id, created_at=r.created_at,
            ).model_dump(mode="json")
            for r in audits
        ],
    }


# ---------- Break-Glass 高危操作确认/取消审计 ----------
bg_router = APIRouter(prefix="/api/audit", tags=["audit"])


class BGConfirmRequest(BaseModel):
    action: str = Field(max_length=64)
    target: str | None = Field(default=None, max_length=128)
    confirmed: bool


@bg_router.post("/bg-confirm")
async def bg_confirm(
    req: BGConfirmRequest,
    request: Request,
    user: dict = Depends(require_break_glass),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """Break-Glass 高危操作确认/取消 → 审计日志（确认与取消均记录，无痕后门禁止）。"""
    log_action(
        db, user,
        "bg_confirm" if req.confirmed else "bg_cancel",
        f"action:{req.action}",
        ip=get_client_ip(request),
        target=req.target,
    )
    await db.commit()
    return {"ok": True}
