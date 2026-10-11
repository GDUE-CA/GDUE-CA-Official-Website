"""traceId 中间件：为每个请求分配 traceId、输出访问日志。

- traceId 来源：可信反向代理传入的 X-Request-ID / X-Trace-Id（格式校验通过才采信），否则新生成
- 响应头 X-Trace-Id / X-Request-Id 回传（同值；新规范字段）
- 访问日志只记录方法与路径，不记录查询参数（可能含手机号 / 学号等个人信息，GB/T 35274 最小化）

**未捕获异常**：不再在此处拦截；统一交给 FastAPI exception_handler 处理
（app/core/exceptions.py::_unhandled_handler），输出新壳 `{code:5000, message, data, request_id}`，
原堆栈仅写日志（带 trace_id）。
"""
import logging
import time
from datetime import datetime, timezone
from typing import Awaitable, Callable

from fastapi import Request, Response

from app.core.log import new_trace_id, sanitize_trace_id, trace_id_var
from app.core.middleware import _ip_to_str, _is_trusted_proxy, get_client_ip

TRACE_HEADER = "X-Trace-Id"
REQUEST_ID_HEADER = "X-Request-Id"  # 与 X-Trace-Id 同值；规范要求的"request_id"命名
SERVER_TIME_HEADER = "X-Server-Utc-Time"  # 规范：后端权威计时器，前端据此维护服务端时间偏移
_INCOMING_HEADERS = ("x-request-id", "x-trace-id")


def server_utc_now_iso() -> str:
    """当前服务器 UTC 时间的 ISO-8601 毫秒级字符串（Z 结尾），供 X-Server-Utc-Time 头使用。"""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

access_logger = logging.getLogger("gdueca.access")
error_logger = logging.getLogger("gdueca.error")


def _incoming_trace_id(request: Request) -> str | None:
    """仅采信可信代理传入的 traceId，防止客户端伪造 / 污染日志。"""
    peer = _ip_to_str(request.client.host) if request.client else None
    if not _is_trusted_proxy(peer):
        return None
    for header in _INCOMING_HEADERS:
        value = sanitize_trace_id(request.headers.get(header))
        if value:
            return value
    return None


async def trace_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    trace_id = _incoming_trace_id(request) or new_trace_id()
    # 同步挂在 request.state 上；Starlette 的 ServerErrorMiddleware 在另一个 task
    # 里跑 user exception_handler，contextvars 不会跨 task 继承，必须靠 request.state 透传。
    request.state.trace_id = trace_id
    token = trace_id_var.set(trace_id)
    start = time.perf_counter()
    status = 500
    try:
        # 未捕获异常交给 FastAPI exception_handler 处理；此处不再拦截
        response = await call_next(request)
        status = response.status_code
        response.headers[TRACE_HEADER] = trace_id
        # 规范要求 request_id 同步出现在响应头；与 X-Trace-Id 同值，便于前端按规范读取
        response.headers[REQUEST_ID_HEADER] = trace_id
        # 规范：所有 API 固定返回后端权威 UTC 时间，前端 useSystemTimer 据此校准
        response.headers[SERVER_TIME_HEADER] = server_utc_now_iso()
        return response
    finally:
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        client_ip = get_client_ip(request)
        path = request.url.path
        # 健康检查降为 DEBUG，避免刷屏
        if path == "/health":
            level = logging.DEBUG
        else:
            level = logging.ERROR if status >= 500 else logging.INFO
        access_logger.log(
            level,
            "%s %s %s %sms ip=%s",
            request.method, path, status, duration_ms, client_ip or "-",
            extra={
                "method": request.method,
                "path": path,
                "status": status,
                "duration_ms": duration_ms,
                "client_ip": client_ip,
            },
        )
        trace_id_var.reset(token)
