"""全局异常处理：禁止向前端输出 strict 堆栈，统一走新壳 `{code,message,data,request_id}`。

- `Exception` 兜底 → 5000（INTERNAL_ERROR）+ i18n key `error.internal`
- `RequestValidationError` → 1001（VALIDATION_FAILED）+ i18n key `error.validation_failed`，
  data.errors 为白名单投影后的字段错误 `{field, reason, params?, message?}`
  （见 validation_errors.py；**绝不**外泄 pydantic 原始 msg / input / ctx.pattern）
- `BizException` → 携带的 code / http_status / data，原样输出新壳
- `HTTPException`（旧壳来源）→ 全局兜底转新壳：按状态码映射 BizCode，
  message 为 `{key, params:{detail}}`（detail 保留原可读文案，供前端在 i18n
  接管前展示，见 bizcode.to_i18n_msg 的渐进 i18n 约定），HTTP 状态码与自定义
  headers（如 X-Password-Change-Required / X-Realname-Required）原样透传。
  Starlette 默认英文 detail（"Not Found" / "Method Not Allowed"…）不透出，交给前端按 key 翻译。
  自此全站错误响应 100% 新壳，业务模块后续逐步把中文 detail 换成 BizException。

**关于 request_id 透传**：
Starlette 的 ServerErrorMiddleware 把 user exception_handler 跑在一个 new task
（`anyio.from_thread.BlockingPortal._call_func`）里，与 trace_middleware 的
contextvars 不互通。因此 handler 不能直接读 `trace_id_var`；改读
`request.state.trace_id`（由 trace_middleware 在 `request.state` 上挂载）。
"""
import logging
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.bizcode import BizCode, get_meta
from app.core.responses import BizException, EnvelopeJSONResponse, fail
from app.core.log import trace_id_var
from app.core.trace import REQUEST_ID_HEADER, TRACE_HEADER
from app.core.validation_errors import describe_for_log, sanitize_validation_errors

logger = logging.getLogger("gdueca.error")


def _request_id_from_state(request: Request) -> str | None:
    """从 request.state 读取 trace_middleware 挂载的 trace_id。
    没有时返回 None（不强行占位，避免日志假阳性）。"""
    return getattr(request.state, "trace_id", None)


def _envelope_with_request_id(
    body: dict,
    request: Request,
    http_status: int,
    extra_headers: dict[str, str] | None = None,
) -> EnvelopeJSONResponse:
    """构造带 request_id 的 EnvelopeJSONResponse（解决跨 task 的 contextvar 失效）。

    body.request_id 与响应头 X-Request-Id / X-Trace-Id 三处同值——
    异常路径下 trace_middleware 来不及挂响应头，这里直接补上，保证 500 也有迹可循。
    extra_headers：HTTPException 携带的自定义响应头原样透传（前端守卫依赖）。
    """
    rid = _request_id_from_state(request)
    headers: dict[str, str] = dict(extra_headers) if extra_headers else {}
    if rid:
        body["request_id"] = rid
        headers.setdefault(TRACE_HEADER, rid)
        headers.setdefault(REQUEST_ID_HEADER, rid)
    return EnvelopeJSONResponse(content=body, status_code=http_status, headers=headers or None)


def _is_default_phrase(status_code: int, detail: object) -> bool:
    """detail 是否只是 Starlette 自动填的 HTTP 标准短语（如 404 → "Not Found"）。"""
    try:
        return str(detail) == HTTPStatus(status_code).phrase
    except ValueError:
        return False


def register_exception_handlers(app: FastAPI) -> None:
    # HTTP 状态码 → 业务码映射（旧壳 HTTPException 兜底转新壳的单一来源）
    _STATUS_TO_BIZ: dict[int, int] = {
        400: BizCode.BAD_REQUEST,
        401: BizCode.UNAUTHORIZED,
        403: BizCode.FORBIDDEN,
        404: BizCode.NOT_FOUND,
        405: BizCode.BAD_REQUEST,
        409: BizCode.CONFLICT,
        413: BizCode.PAYLOAD_TOO_LARGE,
        415: BizCode.UNSUPPORTED_MEDIA_TYPE,
        422: BizCode.VALIDATION_FAILED,
        423: BizCode.ACCOUNT_LOCKED,
        429: BizCode.RATE_LIMITED,
    }

    @app.exception_handler(StarletteHTTPException)
    async def _http_exception_handler(request: Request, exc: StarletteHTTPException):
        code = _STATUS_TO_BIZ.get(
            exc.status_code,
            BizCode.INTERNAL_ERROR if exc.status_code >= 500 else BizCode.BAD_REQUEST,
        )
        message: dict = {"key": get_meta(code).i18n_key}
        if exc.detail and not _is_default_phrase(exc.status_code, exc.detail):
            message["params"] = {"detail": str(exc.detail)}
        body = {"code": code, "message": message, "data": None, "request_id": ""}
        # HTTP 状态码与自定义 headers（X-Password-Change-Required 等）原样透传
        return _envelope_with_request_id(
            body, request, http_status=exc.status_code, extra_headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(request: Request, exc: RequestValidationError):
        errors = sanitize_validation_errors(exc)
        logger.info(
            "参数校验失败：%s %s trace=%s errors=%s",
            request.method, request.url.path,
            _request_id_from_state(request) or "-", describe_for_log(exc),
        )
        body = {"code": BizCode.VALIDATION_FAILED,
                "message": {"key": get_meta(BizCode.VALIDATION_FAILED).i18n_key},
                "data": {"errors": errors},
                "request_id": ""}
        return _envelope_with_request_id(body, request, http_status=422)

    @app.exception_handler(BizException)
    async def _biz_exception_handler(request: Request, exc: BizException):
        body = exc.to_envelope()
        return _envelope_with_request_id(body, request, http_status=exc.http_status)

    @app.exception_handler(Exception)
    async def _unhandled_handler(request: Request, exc: Exception):
        rid = _request_id_from_state(request)
        # 新 task 里 contextvar 是空的：先 seed，保证这条错误日志的 trace 与响应的 request_id 一致
        token = trace_id_var.set(rid) if rid else None
        try:
            logger.exception(
                "未捕获异常：%s %s trace=%s",
                request.method, request.url.path, rid or "-",
            )
        finally:
            if token is not None:
                trace_id_var.reset(token)
        body = {"code": BizCode.INTERNAL_ERROR,
                "message": {"key": "error.internal"},
                "data": None,
                "request_id": ""}
        # 兜底响应只含四字段（code/message/data/request_id），绝不外泄堆栈
        return _envelope_with_request_id(body, request, http_status=500)