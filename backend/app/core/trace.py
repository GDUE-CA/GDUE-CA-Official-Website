"""请求标识中间件：为每个请求分配 request id、输出访问日志、下发写操作 trace id。

- request id：每个请求都有。来源：可信反向代理传入的 X-Request-ID（格式校验通过才采信），否则新生成；
  响应头 X-Request-Id 回传，与响应体 request_id 同值
- trace id：仅当请求产生数据库写操作且已提交时才有（见 app.core.db_trace），响应头 X-Trace-Id 回传；
  与 db_traces 一一对应，可据此审计该次写入的全部行级变更。只由服务端生成，不采信上游传入
- 访问日志只记录方法与路径，不记录查询参数（可能含手机号 / 学号等个人信息，GB/T 35274 最小化）

**未捕获异常**：不在此处拦截；统一交给 FastAPI exception_handler 处理
（app/core/exceptions.py::_unhandled_handler），输出新壳 `{code:5000, message, data, request_id}`，
原堆栈仅写日志（带 request_id）。
"""
import logging
import time
from typing import Awaitable, Callable

from fastapi import Request, Response

from app.core import db_trace
from app.core.log import new_request_id, request_id_var, sanitize_request_id
from app.core.middleware import _ip_to_str, _is_trusted_proxy, get_client_ip

REQUEST_ID_HEADER = "X-Request-Id"
TRACE_HEADER = "X-Trace-Id"


access_logger = logging.getLogger("gdueca.access")
error_logger = logging.getLogger("gdueca.error")


def _incoming_request_id(request: Request) -> str | None:
    """仅采信可信代理传入的 request id，防止客户端伪造 / 污染日志。"""
    peer = _ip_to_str(request.client.host) if request.client else None
    if not _is_trusted_proxy(peer):
        return None
    return sanitize_request_id(request.headers.get("x-request-id"))


async def trace_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    request_id = _incoming_request_id(request) or new_request_id()
    client_ip = get_client_ip(request)
    path = request.url.path
    # 同步挂在 request.state 上；Starlette 的 ServerErrorMiddleware 在另一个 task
    # 里跑 user exception_handler，contextvars 不会跨 task 继承，必须靠 request.state 透传。
    request.state.request_id = request_id
    rid_token = request_id_var.set(request_id)
    trace_token = db_trace.begin_request(
        request_id=request_id, method=request.method, path=path, ip=client_ip,
    )
    start = time.perf_counter()
    status = 500
    try:
        # 未捕获异常交给 FastAPI exception_handler 处理；此处不再拦截
        response = await call_next(request)
        status = response.status_code
        response.headers[REQUEST_ID_HEADER] = request_id
        trace_id = db_trace.committed_trace_id()
        if trace_id:
            response.headers[TRACE_HEADER] = trace_id
        return response
    finally:
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
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
        db_trace.end_request(trace_token)
        request_id_var.reset(rid_token)
