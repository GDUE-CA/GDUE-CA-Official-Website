"""账号批量启停回归测试：POST /api/auth/users/batch。

注：文件名以 z 开头，使本文件在 test_security / test_trace 之后执行——
全文件共享 session 级测试库，超管首次改密会改变初始态（同 test_zmembers_import 约定）。
"""
from tests.conftest import csrf, make_client
from tests.test_security import _admin_client


def _create_member(client, headers, tag: str) -> int:
    r = client.post("/api/auth/users", headers={**headers, **csrf(client)}, json={
        "username": f"batch{tag}", "email": f"batch{tag}@gdue-ca.cn",
        "password": "Bt#ch-2025xyz", "role": "member",
        "student_id": f"2025{tag}", "real_name": f"批量{tag}", "phone": "+861380000000",
    })
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_users_batch_toggle(app):
    client, headers = _admin_client(app)
    a = _create_member(client, headers, "a1")
    b = _create_member(client, headers, "b1")
    r = client.post("/api/auth/users/batch", headers={**headers, **csrf(client)},
                    json={"ids": [a, b, 999999], "is_active": False})
    assert r.status_code == 200, r.text
    assert r.json() == {"updated": 2, "not_found": [999999]}
    off = client.get("/api/auth/users?is_active=false", headers=headers).json()
    assert {a, b} <= {u["id"] for u in off}
    r = client.post("/api/auth/users/batch", headers={**headers, **csrf(client)},
                    json={"ids": [a, b], "is_active": True})
    assert r.json() == {"updated": 2, "not_found": []}


def test_users_batch_rejects_self(app):
    client, headers = _admin_client(app)
    me = client.get("/api/auth/me", headers=headers).json()
    r = client.post("/api/auth/users/batch", headers={**headers, **csrf(client)},
                    json={"ids": [me["id"]], "is_active": False})
    assert r.status_code == 400
    me2 = client.get("/api/auth/me", headers=headers).json()
    assert me2["is_active"] is True


def test_users_batch_unauthenticated_is_401(app):
    client = make_client(app)
    with client:
        pass
    r = client.post("/api/auth/users/batch", json={"ids": [1], "is_active": False})
    # 未登录且无 CSRF：CSRF 中间件 403 先于鉴权 401（同 test_zmembers_import 惯例）
    assert r.status_code in (401, 403)
