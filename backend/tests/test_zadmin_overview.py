"""仪表盘聚合接口回归测试：GET /api/admin-stats/overview 一次返回全部待办计数。

注：文件名以 z 开头，使本文件在 test_security / test_trace 之后执行——
全文件共享 session 级测试库，超管首次改密会改变初始态（同 test_zmembers_import 约定）。"""
from fastapi.testclient import TestClient

from tests.conftest import STRONG_ADMIN_PASSWORD, csrf, make_client


def _admin_client(app) -> tuple[TestClient, dict]:
    """登录超管（兼容其他用例已改过密码的情况），返回 (client, headers)。"""
    from tests.conftest import ADMIN_EMAIL
    username = ADMIN_EMAIL.split("@")[0]
    client = make_client(app)
    with client:  # 进 lifespan 跑 _init_db 建表（同 test_security 模式）
        pass
    res = client.post(
        "/api/auth/login",
        json={"username": username, "password": STRONG_ADMIN_PASSWORD},
        headers=csrf(client),
    )
    if res.status_code == 401:
        res = client.post(
            "/api/auth/login",
            json={"username": username, "password": STRONG_ADMIN_PASSWORD + "2"},
            headers=csrf(client),
        )
    assert res.status_code == 200, res.text
    headers = {"X-CSRF-Token": res.json()["csrf_token"]}
    if res.json()["must_change_password"]:
        r = client.post("/api/auth/change-password", headers=headers, json={
            "old_password": STRONG_ADMIN_PASSWORD,
            "new_password": STRONG_ADMIN_PASSWORD + "2",
        })
        assert r.status_code == 200, r.text
    return client, headers


def test_overview_unauthenticated_is_401(app):
    client = make_client(app)
    with client:  # 进 lifespan 建表，否则鉴权查 users 直接 500
        pass
    r = client.get("/api/admin-stats/overview")
    assert r.status_code == 401


def test_overview_shape(app):
    client, headers = _admin_client(app)
    r = client.get("/api/admin-stats/overview", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("activities_total", "registrations_total", "registrations_pending", "bugs_open", "resets_pending"):
        assert key in body, f"missing {key}: {body}"
        assert isinstance(body[key], int)
