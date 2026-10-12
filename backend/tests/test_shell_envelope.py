"""统一响应壳兜底回归：旧壳 HTTPException 全局转新壳。

覆盖 SPEC §一.5（全站统一响应体）/ §一.6（全局统一异常体系）：
错误路径 100% 新壳化后，前端只按 code 分支、message 仅作展示——
- code / message.key 与 bizcode.py 登记表一致
- message.params.detail 保留原可读文案（渐进 i18n 兜底展示）
- request_id 注入响应体且与 X-Request-Id 头同值
- 自定义 headers（X-Password-Change-Required 等）原样透传（前端守卫依赖）
"""
import asyncio

from fastapi.testclient import TestClient

from tests.conftest import ADMIN_EMAIL, STRONG_ADMIN_PASSWORD, csrf, make_client

ADMIN_USERNAME = ADMIN_EMAIL.split("@")[0]


def _login(client: TestClient, username: str, password: str, **extra):
    return client.post(
        "/api/auth/login",
        json={"username": username, "password": password, **extra},
        headers=csrf(client),
    )


def _admin_headers(app) -> tuple[TestClient, dict]:
    """登录超管并完成首次改密，返回 (client, csrf 头)。"""
    client = make_client(app)
    with client:  # 触发 lifespan（建库 + 初始数据）；本模块按字母序为会话首个模块
        pass
    res = _login(client, ADMIN_USERNAME, STRONG_ADMIN_PASSWORD)
    if res.status_code == 401:  # 更早的用例已完成首次改密
        res = _login(client, ADMIN_USERNAME, STRONG_ADMIN_PASSWORD + "2")
    assert res.status_code == 200, res.text
    headers = {"X-CSRF-Token": res.json()["csrf_token"]}
    if res.json().get("must_change_password"):
        r = client.post("/api/auth/change-password", headers=headers, json={
            "old_password": STRONG_ADMIN_PASSWORD, "new_password": STRONG_ADMIN_PASSWORD + "2",
        })
        assert r.status_code == 200, r.text
    return client, headers


def test_unauthorized_new_shell(app):
    r = make_client(app).get("/api/auth/me")
    assert r.status_code == 401
    body = r.json()
    assert body["code"] == 1002
    assert body["message"]["key"] == "error.unauthorized"
    assert body["message"]["params"]["detail"] == "未登录或登录已失效"
    assert body["data"] is None
    assert body["request_id"]
    assert r.headers.get("x-request-id") == body["request_id"]


def test_unknown_route_new_shell(app):
    """Starlette 路由 404（detail="Not Found"）同样走新壳。"""
    r = make_client(app).get("/api/definitely-not-a-route")
    assert r.status_code == 404
    body = r.json()
    assert body["code"] == 1004
    assert body["message"]["key"] == "error.not_found"
    assert body["message"]["params"]["detail"] == "Not Found"
    assert body["request_id"]


def test_business_404_new_shell(app):
    client, headers = _admin_headers(app)
    r = client.post("/api/activities", headers=headers,
                    json={"title": "响应壳草稿", "content": "x", "category": "讲座", "status": "draft"})
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    resp = make_client(app).get(f"/api/activities/{aid}")
    assert resp.status_code == 404
    body = resp.json()
    assert body["code"] == 1004
    assert body["message"]["key"] == "error.not_found"
    assert body["message"]["params"]["detail"]  # 业务中文文案保留在 params.detail


def test_validation_error_new_shell(app):
    client = make_client(app)
    r = client.post("/api/registrations/club", headers=csrf(client), json={"name": "张三"})
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == 1001
    assert body["message"]["key"] == "error.validation_failed"
    assert isinstance(body["data"]["errors"], list)


def test_permission_403_new_shell(app):
    client, headers = _admin_headers(app)
    r = client.post("/api/auth/users", headers=headers, json={
        "username": "envmember", "email": "envmember@gdue-ca.cn", "password": "Env#Member-2025",
        "role": "member", "student_id": "20251001", "real_name": "响应壳测试", "phone": "+8613800000010",
    })
    assert r.status_code == 201, r.text
    m = make_client(app)
    res = _login(m, "envmember", "Env#Member-2025")
    assert res.status_code == 200, res.text
    resp = m.get("/api/auth/users")
    assert resp.status_code == 403
    body = resp.json()
    assert body["code"] == 1003
    assert body["message"]["key"] == "error.forbidden"
    assert body["message"]["params"]["detail"] == "权限不足"


def test_login_blocked_new_shell(app):
    """防信息泄露：阶梯封禁期内的登录失败对外统一 401 + code 1013「用户名或密码错误」。"""
    client, headers = _admin_headers(app)
    r = client.post("/api/auth/users", headers=headers, json={
        "username": "envlock", "email": "envlock@gdue-ca.cn", "password": "Env#Lock-2025zz",
        "role": "member", "student_id": "20251002", "real_name": "锁定壳测试", "phone": "+8613800000011",
    })
    assert r.status_code == 201, r.text
    anon = make_client(app)
    for _ in range(5):  # 普通账号阶梯阶段0：5 次错误触发首次封禁
        assert _login(anon, "envlock", "wrong-password").status_code == 401
    resp = _login(anon, "envlock", "Env#Lock-2025zz")
    assert resp.status_code == 401
    body = resp.json()
    assert body["code"] == 1013
    assert body["message"]["key"] == "error.login_blocked"
    assert body["message"]["params"]["detail"] == "用户名或密码错误"


def test_rate_limited_429_new_shell(app):
    anon = make_client(app)
    resp = None
    for _ in range(15):  # login 限流 10 次/分钟，未命中用户不会锁定
        resp = _login(anon, "ghost-user-xyz", "whatever-Pass1!")
        if resp.status_code == 429:
            break
    assert resp.status_code == 429
    body = resp.json()
    assert body["code"] == 1007
    assert body["message"]["key"] == "error.rate_limited"


def test_custom_headers_passthrough(app):
    """403 + X-Password-Change-Required 自定义头原样透传（前端跳转守卫依赖）。"""
    client, headers = _admin_headers(app)

    async def _set_flag(flag: bool):
        from sqlalchemy import update
        from app.db.models import User
        from app.db.session import async_session
        async with async_session() as s:
            await s.execute(
                update(User).where(User.email == ADMIN_EMAIL).values(must_change_password=flag)
            )
            await s.commit()

    async def _current_flag() -> bool:
        from sqlalchemy import select
        from app.db.models import User
        from app.db.session import async_session
        async with async_session() as s:
            user = (await s.execute(
                select(User).where(User.email == ADMIN_EMAIL)
            )).scalar_one()
            return bool(user.must_change_password)

    original = asyncio.run(_current_flag())
    asyncio.run(_set_flag(True))
    try:
        resp = client.get("/api/auth/users")
        assert resp.status_code == 403
        assert resp.headers.get("x-password-change-required") == "1"
        body = resp.json()
        assert body["code"] == 1003
        assert body["message"]["key"] == "error.forbidden"
        assert body["message"]["params"]["detail"] == "请先修改初始密码"
    finally:
        if original:
            asyncio.run(_set_flag(True))
        else:
            asyncio.run(_set_flag(False))


def test_csrf_rejection_still_new_shell(app):
    """CSRF 中间件直接走 fail()（code=1008），兜底处理器不得影响该路径。"""
    client, headers = _admin_headers(app)
    r = client.put("/api/auth/profile", json={"real_name": "壳测试"})
    assert r.status_code == 403
    body = r.json()
    assert body["code"] == 1008
    assert body["message"]["key"] == "error.csrf_failed"
