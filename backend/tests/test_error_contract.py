"""前后端错误契约回归：错误码表 / i18n key / 校验错误投影三者对齐。

- 前端 `types/response.ts` 的 BizCode 必须与后端 `bizcode.BizCode` 逐值一致；
- 每个错误码的 i18n_key、每个 FieldReason 的翻译 key 必须在 zh-cn / en-us 字典中存在；
- 参数校验失败的响应体不得出现 pydantic 原始字段（msg / input / ctx / type / loc）。
"""
import json
import re
from pathlib import Path

import pytest
from fastapi.exceptions import RequestValidationError

from app.core.bizcode import BizCode, _BIZCODE_REGISTRY
from app.core.validation_errors import FieldReason, sanitize_validation_errors
from tests.conftest import make_client

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
RESPONSE_TS = FRONTEND / "types" / "response.ts"
MESSAGES = FRONTEND / "i18n" / "messages"

needs_frontend = pytest.mark.skipif(not RESPONSE_TS.exists(), reason="frontend 源码不在本工作区")


def _lookup(messages: dict, key: str):
    node = messages
    for part in key.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def _frontend_bizcodes() -> dict[str, int]:
    src = RESPONSE_TS.read_text(encoding="utf-8")
    block = re.search(r"export const BizCode = \{(.*?)\} as const", src, re.S)
    assert block, "types/response.ts 中找不到 BizCode 常量"
    return {k: int(v) for k, v in re.findall(r"(\w+):\s*(\d+)", block.group(1))}


@needs_frontend
def test_frontend_bizcode_matches_backend():
    def camel(name: str) -> str:
        return "".join(p.capitalize() for p in name.lower().split("_"))

    backend = {camel(c.name): int(c) for c in BizCode}
    frontend = _frontend_bizcodes()
    assert frontend.pop("Ok") == 0
    assert frontend == backend


@needs_frontend
@pytest.mark.parametrize("locale", ["zh-cn", "en-us"])
def test_error_i18n_keys_exist(locale):
    messages = json.loads((MESSAGES / f"{locale}.json").read_text(encoding="utf-8"))
    keys = [meta.i18n_key for meta in _BIZCODE_REGISTRY.values()]
    keys += [f"error.validation.reason.{r.value}" for r in FieldReason]
    keys += ["error.validation.withField", "error.validation.generic"]
    missing = [k for k in keys if not isinstance(_lookup(messages, k), str)]
    assert not missing, f"{locale} 缺少错误文案：{missing}"


def test_sanitize_strips_pydantic_internals():
    exc = RequestValidationError([
        {"type": "string_pattern_mismatch", "loc": ("path", "receipt_code"),
         "msg": "String should match pattern '^x$'", "input": "123", "ctx": {"pattern": "^x$"}},
        {"type": "string_too_short", "loc": ("body", "password"),
         "msg": "String should have at least 8 characters", "input": "hunter2",
         "ctx": {"min_length": 8}},
        {"type": "value_error", "loc": ("body",), "msg": "Value error, 两次输入的密码不一致",
         "input": {}, "ctx": {"error": ValueError("两次输入的密码不一致")}},
        {"type": "value_error", "loc": ("body", "email"),
         "msg": "value is not a valid email address: An email address must have an @-sign.",
         "input": "x", "ctx": {"reason": "An email address must have an @-sign."}},
        {"type": "int_parsing", "loc": ("query", "page"), "msg": "...", "input": "a"},
    ])
    out = sanitize_validation_errors(exc)
    assert out == [
        {"field": "receipt_code", "reason": "invalid_format"},
        {"field": "password", "reason": "too_short", "params": {"min": 8}},
        {"field": "", "reason": "invalid", "message": "两次输入的密码不一致"},
        {"field": "email", "reason": "invalid"},
        {"field": "page", "reason": "invalid_type"},
    ]
    dumped = json.dumps(out, ensure_ascii=False)
    for leaked in ("hunter2", "pattern", "String should", "@-sign", "123"):
        assert leaked not in dumped


def test_receipt_query_validation_response(app):
    r = make_client(app).get("/api/query/123")
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == BizCode.VALIDATION_FAILED
    assert body["message"] == {"key": "error.validation_failed"}
    assert body["data"] == {"errors": [{"field": "receipt_code", "reason": "invalid_format"}]}
    assert body["request_id"]
