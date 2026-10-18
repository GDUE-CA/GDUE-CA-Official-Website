"""数据库写操作 trace：只有产生写操作的请求 / 事务才分配 trace id，与 db_traces 一一对应。

- request id：每个 HTTP 请求都有（日志关联 / 报错排查），见 app.core.trace；
- trace id：请求内首次产生需审计的写入（INSERT / UPDATE / DELETE）时分配，
  写入 db_traces（谁 / 哪个请求 / 从哪里），每一行变更写入 db_change_logs；
  同一请求内多次提交共用一个 trace id；后台任务 / 定时任务每个事务一个 trace id。
- 审计行与业务写入在同一事务内落库：业务回滚则审计一并回滚，提交成功才对外暴露 trace id
  （响应头 X-Trace-Id 仅在 committed 后下发）。

实现：SQLAlchemy Session 事件
- before_flush：判定本次 flush 是否含需审计的写入 → 分配 trace id、加入 DbTrace 行、
  给新 AuditLog 回填 trace_id；删除操作在此快照旧值（flush 后对象即失效）；
- after_flush：自增主键已生成，逐行生成 DbChangeLog（随后由 commit 的 flush 循环落库）；
- do_orm_execute：ORM 批量 update() / delete() 无法逐行展开，先执行再记录语句、参数与影响行数
  （影响 0 行不算写操作，避免定时清理任务每小时产生空审计）；
- after_commit / after_rollback：维护 trace 状态（回滚后未提交过的 trace id 作废）。

不审计：审计表自身、纯缓存表；仅改动心跳列（如会话 last_active_at 滑动续期）的 UPDATE。
敏感列（密码 / 密钥 / 令牌 / 哈希等）只记录「发生了变更」，值脱敏为 ***。
保留期：DB_TRACE_RETENTION_DAYS（默认 30 天），由定时维护任务调用 purge_expired 清理。
"""
from __future__ import annotations

import enum
import json
import re
import uuid
from contextvars import ContextVar, Token
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, event, inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import ORMExecuteState, Session

from app.core.log import current_request_id, set_trace_id_getter
from app.db.models import AuditLog, DbChangeLog, DbTrace

# 不审计的表：审计表自身（防递归）+ 纯缓存
EXCLUDED_TABLES = frozenset({"db_traces", "db_change_logs", "translation_cache"})
# 只改这些列的 UPDATE 不算写操作（每个已登录请求都会滑动续期，审计无意义且会让 trace id 失去区分度）
IGNORED_COLUMNS: dict[str, frozenset[str]] = {
    "login_sessions": frozenset({"last_active_at"}),
    "background_tasks": frozenset({"progress", "message"}),
}
_SENSITIVE_RE = re.compile(
    r"password|passwd|secret|token|credential|private_key|api_key"
    r"|(?:^|_)(?:hash|otp|totp|recovery_codes?)(?:_|$)",
    re.IGNORECASE,
)
_MASK = "***"
_MAX_TEXT = 2000

_PENDING_KEY = "_dbtrace_pending"
_BG_TRACE_KEY = "_dbtrace_bg"


@dataclass
class WriteTrace:
    """一个请求（或一个后台事务）的写操作 trace 状态。"""

    source: str = "request"
    request_id: str | None = None
    method: str | None = None
    path: str | None = None
    ip: str | None = None
    user_id: int | None = None
    actor: str | None = None
    trace_id: str | None = None
    # DbTrace 行已加入某个会话、尚未提交
    row_session: Session | None = None
    committed: bool = False


_trace_var: ContextVar[WriteTrace | None] = ContextVar("db_write_trace", default=None)


# ---------- 请求生命周期（由 trace 中间件 / 认证依赖调用） ----------

def begin_request(*, request_id: str, method: str, path: str, ip: str | None) -> Token:
    return _trace_var.set(WriteTrace(request_id=request_id, method=method, path=path[:255], ip=ip))


def end_request(token: Token) -> None:
    _trace_var.reset(token)


def bind_actor(user_id: int | None, actor: str | None = None) -> None:
    """认证阶段记录操作者（须在本请求首次写库前调用，DbTrace 行创建时写入）。"""
    h = _trace_var.get()
    if h is None:
        return
    h.user_id, h.actor = user_id, actor


def committed_trace_id() -> str | None:
    """当前请求已提交的写操作 trace id；无写操作 / 未提交 / 已回滚为 None。"""
    h = _trace_var.get()
    return h.trace_id if h and h.committed else None


def _current_trace_id() -> str | None:
    h = _trace_var.get()
    return h.trace_id if h else None


set_trace_id_getter(_current_trace_id)


# ---------- 值序列化 / 脱敏 ----------

def _serialize(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, enum.Enum):
        return value.value if isinstance(value.value, (str, int)) else value.name
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return f"<{len(bytes(value))} bytes>"
    if isinstance(value, str):
        return value if len(value) <= _MAX_TEXT else f"{value[:_MAX_TEXT]}…(+{len(value) - _MAX_TEXT})"
    if isinstance(value, (dict, list, tuple)):
        text = json.dumps(value, ensure_ascii=False, default=str)
        return json.loads(text) if len(text) <= _MAX_TEXT else f"{text[:_MAX_TEXT]}…(+{len(text) - _MAX_TEXT})"
    return _serialize(str(value))


def _value(key: str, value: Any) -> Any:
    if value is not None and _SENSITIVE_RE.search(key):
        return _MASK
    return _serialize(value)


# ---------- 变更提取 ----------

def _table_of(obj: Any) -> str | None:
    table = getattr(type(obj), "__table__", None)
    return getattr(table, "name", None)


def _changed_keys(obj: Any) -> list[str]:
    state = inspect(obj)
    return [
        attr.key for attr in state.mapper.column_attrs
        if state.attrs[attr.key].history.has_changes()
    ]


def _row_pk(obj: Any) -> str | None:
    state = inspect(obj)
    values = [state.dict.get(prop.key) for prop in state.mapper._identity_key_props]
    if any(v is None for v in values):
        return None
    return ",".join(str(v) for v in values)


def _insert_changes(obj: Any) -> dict:
    state = inspect(obj)
    return {
        attr.key: _value(attr.key, state.dict.get(attr.key))
        for attr in state.mapper.column_attrs
        if state.dict.get(attr.key) is not None
    }


def _update_changes(obj: Any) -> dict:
    state = inspect(obj)
    out = {}
    for attr in state.mapper.column_attrs:
        hist = state.attrs[attr.key].history
        if not hist.has_changes():
            continue
        old = hist.deleted[0] if hist.deleted else None
        new = hist.added[0] if hist.added else None
        out[attr.key] = [_value(attr.key, old), _value(attr.key, new)]
    return out


def _delete_changes(obj: Any) -> dict:
    state = inspect(obj)
    # 删除记录全部已加载列的旧值（含 None，便于还原）
    return {
        attr.key: _value(attr.key, state.dict[attr.key])
        for attr in state.mapper.column_attrs
        if attr.key in state.dict
    }


# ---------- trace 分配 ----------

def _holder(session: Session) -> WriteTrace:
    """请求内用请求级 trace；请求之外每个会话事务一个后台 trace。"""
    h = _trace_var.get()
    if h is not None:
        return h
    h = session.info.get(_BG_TRACE_KEY)
    if h is None:
        rid = current_request_id()
        h = WriteTrace(source="background", request_id=None if rid == "-" else rid)
        session.info[_BG_TRACE_KEY] = h
    return h


def _ensure_trace(session: Session) -> WriteTrace:
    h = _holder(session)
    if h.trace_id is None:
        h.trace_id = uuid.uuid4().hex
    if not h.committed and h.row_session is None:
        session.add(DbTrace(
            trace_id=h.trace_id, request_id=h.request_id, source=h.source,
            user_id=h.user_id, actor=h.actor, method=h.method, path=h.path, ip=h.ip,
        ))
        h.row_session = session
    return h


# ---------- 会话事件 ----------

@event.listens_for(Session, "before_flush")
def _before_flush(session: Session, flush_context, instances) -> None:
    targets: list[tuple[Any, str, dict | None]] = []
    for obj in session.new:
        table = _table_of(obj)
        if table and table not in EXCLUDED_TABLES:
            targets.append((obj, "insert", None))
    for obj in session.dirty:
        table = _table_of(obj)
        if not table or table in EXCLUDED_TABLES:
            continue
        changed = _changed_keys(obj)
        if changed and not set(changed) <= IGNORED_COLUMNS.get(table, frozenset()):
            targets.append((obj, "update", _update_changes(obj)))
    for obj in session.deleted:
        table = _table_of(obj)
        if table and table not in EXCLUDED_TABLES:
            targets.append((obj, "delete", _delete_changes(obj)))
    if not targets:
        return

    h = _ensure_trace(session)
    for obj, op, _ in targets:
        if op == "insert" and isinstance(obj, AuditLog) and obj.trace_id is None:
            obj.trace_id = h.trace_id
    session.info.setdefault(_PENDING_KEY, []).extend(targets)


@event.listens_for(Session, "after_flush")
def _after_flush(session: Session, flush_context) -> None:
    pending = session.info.pop(_PENDING_KEY, None)
    if not pending:
        return
    h = _holder(session)
    for obj, op, changes in pending:
        session.add(DbChangeLog(
            trace_id=h.trace_id,
            table_name=_table_of(obj),
            row_pk=_row_pk(obj),
            op=op,
            # insert 在 flush 后取值：服务端默认值 / 自增主键此时已就绪
            changes=_insert_changes(obj) if op == "insert" else changes,
        ))


@event.listens_for(Session, "do_orm_execute")
def _on_orm_execute(state: ORMExecuteState):
    if not (state.is_update or state.is_delete):
        return None
    table = getattr(getattr(state.statement, "table", None), "name", None)
    if not table or table in EXCLUDED_TABLES:
        return None
    result = state.invoke_statement()
    rowcount = getattr(result, "rowcount", -1)
    if rowcount == 0:
        return result
    session = state.session
    h = _ensure_trace(session)
    compiled = state.statement.compile()
    session.add(DbChangeLog(
        trace_id=h.trace_id,
        table_name=table,
        row_pk=None,
        op="bulk_update" if state.is_update else "bulk_delete",
        changes={
            "statement": _serialize(str(compiled)),
            "params": {k: _value(k, v) for k, v in compiled.params.items()},
            "rowcount": rowcount,
        },
    ))
    return result


@event.listens_for(Session, "after_commit")
def _after_commit(session: Session) -> None:
    h = _trace_var.get() or session.info.get(_BG_TRACE_KEY)
    if h is not None and h.row_session is session:
        h.row_session = None
        h.committed = True
    session.info.pop(_BG_TRACE_KEY, None)


@event.listens_for(Session, "after_rollback")
def _after_rollback(session: Session) -> None:
    session.info.pop(_PENDING_KEY, None)
    h = _trace_var.get() or session.info.get(_BG_TRACE_KEY)
    if h is not None and h.row_session is session:
        h.row_session = None
        if not h.committed:
            h.trace_id = None  # DbTrace 行随事务回滚，trace id 作废
    session.info.pop(_BG_TRACE_KEY, None)


# ---------- 保留期清理 ----------

async def purge_expired(session: AsyncSession, before: datetime) -> int:
    """删除 before 之前的写操作审计（db_change_logs + db_traces），返回删除的 trace 数；不自行提交。"""
    await session.execute(delete(DbChangeLog).where(DbChangeLog.created_at < before))
    result = await session.execute(delete(DbTrace).where(DbTrace.created_at < before))
    return result.rowcount or 0
