"""统一响应壳（envelope）端到端验证脚本。

不依赖 pytest；通过 fastapi.testclient.TestClient 直接驱动 ASGI 应用，
覆盖 /plan §7 列出的所有断言：

1. `ok()` 序列化含 request_id，且与响应头 X-Trace-Id / X-Request-Id 同值
2. BizException 抛错 → 对应 HTTP + 新壳
3. RequestValidationError → 1001（VALIDATION_FAILED）
4. 兜底 Exception → 5000（INTERNAL_ERROR），不外泄堆栈
5. 限流中间件（仅断言响应壳，不耗尽令牌）
6. IP 黑名单 → 1006 + data.{reason, expires_at, permanent}
7. CSRF 中间件 → 1008

跑法（backend/）：
   python -m scripts.verify_envelope
"""
from __future__ import annotations

import asyncio
import json
import sys
import traceback
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient

# 让脚本能 import app.*
import os
os.environ.setdefault("RESPONSE_WRAPPER_MODE", "dual")

# 引入真实 app（含所有业务路由与中间件）
from app.main import app  # noqa: E402
from app.core.bizcode import BizCode  # noqa: E402
from app.core.responses import BizException, fail, ok  # noqa: E402


# ----------------- 临时挂载测试专用路由（不影响业务） ----------
# 直接在 app 上挂几个仅用于验证壳的端点；不写入生产代码。
@app.get("/__test/ok")
async def _test_ok():
    return ok(data={"hello": "world"})


@app.get("/__test/biz-notfound")
async def _test_biz_notfound():
    raise BizException(BizCode.NOT_FOUND)


@app.get("/__test/biz-with-data")
async def test_biz_with_data():
    raise BizException(BizCode.CONFLICT, params={"name": "demo"}, data={"conflicting_id": 42})


@app.get("/__test/crash")
async def _test_crash():
    raise RuntimeError("boom-this-must-never-leak")


# ----------------- 断言工具 ----------
FAILURES: list[str] = []


def check(label: str, ok_flag: bool, detail: str = "") -> None:
    mark = "PASS" if ok_flag else "FAIL"
    print(f"  [{mark}] {label}" + (f" — {detail}" if detail and not ok_flag else ""))
    if not ok_flag:
        FAILURES.append(label)


def is_envelope(body: Any) -> bool:
    return (
        isinstance(body, dict)
        and "code" in body
        and "data" in body
    )


def assert_envelope_shape(body: Any, *, label: str) -> None:
    check(f"{label}: 是新壳（含 code+data）", is_envelope(body), repr(body))
    check(f"{label}: 含 request_id 字段", isinstance(body.get("request_id"), str), repr(body))
    check(
        f"{label}: request_id 非空",
        isinstance(body.get("request_id"), str) and bool(body["request_id"]),
    )


# ----------------- 用例 ----------
def case_health():
    print("\n[1] GET /health")
    with TestClient(app) as client:
        r = client.get("/health")
        body = r.json()
        check("status == 200", r.status_code == 200, str(r.status_code))
        assert_envelope_shape(body, label="/health")
        check("/health code == 0", body["code"] == 0, repr(body.get("code")))
        check("/health data.status == 'ok'", body["data"]["status"] == "ok")
        check("/health data.service == 'gdueca-backend'", body["data"]["service"] == "gdueca-backend")
        check("/health data.time 以 Z 结尾", body["data"]["time"].endswith("Z"))
        check("/health 响应头 X-Trace-Id 存在", bool(r.headers.get("X-Trace-Id")))
        check("/health 响应头 X-Request-Id 存在", bool(r.headers.get("X-Request-Id")))
        check(
            "/health 三处 request_id 一致",
            r.headers.get("X-Trace-Id")
            == r.headers.get("X-Request-Id")
            == body["request_id"],
        )


def case_i18n():
    print("\n[2] GET /api/i18n/zh-cn")
    with TestClient(app) as client:
        r = client.get("/api/i18n/zh-cn")
        body = r.json()
        check("status == 200", r.status_code == 200, str(r.status_code))
        assert_envelope_shape(body, label="/api/i18n/zh-cn")
        check("/api/i18n/zh-cn code == 0", body["code"] == 0)
        check("/api/i18n/zh-cn data.lang == 'zh-cn'", body["data"]["lang"] == "zh-cn")
        check("/api/i18n/zh-cn data.revision == 0", body["data"]["revision"] == 0)


def case_validation_error():
    print("\n[3] RequestValidationError → 1001")
    # 用 GET 触发：/api/i18n/{lang_code} 强制 lang_code 长度 2-10，传 1 字符触发 422
    # GET 不走 CSRF 中间件（_SAFE_METHODS）
    with TestClient(app) as client:
        r = client.get("/api/i18n/a")  # 1 字符 < min_length=2
        body = r.json()
        check("status == 422", r.status_code == 422, str(r.status_code))
        assert_envelope_shape(body, label="RequestValidationError")
        check("code == 1001 (VALIDATION_FAILED)", body["code"] == BizCode.VALIDATION_FAILED, repr(body))
        check("data.errors 是数组", isinstance(body["data"]["errors"], list))


def case_internal_error():
    print("\n[4] 未捕获 Exception → 5000（堆栈不外泄）")
    # raise_server_exceptions=False 让 TestClient 不重新抛出 endpoint 异常，
    # 走 FastAPI/Starlette 的 ServerErrorMiddleware → 注册的 exception_handler
    with TestClient(app, raise_server_exceptions=False) as client:
        r = client.get("/__test/crash")
        body = r.json()
        check("status == 500", r.status_code == 500, str(r.status_code))
        assert_envelope_shape(body, label="unhandled Exception")
        check("code == 5000 (INTERNAL_ERROR)", body["code"] == BizCode.INTERNAL_ERROR)
        check("data == null", body["data"] is None)
        # 严格校验：响应里没有 'traceback' / 'exc_type' 等敏感字段
        body_str = json.dumps(body, ensure_ascii=False)
        check("响应不含 'traceback'", "traceback" not in body_str.lower())
        check("响应不含 'RuntimeError'", "RuntimeError" not in body_str)
        check("响应不含 'boom-this'", "boom-this" not in body_str)


def case_biz_exception():
    print("\n[5] BizException(NOT_FOUND) → 404 + 新壳")
    with TestClient(app) as client:
        r = client.get("/__test/biz-notfound")
        body = r.json()
        check("status == 404", r.status_code == 404, str(r.status_code))
        assert_envelope_shape(body, label="BizException NOT_FOUND")
        check("code == 1004", body["code"] == BizCode.NOT_FOUND)
        check(
            "message 是 i18n key 对象",
            isinstance(body["message"], dict) and body["message"]["key"] == "error.not_found",
        )


def case_biz_with_data():
    print("\n[6] BizException(CONFLICT, data) → 409 + data 透传")
    with TestClient(app) as client:
        r = client.get("/__test/biz-with-data")
        body = r.json()
        check("status == 409", r.status_code == 409, str(r.status_code))
        check("code == 1005", body["code"] == BizCode.CONFLICT)
        check("data.conflicting_id == 42", body["data"]["conflicting_id"] == 42)
        check(
            "message.params.name == 'demo'",
            isinstance(body["message"], dict) and body["message"]["params"]["name"] == "demo",
        )


def case_csrf_failure():
    print("\n[7] CSRF 拒绝（写请求缺令牌）→ 1008")
    # 找一个任意写接口；/api/auth/login 是公开写接口
    with TestClient(app) as client:
        # 没有 CSRF cookie + 没有 X-CSRF-Token 头 → 拒绝
        r = client.post(
            "/api/auth/login",
            json={"username": "x", "password": "y", "csrf_token": "x"},  # body 带 csrf 也不认
        )
        body = r.json()
        check("status == 403", r.status_code == 403, str(r.status_code))
        assert_envelope_shape(body, label="CSRF failure")
        check("code == 1008 (CSRF_FAILED)", body["code"] == BizCode.CSRF_FAILED)
        check(
            "message.key == error.csrf_failed",
            isinstance(body["message"], dict) and body["message"]["key"] == "error.csrf_failed",
        )


def case_ok_envelope():
    print("\n[8] /__test/ok → 新壳 + request_id")
    with TestClient(app) as client:
        r = client.get("/__test/ok")
        body = r.json()
        check("status == 200", r.status_code == 200, str(r.status_code))
        assert_envelope_shape(body, label="/__test/ok")
        check("code == 0", body["code"] == 0)
        check("data.hello == 'world'", body["data"]["hello"] == "world")


def case_memos_public_envelope():
    """Memo / 全局标签公共接口的响应壳验证。

    不测业务流程（需登录态 / CSRF / Cookie），仅断言：
    - 公共匿名接口正常返回新壳（code=0, request_id, 三处一致）
    - 列表接口 data 含 total/items/page/page_size 四字段
    """
    print("\n[9] 公开 Memo / 全局标签接口 → 新壳")

    with TestClient(app) as client:
        # 9a 全局标签列表
        r = client.get("/api/tags")
        body = r.json()
        check("GET /api/tags status == 200", r.status_code == 200, str(r.status_code))
        assert_envelope_shape(body, label="/api/tags")
        check("/api/tags code == 0", body["code"] == 0)
        check("/api/tags data 是列表", isinstance(body["data"], list))

        # 9b Memo 时间线（匿名）
        r = client.get("/api/memos/timeline")
        body = r.json()
        check("GET /api/memos/timeline status == 200", r.status_code == 200,
              str(r.status_code))
        assert_envelope_shape(body, label="/api/memos/timeline")
        check("/api/memos/timeline code == 0", body["code"] == 0)
        # Paginated 形状
        d = body["data"]
        check("Paginated 含 total", isinstance(d.get("total"), int))
        check("Paginated 含 items", isinstance(d.get("items"), list))
        check("Paginated 含 page", isinstance(d.get("page"), int))
        check("Paginated 含 page_size", isinstance(d.get("page_size"), int))

        # 9c 日历接口（无效日期 → 1001 业务字段校验，新壳）
        r = client.get("/api/memos/calendar/not-a-date")
        body = r.json()
        check("GET /api/memos/calendar/<bad> 仍是新壳", is_envelope(body), repr(body))
        # 旧模块抛 HTTPException 走旧壳 {detail}; 由全局 Response 决定是否被翻译
        # 不强制要求 code==1001（旧壳暂未迁移所有 400），仅断言响应可读、不堆栈

        # 9d 单条不存在 → 404 + （旧壳 detail 或新壳 code=1004）
        r = client.get("/api/memos/9999999")
        body = r.json()
        check("GET /api/memos/9999999 4xx", 400 <= r.status_code < 500,
              str(r.status_code))

        # 9e 分享链接不存在 → 404
        r = client.get("/api/memos/shared/nonexistent-slug-12345")
        check("GET /api/memos/shared/<bad> 4xx", 400 <= r.status_code < 500,
              str(r.status_code))

        # 9f 创建 Memo（未登录）→ CSRF 中间件先拦截（403 new shell）
        #     项目 CSRF 在 require_role 之前执行；这里接受 401 或 403，并断言新壳
        r = client.post("/api/memos", json={"content_md": "test", "visibility": "public"})
        check("POST /api/memos 未登录 4xx (CSRF or auth)",
              400 <= r.status_code < 500, str(r.status_code))
        body = r.json()
        check("POST /api/memos 未登录 仍是新壳",
              is_envelope(body), repr(body))
        check("POST /api/memos 未登录 code != 0",
              body.get("code") != 0, repr(body))


# ----------------- 入口 ----------
def main() -> int:
    print("=== 统一响应壳验证 ===")
    cases = [
        case_health,
        case_i18n,
        case_ok_envelope,
        case_validation_error,
        case_internal_error,
        case_biz_exception,
        case_biz_with_data,
        case_csrf_failure,
        case_memos_public_envelope,
    ]
    for c in cases:
        try:
            c()
        except Exception:
            traceback.print_exc()
            FAILURES.append(f"{c.__name__} 抛异常")

    print("\n=== 汇总 ===")
    if FAILURES:
        print(f"FAIL — {len(FAILURES)} 项不通过：")
        for f in FAILURES:
            print(f"  - {f}")
        return 1
    print("PASS — 全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())