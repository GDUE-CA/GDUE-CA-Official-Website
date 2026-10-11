"""P0 差距补齐回归测试（z 前缀保证在 session 共享库的既有用例之后执行）。

覆盖：
- /api/admin/* 全局强制门：匿名 401（新壳 1002）/ member 角色 403（1003）
- 用户详情接口 GET /api/auth/users/{id}：200 / 404 / member 403
- 用户列表可选分页：page 参数返回 {items,total,page,page_size}
- 实时业务状态 runtime_status：五态计算（不存库）
- 头像上传 80% 压缩：压缩后体积下降
- 媒体上传：SVG（XSS 载体）拒绝 415；伪装图片内容拒绝 415
- PUT /api/auth/me 规范别名路由
"""
import io
from pathlib import Path

from fastapi.testclient import TestClient

from tests.conftest import ADMIN_EMAIL, STRONG_ADMIN_PASSWORD, csrf, make_client

MEMBER_PWD = "Gd#Ca-Member!1"


def _admin_client(app) -> tuple[TestClient, dict]:
    from tests.conftest import ADMIN_EMAIL as EMAIL
    username = EMAIL.split("@")[0]
    client = make_client(app)
    with client:
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


def _member_client(app, username: str) -> tuple[TestClient, dict]:
    client = make_client(app)
    with client:
        pass
    res = client.post("/api/auth/register", json={
        "username": username,
        "display_name": username,
        "password": MEMBER_PWD,
        "confirm_password": MEMBER_PWD,
    }, headers=csrf(client))
    assert res.status_code in (201, 400), res.text  # 400 = 重复注册（可复跑）
    res = client.post("/api/auth/login", json={
        "username": username, "password": MEMBER_PWD,
    }, headers=csrf(client))
    assert res.status_code == 200, res.text
    return client, {"X-CSRF-Token": res.json()["csrf_token"]}


# ---------- 全局管理端强制门 ----------

def test_admin_gate_anonymous_401(app):
    client = make_client(app)
    with client:
        pass
    res = client.get("/api/admin/activities?archived=all")
    assert res.status_code == 401
    assert res.json()["code"] == 1002


def test_admin_gate_member_403(app):
    client, headers = _member_client(app, "gate_member")
    res = client.get("/api/admin/activities?archived=all")
    assert res.status_code == 403
    assert res.json()["code"] == 1003


def test_admin_gate_admin_ok(app):
    client, headers = _admin_client(app)
    res = client.get("/api/admin/activities?archived=all")
    assert res.status_code == 200, res.text


# ---------- 用户详情 / 分页 ----------

def test_user_detail_endpoint(app):
    client, headers = _admin_client(app)
    res = client.get("/api/auth/users/1", headers=headers)
    assert res.status_code == 200
    assert res.json()["id"] == 1
    res = client.get("/api/auth/users/999999", headers=headers)
    assert res.status_code == 404


def test_user_detail_member_forbidden(app):
    client, headers = _member_client(app, "detail_member")
    res = client.get("/api/auth/users/1", headers=headers)
    assert res.status_code == 403


def test_users_pagination(app):
    client, headers = _admin_client(app)
    res = client.get("/api/auth/users?page=1&page_size=1", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["page"] == 1 and body["page_size"] == 1
    assert len(body["items"]) <= 1 and body["total"] >= 1


def test_users_list_no_page_returns_list(app):
    client, headers = _admin_client(app)
    res = client.get("/api/auth/users", headers=headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


# ---------- 实时业务状态 ----------

def _create_activity(client, headers, **overrides) -> dict:
    from datetime import datetime, timedelta, timezone

    def iso(dt: datetime) -> str:
        return dt.isoformat()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    body = {
        "title": overrides.pop("title", "状态测试活动"),
        "content": "正文",
        "status": "published",
        "start_at": iso(now + timedelta(days=7)),
        "end_at": iso(now + timedelta(days=8)),
    }
    body.update({k: v for k, v in overrides.items()})
    if "register_start" in body and hasattr(body["register_start"], "isoformat"):
        body["register_start"] = iso(body["register_start"])
    if "register_end" in body and hasattr(body["register_end"], "isoformat"):
        body["register_end"] = iso(body["register_end"])
    if "start_at" in overrides and hasattr(overrides["start_at"], "isoformat"):
        body["start_at"] = iso(overrides["start_at"])
    if "end_at" in overrides and hasattr(overrides["end_at"], "isoformat"):
        body["end_at"] = iso(overrides["end_at"])
    res = client.post("/api/activities", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def test_runtime_status_mapping(app):
    from datetime import datetime, timedelta, timezone

    client, headers = _admin_client(app)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # 进行中：start < now < end
    a_ongoing = _create_activity(
        client, headers, title="进行中活动",
        start_at=now - timedelta(hours=1), end_at=now + timedelta(hours=1),
    )
    # 已结束：end < now
    a_ended = _create_activity(
        client, headers, title="已结束活动",
        start_at=now - timedelta(days=2), end_at=now - timedelta(days=1),
    )
    # 预报名：register_start 在未来
    a_pre = _create_activity(
        client, headers, title="预报名活动",
        register_start=now + timedelta(days=1), register_end=now + timedelta(days=2),
    )
    # 报名中：register 窗口覆盖 now
    a_open = _create_activity(
        client, headers, title="报名中活动",
        register_start=now - timedelta(days=1), register_end=now + timedelta(days=1),
    )
    # 即将进行：报名已截止、活动未开始
    a_upcoming = _create_activity(
        client, headers, title="即将进行活动",
        register_start=now - timedelta(days=2), register_end=now - timedelta(days=1),
    )

    res = client.get("/api/activities?archived=all", headers=headers)
    assert res.status_code == 200
    by_id = {a["id"]: a for a in res.json()}
    assert by_id[a_ongoing["id"]]["runtime_status"] == "ongoing"
    assert by_id[a_ended["id"]]["runtime_status"] == "ended"
    assert by_id[a_pre["id"]]["runtime_status"] == "pre_register"
    assert by_id[a_open["id"]]["runtime_status"] == "registration_open"
    assert by_id[a_upcoming["id"]]["runtime_status"] == "upcoming"

    # 状态为实时计算字段：不落库（DB 状态仍为 published）
    assert by_id[a_ongoing["id"]]["status"] == "published"


# ---------- 图片压缩 / XSS ----------

def test_compress_image_shrinks_jpeg():
    from PIL import Image

    from app.core.images import compress_image

    # 大尺寸噪声图（高熵，编码后体积显著）
    img = Image.effect_noise((3000, 2000), 64).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=100)
    data = buf.getvalue()
    out, ext = compress_image(data, ".jpg")
    assert ext == ".jpg"
    assert len(out) < len(data)


def test_compress_image_rejects_garbage():
    from app.core.images import compress_image

    out, ext = compress_image(b"not-an-image", ".jpg")
    assert out == b"not-an-image" and ext == ".jpg"


def test_avatar_upload_compressed(app):
    from PIL import Image

    client, headers = _admin_client(app)
    img = Image.effect_noise((2600, 1800), 64).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=100)
    raw = buf.getvalue()
    res = client.post("/api/auth/avatar", files={"file": ("big.jpg", raw, "image/jpeg")},
                      headers=headers)
    assert res.status_code == 200, res.text
    url = res.json()["avatar_url"]
    stored = Path(url.replace("/uploads/", "uploads/"))
    assert stored.exists()
    assert stored.stat().st_size < len(raw)  # 压缩生效


def test_media_svg_rejected(app):
    client, headers = _admin_client(app)
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    res = client.post(
        "/api/admin/media",
        files={"file": ("x.svg", svg, "image/svg+xml")},
        data={"category": "misc"},
        headers=headers,
    )
    assert res.status_code == 415


def test_media_disguised_image_rejected(app):
    client, headers = _admin_client(app)
    res = client.post(
        "/api/admin/media",
        files={"file": ("evil.png", b"<script>alert(1)</script>", "image/png")},
        data={"category": "misc"},
        headers=headers,
    )
    assert res.status_code == 415


def test_media_png_upload_ok(app):
    from PIL import Image

    client, headers = _admin_client(app)
    img = Image.new("RGB", (800, 600), (30, 144, 255))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    res = client.post(
        "/api/admin/media",
        files={"file": ("pic.png", buf.getvalue(), "image/png")},
        data={"category": "cover"},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    assert res.json()["storage_path"].endswith(".png")


# ---------- PUT /me 别名 ----------

def test_put_me_alias(app):
    client, headers = _member_client(app, "me_alias_member")
    res = client.put("/api/auth/me", json={"display_name": "新昵称"}, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["display_name"] == "新昵称"
