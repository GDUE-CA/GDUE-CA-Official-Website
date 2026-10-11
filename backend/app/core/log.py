"""统一日志：traceId 上下文、统一格式（文本 / JSON）、接管 uvicorn 日志。

- 每个请求一个 traceId（contextvars 传递，异步安全），自动写入该请求期间的所有日志
- LOG_FORMAT=text（默认，便于人读）或 json（一行一个 JSON，便于日志系统采集）
- uvicorn / uvicorn.error 统一走本格式；uvicorn.access 关闭，由 trace 中间件输出访问日志
"""
import json
import logging
import re
import sys
import uuid
from contextvars import ContextVar
from datetime import datetime

# 当前请求的 traceId；请求之外（启动、后台任务）为 "-"
trace_id_var: ContextVar[str] = ContextVar("trace_id", default="-")

# 上游传入的 traceId 只接受这个格式，防止日志注入与超长值
_TRACE_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")

# 访问日志等附加字段（logger.info(..., extra={...})），JSON 模式下原样输出
_EXTRA_FIELDS = ("method", "path", "status", "duration_ms", "client_ip", "user_id")


def new_trace_id() -> str:
    return uuid.uuid4().hex


def sanitize_trace_id(value: str | None) -> str | None:
    """校验上游传入的 traceId；不合法返回 None。"""
    if value and _TRACE_ID_RE.fullmatch(value.strip()):
        return value.strip()
    return None


def current_trace_id() -> str:
    return trace_id_var.get()


class TraceIdFilter(logging.Filter):
    """给每条日志注入 trace_id 字段。"""

    def filter(self, record: logging.LogRecord) -> bool:
        record.trace_id = trace_id_var.get()
        return True


def _timestamp(record: logging.LogRecord) -> str:
    return datetime.fromtimestamp(record.created).astimezone().isoformat(timespec="milliseconds")


class TextFormatter(logging.Formatter):
    """2026-09-30T14:05:01.123+08:00 INFO  [trace=9f2c…] gdueca.access | message"""

    def format(self, record: logging.LogRecord) -> str:
        line = (
            f"{_timestamp(record)} {record.levelname:<5} "
            f"[trace={getattr(record, 'trace_id', '-')}] {record.name} | {record.getMessage()}"
        )
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return line


class JsonFormatter(logging.Formatter):
    """{"ts": ..., "level": ..., "logger": ..., "trace_id": ..., "msg": ..., 附加字段...}"""

    def format(self, record: logging.LogRecord) -> str:
        data = {
            "ts": _timestamp(record),
            "level": record.levelname,
            "logger": record.name,
            "trace_id": getattr(record, "trace_id", "-"),
            "msg": record.getMessage(),
        }
        for key in _EXTRA_FIELDS:
            if hasattr(record, key):
                data[key] = getattr(record, key)
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return json.dumps(data, ensure_ascii=False)


def setup_logging(level: str = "INFO", fmt: str = "text") -> None:
    """配置根日志与 uvicorn 日志；可重复调用（幂等）。"""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter() if fmt.lower() == "json" else TextFormatter())
    handler.addFilter(TraceIdFilter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())

    # uvicorn 自带的 handler 移除，改为向根日志冒泡，格式统一
    for name in ("uvicorn", "uvicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.propagate = True
    # 访问日志由 trace 中间件输出（带 traceId / 耗时 / 真实 IP），关闭 uvicorn 自带的
    access = logging.getLogger("uvicorn.access")
    access.handlers = []
    access.propagate = False
    access.disabled = True

    # 第三方库降噪
    for noisy in ("httpx", "httpcore", "aiosqlite", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
