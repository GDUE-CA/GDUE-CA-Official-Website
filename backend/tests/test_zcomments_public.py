"""公开评论：设备类别 / 登录用户头像与主页链接 / 不泄露 IP、原始 UA、内部用户 id。"""
import asyncio

from tests.conftest import csrf, make_client

PASSWORD = "Comment#Tester-2026"
IPHONE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)
WINDOWS_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
)


def _seed() -> int:
    """一次性 engine 预置：已发布文章 + 会员账号（带头像），返回文章 id。"""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import get_settings
    from app.core.security import Role, hash_password
    from app.db.models import BlogPost, BlogPostStatus, User, utcnow

    async def _run() -> int:
        eng = create_async_engine(get_settings().DATABASE_URL, future=True)
        try:
            async with async_sessionmaker(eng, expire_on_commit=False)() as s:
                s.add(User(
                    username="commenter", email="commenter@gdue-ca.cn",
                    password_hash=hash_password(PASSWORD), role=Role.MEMBER,
                    display_name="评论达人", real_name="评论测试", student_id="00000002",
                    phone="+8613800000002", avatar_url="/uploads/avatars/commenter.png",
                    must_set_security_questions=False,
                ))
                post = BlogPost(
                    title="评论测试文章", slug="comment-test", content_md="正文",
                    status=BlogPostStatus.PUBLISHED, published_at=utcnow(), allow_comments=True,
                )
                s.add(post)
                await s.commit()
                return post.id
        finally:
            await eng.dispose()

    return asyncio.run(_run())


def test_public_comments_show_device_and_avatar_without_leaks(app):
    anon = make_client(app)
    with anon:  # 触发 lifespan
        pass
    post_id = _seed()

    # 匿名访客：沿用表单昵称，无头像 / 主页
    r = anon.post(f"/api/blog/{post_id}/comments", json={"author_name": "路人甲", "content": "沙发"},
                  headers={**csrf(anon), "User-Agent": IPHONE_UA})
    assert r.status_code == 201, r.text
    assert r.json()["device"] == "iphone"
    assert r.json()["author_username"] is None

    # 登录用户：昵称取账号显示名（忽略表单昵称，防冒名），带头像与 username
    member = make_client(app)
    lr = member.post("/api/auth/login", headers=csrf(member),
                     json={"username": "commenter", "password": PASSWORD})
    assert lr.status_code == 200, lr.text
    r = member.post(f"/api/blog/{post_id}/comments",
                    json={"author_name": "冒充管理员", "content": "写得好"},
                    headers={"X-CSRF-Token": lr.json()["csrf_token"], "User-Agent": WINDOWS_UA})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["author_name"] == "评论达人"
    assert body["author_username"] == "commenter"
    assert body["author_avatar_url"] == "/uploads/avatars/commenter.png"
    assert body["device"] == "windows"

    listing = make_client(app).get(f"/api/blog/{post_id}/comments").json()
    items = listing["items"]
    assert [c["author_name"] for c in items] == ["路人甲", "评论达人"]
    for c in items:
        for leaked in ("user_id", "submit_ip", "user_agent", "is_deleted", "is_hidden"):
            assert leaked not in c, leaked


def test_device_category():
    from app.utils.device import device_category

    assert device_category(IPHONE_UA) == "iphone"
    assert device_category(WINDOWS_UA) == "windows"
    assert device_category("Mozilla/5.0 (Linux; Android 14; 22081212C Build/UKQ1) Chrome/129") == "android"
    assert device_category("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605") == "macos"
    assert device_category(None) == "other"
