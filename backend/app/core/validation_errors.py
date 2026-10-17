"""Pydantic 校验错误 → 对外安全的字段错误（白名单投影）。

为什么不能直接吐 `exc.errors()`：
- `input` 原样回显用户输入（密码 / 令牌也会被回显）；
- `msg` / `ctx.pattern` / `type` 暴露 pydantic 版本、内部正则与实现细节；
- `loc` 带 `body` / `query` / `path` 等框架层前缀，前端用不上。

对外只给 `{field, reason, params?, message?}`：
- `field`：去掉位置前缀的字段路径（`items.0.name`），供前端定位表单项；
- `reason`：封闭枚举 `FieldReason`，前端按 `error.validation.reason.<reason>` 翻译；
- `params`：仅白名单数值约束（min / max），用于拼「不能少于 {min} 个字符」；
- `message`：仅当错误来自我们自己写的 `raise ValueError("中文文案")` 时携带（见 `_custom_message`）。

原始错误（type + loc，不含 input）只写服务端日志，用 request_id 关联排查。
"""
from __future__ import annotations

import re
from enum import StrEnum
from typing import Any

from fastapi.exceptions import RequestValidationError


class FieldReason(StrEnum):
    REQUIRED = "required"
    TOO_SHORT = "too_short"
    TOO_LONG = "too_long"
    INVALID_FORMAT = "invalid_format"
    INVALID_TYPE = "invalid_type"
    OUT_OF_RANGE = "out_of_range"
    INVALID_CHOICE = "invalid_choice"
    MALFORMED_BODY = "malformed_body"
    INVALID = "invalid"


# pydantic error type → FieldReason（未列出的统一落 INVALID）
_TYPE_TO_REASON: dict[str, FieldReason] = {
    "missing": FieldReason.REQUIRED,
    "string_too_short": FieldReason.TOO_SHORT,
    "too_short": FieldReason.TOO_SHORT,
    "bytes_too_short": FieldReason.TOO_SHORT,
    "string_too_long": FieldReason.TOO_LONG,
    "too_long": FieldReason.TOO_LONG,
    "bytes_too_long": FieldReason.TOO_LONG,
    "string_pattern_mismatch": FieldReason.INVALID_FORMAT,
    "url_parsing": FieldReason.INVALID_FORMAT,
    "url_scheme": FieldReason.INVALID_FORMAT,
    "url_syntax_violation": FieldReason.INVALID_FORMAT,
    "uuid_parsing": FieldReason.INVALID_FORMAT,
    "date_parsing": FieldReason.INVALID_FORMAT,
    "date_from_datetime_parsing": FieldReason.INVALID_FORMAT,
    "datetime_parsing": FieldReason.INVALID_FORMAT,
    "datetime_from_date_parsing": FieldReason.INVALID_FORMAT,
    "time_parsing": FieldReason.INVALID_FORMAT,
    "ip_any_address": FieldReason.INVALID_FORMAT,
    "ip_v4_address": FieldReason.INVALID_FORMAT,
    "ip_v6_address": FieldReason.INVALID_FORMAT,
    "greater_than": FieldReason.OUT_OF_RANGE,
    "greater_than_equal": FieldReason.OUT_OF_RANGE,
    "less_than": FieldReason.OUT_OF_RANGE,
    "less_than_equal": FieldReason.OUT_OF_RANGE,
    "multiple_of": FieldReason.OUT_OF_RANGE,
    "literal_error": FieldReason.INVALID_CHOICE,
    "enum": FieldReason.INVALID_CHOICE,
    "json_invalid": FieldReason.MALFORMED_BODY,
    "model_attributes_type": FieldReason.MALFORMED_BODY,
}

# *_type / *_parsing 一族（int_parsing、string_type、dict_type…）统一视为类型错误
_TYPE_SUFFIXES = ("_type", "_parsing")

# 白名单约束参数：pydantic ctx 键 → 对外 params 键
_CTX_PARAMS: dict[str, str] = {
    "min_length": "min",
    "max_length": "max",
    "gt": "min",
    "ge": "min",
    "lt": "max",
    "le": "max",
}

# loc 第一段是参数位置，不属于字段路径
_LOCATION_PREFIXES = {"body", "query", "path", "header", "cookie", "form"}

_CJK = re.compile(r"[一-鿿]")


def _reason_for(err_type: str) -> FieldReason:
    if err_type in _TYPE_TO_REASON:
        return _TYPE_TO_REASON[err_type]
    if err_type.endswith(_TYPE_SUFFIXES):
        return FieldReason.INVALID_TYPE
    return FieldReason.INVALID


def _field_path(loc: tuple | list) -> str:
    parts = list(loc)
    if parts and parts[0] in _LOCATION_PREFIXES:
        parts = parts[1:]
    return ".".join(str(p) for p in parts)


def _params_for(ctx: Any) -> dict[str, int | float]:
    if not isinstance(ctx, dict):
        return {}
    out: dict[str, int | float] = {}
    for src, dst in _CTX_PARAMS.items():
        val = ctx.get(src)
        # bool 是 int 子类，显式排除；只放纯数值，杜绝任何字符串回显
        if isinstance(val, (int, float)) and not isinstance(val, bool):
            out[dst] = val
    return out


def _custom_message(err: dict) -> str | None:
    """只透出业务 validator 主动 `raise ValueError("中文文案")` 的文案。

    `value_error` 同时也是 email-validator、第三方库内部 ValueError 的类型，
    其英文 msg 属于实现细节。项目约定业务校验文案一律中文，因此以「含中日韩
    统一表意文字」作为「人写的业务文案」判据；不满足的一律丢弃。
    """
    if err.get("type") not in ("value_error", "assertion_error"):
        return None
    ctx = err.get("ctx") or {}
    raw = ctx.get("error") if isinstance(ctx, dict) else None
    text = str(raw) if raw is not None else str(err.get("msg", ""))
    text = re.sub(r"^(Value|Assertion) error,\s*", "", text).strip()
    return text if text and _CJK.search(text) else None


def sanitize_validation_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    """把 RequestValidationError 投影成对外安全的字段错误列表。"""
    out: list[dict[str, Any]] = []
    for err in exc.errors():
        item: dict[str, Any] = {
            "field": _field_path(err.get("loc", ())),
            "reason": _reason_for(str(err.get("type", ""))).value,
        }
        params = _params_for(err.get("ctx"))
        if params:
            item["params"] = params
        message = _custom_message(err)
        if message:
            item["message"] = message
        out.append(item)
    return out


def describe_for_log(exc: RequestValidationError) -> str:
    """服务端日志用摘要：只含 type 与 loc，绝不记录 input（可能是密码 / 令牌）。"""
    return "; ".join(
        f"{'.'.join(str(p) for p in err.get('loc', ()))}:{err.get('type')}"
        for err in exc.errors()
    )
