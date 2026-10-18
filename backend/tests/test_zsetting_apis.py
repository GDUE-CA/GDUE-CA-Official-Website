"""/setting 模块后端接口回归测试：geo 数据、profile 地区编码、头像恢复、一键下线。

文件名以 z 开头，确保在 test_security 之后执行（共享 session 级测试库，超管首次改密会改变初始态）。
"""
import asyncio

from sqlalchemy import select

from app.db.models import LoginSession, User
from app.db.session import async_session
from tests.conftest import STRONG_ADMIN_PASSWORD, csrf, make_client, register_member
from tests.test_security import _admin_client

MEMBER_PASSWORD = "Mm#br-2025safePwd"


def _register_member(client, tag: str):
    """公开注册一个 member 账号并登录，返回 (client, headers)。"""
    r = register_member(client, f"setter{tag}", MEMBER_PASSWORD,
                        display_name=f"设置测试{tag}", phone="+8613900000000")
    assert r.status_code in (201, 400), r.text
    r = client.post("/api/auth/login", headers=csrf(client), json={
        "username": f"setter{tag}", "password": MEMBER_PASSWORD,
    })
    assert r.status_code == 200, r.text
    return client, {"X-CSRF-Token": r.json()["csrf_token"]}


def test_geo_countries_structure(app):
    client = make_client(app)
    with client:
        pass
    r = client.get("/api/geo/countries")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 200
    # CN/HK/MO/TW 置顶
    assert [c["iso2"] for c in data[:4]] == ["CN", "HK", "MO", "TW"]
    cn = data[0]
    assert set(cn.keys()) >= {"iso2", "display_name_zh", "official_name", "name_en", "dial_code"}
    assert cn["display_name_zh"] == "中国大陆"
    assert cn["dial_code"] == "86"


def test_geo_subdivisions_cn_has_second_level(app):
    client = make_client(app)
    with client:
        pass
    r = client.get("/api/geo/subdivisions?country=CN")
    assert r.status_code == 200
    data = r.json()
    assert data["has_second_level"] is True
    codes = {it["code"] for it in data["items"]}
    assert "CN-44" in codes  # 广东省
    gd = next(it for it in data["items"] if it["code"] == "CN-44")
    assert len(gd["children"]) > 0


def test_geo_subdivisions_hk_no_second_level(app):
    client = make_client(app)
    with client:
        pass
    r = client.get("/api/geo/subdivisions?country=HK")
    assert r.status_code == 200
    data = r.json()
    assert data["has_second_level"] is False
    assert len(data["items"]) == 18


def test_geo_subdivisions_unlisted_country_empty(app):
    client = make_client(app)
    with client:
        pass
    r = client.get("/api/geo/subdivisions?country=SG")
    assert r.status_code == 200
    data = r.json()
    assert data["items"] == []


def test_geo_subdivisions_invalid_country(app):
    client = make_client(app)
    with client:
        pass
    r = client.get("/api/geo/subdivisions?country=ZZ")
    assert r.status_code == 400


def test_geo_detect_returns_iso2(app):
    client = make_client(app, ip="8.8.8.8")
    with client:
        pass
    r = client.get("/api/geo/detect")
    assert r.status_code == 200
    # GeoLite2 可能不可用（None），也可能返回 US；只要字段存在即可
    assert "iso2" in r.json()


def test_profile_update_country_codes(app):
    client, headers = _register_member(make_client(app), "cc")
    r = client.put("/api/auth/profile", headers={**headers, **csrf(client)}, json={
        "country_code": "CN",
        "subdiv1_code": "CN-44",
        "subdiv2_code": "CN-44-01",
    })
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["country_code"] == "CN"
    assert p["subdiv1_code"] == "CN-44"
    assert p["subdiv2_code"] == "CN-44-01"
    # 再次 GET 确认落库
    r2 = client.get("/api/auth/profile", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["country_code"] == "CN"


def test_profile_update_invalid_subdivision(app):
    client, headers = _register_member(make_client(app), "bad")
    r = client.put("/api/auth/profile", headers={**headers, **csrf(client)}, json={
        "country_code": "CN",
        "subdiv1_code": "CN-XX",
    })
    assert r.status_code == 400


def test_profile_change_country_resets_subdivisions(app):
    client, headers = _register_member(make_client(app), "rs")
    # 先设 CN 广东广州
    r = client.put("/api/auth/profile", headers={**headers, **csrf(client)}, json={
        "country_code": "CN", "subdiv1_code": "CN-44", "subdiv2_code": "CN-44-01",
    })
    assert r.status_code == 200
    # 改国家为 US → 一级/二级应被清空
    r = client.put("/api/auth/profile", headers={**headers, **csrf(client)}, json={
        "country_code": "US",
    })
    assert r.status_code == 200
    p = r.json()
    assert p["country_code"] == "US"
    assert p["subdiv1_code"] is None
    assert p["subdiv2_code"] is None


def test_reset_avatar(app):
    client, headers = _register_member(make_client(app), "av")
    # 先上传头像
    from io import BytesIO
    # 1x1 PNG
    png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000500010d0a2db40000000049454e44ae426082")
    files = {"file": ("avatar.png", BytesIO(png), "image/png")}
    r = client.post("/api/auth/avatar", headers={**headers, **csrf(client)}, files=files)
    assert r.status_code == 200, r.text
    assert r.json()["avatar_url"]
    # 恢复默认
    r = client.delete("/api/auth/avatar", headers={**headers, **csrf(client)})
    assert r.status_code == 200
    p = client.get("/api/auth/profile", headers=headers).json()
    assert p["avatar_url"] is None


def test_revoke_other_sessions(app):
    client, headers = _register_member(make_client(app), "ro")
    # 直接在 DB 插入一条该用户的"其他会话"
    async def insert_other():
        async with async_session() as s:
            u = (await s.execute(select(User).where(User.username == "setterro"))).scalar_one()
            s.add(LoginSession(
                user_id=u.id, session_id="deadbeef" * 4, device_name="Other", device_model="Other",
                user_agent="other", ip="10.0.0.9", login_at=__import__("datetime").datetime.utcnow(),
                last_active_at=__import__("datetime").datetime.utcnow(),
                expires_at=__import__("datetime").datetime.utcnow() + __import__("datetime").timedelta(days=1),
            ))
            await s.commit()
    asyncio.run(insert_other())

    r = client.post("/api/auth/sessions/revoke-others", headers={**headers, **csrf(client)})
    assert r.status_code == 200
    assert r.json()["revoked"] >= 1

    # 验证其他会话已撤销
    async def check():
        async with async_session() as s:
            u = (await s.execute(select(User).where(User.username == "setterro"))).scalar_one()
            sess = (await s.execute(select(LoginSession).where(
                LoginSession.user_id == u.id, LoginSession.session_id == "deadbeef" * 4
            ))).scalar_one()
            assert sess.revoked is True
    asyncio.run(check())
