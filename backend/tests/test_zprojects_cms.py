"""项目展示 CMS 接口回归测试（新壳 code/message/data/request_id）。

注：文件名以 z 开头，使本文件在 test_security / test_trace 之后执行——
全文件共享 session 级测试库，超管首次改密会改变初始态（同 test_zadmin_overview 约定）。

覆盖：
- 公开列表仅返回已发布项目，year 降序 + id 升序
- 公开详情：草稿/归档 404（新壳 1004）
- 管理端：未登录 401 / 创建（自动 slug project-{id}）/ 更新状态 / 删除
- 成功响应壳四字段齐全 + no-store（前端据标准 Date 头校准服务器时间的前提）
"""
from fastapi.testclient import TestClient

from tests.conftest import STRONG_ADMIN_PASSWORD, csrf, make_client

CREATE_BODY = {
    "title": "测试项目 Alpha",
    "description": "用于回归测试的项目",
    "tech_stack": ["Python", "FastAPI"],
    "github_url": "https://github.com/example/alpha",
    "screenshots": ["https://example.com/a.png"],
    "year": 2026,
    "leader": "张三",
    "content_md": "## 简介\n\n测试正文",
    "status": "published",
}


def _admin_client(app) -> tuple[TestClient, dict]:
    """登录超管（兼容其他用例已改过密码的情况），返回 (client, headers)。"""
    from tests.conftest import ADMIN_EMAIL
    username = ADMIN_EMAIL.split("@")[0]
    client = make_client(app)
    with client:  # 进 lifespan 跑 _init_db 建表
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


def _create(client, headers, **overrides) -> dict:
    body = {**CREATE_BODY, **overrides}
    res = client.post("/api/admin/projects", json=body, headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert res.json()["code"] == 0
    return data


def test_public_list_empty_ok(app):
    client = make_client(app)
    with client:
        pass
    res = client.get("/api/projects")
    assert res.status_code == 200
    body = res.json()
    assert body["code"] == 0 and body["message"] == ""
    assert isinstance(body["data"]["items"], list)
    # 前端以标准 Date 头校准服务器时间（Date 由 uvicorn 服务器层添加，TestClient 不经过它）；
    # 这里守住其前提：API 响应禁止缓存，否则浏览器缓存命中时 Date 是过期时间
    assert res.headers["cache-control"] == "no-store"
    assert "x-server-utc-time" not in res.headers


def test_admin_requires_auth(app):
    client = make_client(app)
    with client:
        pass
    # 无凭据请求：CSRF 中间件先于鉴权拦截（403），未携带 CSRF 头时不会到达 401
    res = client.post("/api/admin/projects", json=CREATE_BODY)
    assert res.status_code in (401, 403)


def test_create_list_detail_lifecycle(app):
    client, headers = _admin_client(app)

    # 已发布 + 草稿两个项目
    pub = _create(client, headers)
    draft = _create(client, headers, title="草稿项目", status="draft")
    assert pub["slug"].startswith("project-")   # 未指定 slug 自动生成
    assert draft["slug"].startswith("project-")

    # 公开列表仅含已发布项
    res = client.get("/api/projects")
    items = res.json()["data"]["items"]
    slugs = [i["slug"] for i in items]
    assert pub["slug"] in slugs
    assert draft["slug"] not in slugs
    # year 相同按 id 升序（与原 markdown 排序语义一致）
    assert slugs == [i["slug"] for i in sorted(items, key=lambda x: (-x["year"], x["id"]))]

    # 公开详情
    res = client.get(f"/api/projects/{pub['slug']}")
    assert res.status_code == 200
    assert res.json()["data"]["content_md"] == CREATE_BODY["content_md"]

    # 草稿详情 → 新壳 404
    res = client.get(f"/api/projects/{draft['slug']}")
    assert res.status_code == 404
    assert res.json()["code"] == 1004
    assert "request_id" in res.json()

    # 更新为 archived → 公开消失
    res = client.put(f"/api/admin/projects/{pub['id']}",
                     json={"status": "archived"}, headers=headers)
    assert res.status_code == 200
    res = client.get(f"/api/projects/{pub['slug']}")
    assert res.status_code == 404

    # slug 冲突
    other = _create(client, headers, title="另一个", status="published")
    res = client.put(f"/api/admin/projects/{other['id']}",
                     json={"slug": draft["slug"]}, headers=headers)
    assert res.status_code == 409
    assert res.json()["code"] == 1005

    # 删除 → 管理详情 404
    res = client.delete(f"/api/admin/projects/{other['id']}", headers=headers)
    assert res.status_code == 200
    res = client.get(f"/api/admin/projects/{other['id']}", headers=headers)
    assert res.status_code == 404

    # 清理本次创建的行，避免影响其他用例
    for pid in (pub["id"], draft["id"], other["id"]):
        client.delete(f"/api/admin/projects/{pid}", headers=headers)
