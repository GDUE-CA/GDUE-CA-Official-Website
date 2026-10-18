"""统一业务响应壳：所有业务接口通过 `ok()` / `fail()` / `BizException` 输出。

响应体格式：
    {
        "code":        0,       # 0=成功；>0=业务错误码（见 bizcode.BizCode）
        "message":     "",      # 成功为空；错误为 {key: i18n_key, params?: {...}}；仅展示，禁止参与业务判断
        "data":        ...,     # 业务载荷；错误时通常为 None
        "request_id":  "..."    # 与响应头 X-Request-Id 同值
    }

过渡期（`Settings.RESPONSE_WRAPPER_MODE == "dual"`）：
- 新接口默认走新壳；
- 旧接口维持 `{detail, trace_id}` 旧壳，逐步迁移；
- `RESPONSE_WRAPPER_MODE = "off"` 完全关闭（保留旧壳）；
- `RESPONSE_WRAPPER_MODE = "on"`  全量切换（暂未启用，留作里程碑）。

任何业务接口若想走新壳，**仅需** `return ok({...})` / `raise BizException(...)`，
框架自动注入 `request_id`、设置 `X-Request-Id` 响应头。
"""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.bizcode import BizCode, get_meta, http_status_for, to_i18n_msg
from app.core.config import get_settings
from app.core.log import current_request_id as _ctx_request_id


def _json_default(obj: Any) -> Any:
    """json.dumps default 钩子：datetime/date → ISO 8601 字符串。

    与 Pydantic model_dump_json 输出格式一致，保证业务层直接把 ORM
    datetime 放进 ok(data=...) 时也能正确序列化（时间体系约定：DB 存 naive UTC）。
    """
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, date):
        return obj.isoformat()
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")


def _request_id() -> str:
    """当前请求的 request_id；未在请求上下文时返回 "-"（如启动期）。"""
    rid = _ctx_request_id()
    return rid if rid and rid != "-" else ""


def _envelope(code: int, message: Any, data: Any) -> dict:
    """构造响应壳；request_id 由 envelope_to_response 在序列化时注入。"""
    return {"code": code, "message": message, "data": data, "request_id": ""}


def _wrap_with_request_id(body: dict) -> dict:
    """在响应序列化那一刻注入 request_id，避免静态函数取到错误的 contextvar。"""
    rid = _request_id()
    if rid:
        body["request_id"] = rid
    return body


def _mode() -> str:
    """读取过渡模式；未配置默认 dual。"""
    return getattr(get_settings(), "RESPONSE_WRAPPER_MODE", "dual").lower()


class BizException(Exception):
    """业务异常：携带业务码 + i18n message params + 可选 data。

    使用方式：
        raise BizException(BizCode.NOT_FOUND)
        raise BizException(BizCode.NOT_FOUND, reason="Memo 不存在")
        raise BizException(BizCode.FORBIDDEN, params={"role": "editor"})
        raise BizException(BizCode.CONFLICT, data={"conflicting_id": 42})

    `reason`：面向用户的具体原因（已写好的可读文案），落在 `message.params.detail`，
    前端优先展示它；不传时前端按 `message.key` 翻译通用文案。**禁止**把异常对象、
    堆栈、SQL、第三方库原始报错塞进 reason。
    """

    def __init__(
        self,
        code: int,
        *,
        reason: str | None = None,
        params: dict[str, Any] | None = None,
        data: Any = None,
        http_status: int | None = None,
    ):
        super().__init__(f"BizException(code={code})")
        self.code = code
        self.params = dict(params or {})
        if reason:
            self.params["detail"] = reason
        self.data = data
        self.http_status = http_status or http_status_for(code)

    def to_envelope(self) -> dict:
        return _envelope(self.code, to_i18n_msg(self.code, **self.params), self.data)


class EnvelopeJSONResponse(JSONResponse):
    """序列化时自动注入 request_id / 设置 X-Request-Id 响应头。

    - `render()`：仅在 `request_id` 字段为空时，从 `request_id_var` contextvar 拿；
      若已被调用方（如 exception_handler）显式设置（解决跨 task contextvar 失效），则不覆盖。
    - `init_headers()`：从 contextvar 设 `X-Request-Id`；若显式传入 header 则保留。
    """

    def render(self, content: Any) -> bytes:
        if isinstance(content, dict) and {"code", "message", "data"}.issubset(content.keys()):
            if not content.get("request_id"):
                _wrap_with_request_id(content)
        # datetime-aware 序列化（业务层可能直接放 ORM datetime，见 _json_default）
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
            default=_json_default,
        ).encode("utf-8")

    def init_headers(self, headers: dict[str, str] | None = None) -> None:
        super().init_headers(headers)
        rid = _request_id()
        if rid:
            self.headers.setdefault("X-Request-Id", rid)


def ok(data: Any = None, message: str = "", code: int = 0) -> EnvelopeJSONResponse:
    """构造成功响应。`code` 默认 0；不推荐给成功响应指定非 0 code。"""
    # 规范要求成功响应 message 为字符串（i18n key 不出现在成功响应）
    if not isinstance(message, str):
        message = json.dumps(message, ensure_ascii=False) if message else ""
    body = _envelope(code, message, data)
    return EnvelopeJSONResponse(content=body, status_code=200)


def fail(
    code: int,
    *,
    reason: str | None = None,
    params: dict[str, Any] | None = None,
    data: Any = None,
    http_status: int | None = None,
) -> EnvelopeJSONResponse:
    """构造错误响应（不抛异常，直接返回 response object）。

    适用于中间件 / 装饰器等不能 raise 的场景。业务代码里**优先** `raise BizException(...)`。
    """
    merged = dict(params or {})
    if reason:
        merged["detail"] = reason
    message = to_i18n_msg(code, **merged)
    body = _envelope(code, message, data)
    return EnvelopeJSONResponse(
        content=body, status_code=http_status if http_status is not None else http_status_for(code)
    )


def wrapper_enabled() -> bool:
    """当前是否启用新壳。"""
    return _mode() in ("dual", "on")


__all__ = [
    "BizCode",
    "BizException",
    "EnvelopeJSONResponse",
    "fail",
    "ok",
    "wrapper_enabled",
]


# 兼容性：从 main.py / exceptions.py 中需要拿 request_id 时复用
def current_request_id() -> str:
    return _request_id()