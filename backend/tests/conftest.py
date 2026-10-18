"""测试夹具：隔离的临时工作目录 + SQLite 数据库（可用 TEST_DATABASE_URL 换成 PostgreSQL），每个测试模块一个应用实例。"""
import os
import sys
import tempfile
from pathlib import Path

import bcrypt
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

STRONG_ADMIN_PASSWORD = "Gd#Ca-Str0ng!Pwd"
ADMIN_EMAIL = "root@gdue-ca.cn"
# Break-Glass 测试凭据（哈希现算，源码不含哈希值）
BG_USERNAME = "bg_admin"
BG_PASSWORD = "BreakGlass#2026!Xq"

# env 必须在任何 app 模块被 import 之前就位：get_settings() 的 lru_cache 在首次调用时冻结，
# 若 env 设置晚于首个 import（如某测试文件模块级 import app.*），engine 会绑到默认库 assoc.db。
_WORK_DIR = tempfile.mkdtemp(prefix="gdueca-test-")
os.environ.update({
    # TEST_DATABASE_URL 可指向一个空的 PostgreSQL 库验证兼容性，例如
    # TEST_DATABASE_URL=postgresql+asyncpg://user@127.0.0.1:5432/gdueca_test pytest
    "DATABASE_URL": os.environ.get("TEST_DATABASE_URL")
    or f"sqlite+aiosqlite:///{Path(_WORK_DIR) / 'test.db'}",
    "CORS_ORIGINS": "",
    # Break-Glass：凭据仅经环境变量注入（与生产同路径）
    "SUPER_ADMIN_USERNAME": BG_USERNAME,
    "SUPER_ADMIN_PASSWORD_HASH": bcrypt.hashpw(
        BG_PASSWORD.encode(), bcrypt.gensalt(12)
    ).decode(),
    "SUPER_ADMIN_ENABLED": "true",
})
os.chdir(_WORK_DIR)

# PostgreSQL：每个测试模块的 TestClient 各有一个 event loop，asyncpg 连接绑定创建它的 loop，
# 共享 engine 的连接池跨模块复用会报 "attached to a different loop"。测试时改用 NullPool
# （生产单一 loop 不受影响）；须在 app.db.session 被 import 之前替换。
if os.environ["DATABASE_URL"].startswith("postgresql"):
    import sqlalchemy.ext.asyncio as _sa_asyncio
    from sqlalchemy.pool import NullPool

    _create_async_engine = _sa_asyncio.create_async_engine
    _sa_asyncio.create_async_engine = lambda url, **kw: _create_async_engine(
        url, **{**kw, "poolclass": NullPool}
    )


@pytest.fixture(scope="session")
def app():
    import asyncio

    from app.main import app as fastapi_app

    # 测试库引导（过渡方案）：全新库 system_initialized 置 true + 预置首位超管，
    # 等价于初始化向导的产物；向导 API 就绪后将改为走真实向导流程。
    from app.core.config import get_settings
    from app.core.security import Role, hash_password
    from app.db.models import Base, SystemSetting, User

    async def _bootstrap():
        # 必须用独立的一次性 engine 引导，严禁触碰共享 engine：SQLAlchemy 异步连接池
        # 绑定创建它的 event loop，共享 engine 若先在 asyncio.run 的临时 loop 里建立
        # 连接，TestClient 的 lifespan loop 复用这些死连接会永久挂起（诊断结论见
        # faulthandler 栈：portal close 卡在等待绑定死 loop 的 aiosqlite 连接）。
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

        eng = create_async_engine(
            get_settings().DATABASE_URL,
            echo=False,
            future=True,
            connect_args={"check_same_thread": False}
            if get_settings().DATABASE_URL.startswith("sqlite") else {},
        )
        try:
            async with eng.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            maker = async_sessionmaker(eng, expire_on_commit=False)
            async with maker() as s:
                s.add(SystemSetting(id=1, system_initialized=True))
                s.add(User(
                    username=ADMIN_EMAIL.split("@")[0],
                    email=ADMIN_EMAIL,
                    password_hash=hash_password(STRONG_ADMIN_PASSWORD),
                    role=Role.SUPER_ADMIN,
                    must_change_password=True,
                    student_id="00000000",
                    real_name="测试超管",
                    phone="+8600000000000",
                ))
                await s.commit()
        finally:
            await eng.dispose()

    asyncio.run(_bootstrap())
    return fastapi_app


def make_client(app, ip: str = "127.0.0.1"):
    """构造指定客户端 IP 的 TestClient（外网 IP 通过可信代理的 XFF 模拟）。"""
    from fastapi.testclient import TestClient
    client = TestClient(app, client=("127.0.0.1", 50000))
    if ip != "127.0.0.1":
        client.headers["X-Forwarded-For"] = ip
    return client


def csrf(client) -> dict:
    token = client.get("/api/auth/csrf").json()["csrf_token"]
    return {"X-CSRF-Token": token}


TEST_REGISTER_CODE = "123456"


def register_member(client, username: str, password: str, email: str | None = None, **extra):
    """走真实三步注册接口注册 member：预置邮箱验证码（代替收信）+ 3 个自定义安全问题。

    返回注册响应；201 = 新建，400 = 用户名 / 邮箱已存在（可复跑）。
    """
    import asyncio
    import hashlib

    from app.api.auth import _email_hash
    from app.core.kv import get_kv

    email = email or f"{username}@gdue-ca.cn"
    code_key = f"regcode:code:{_email_hash(email)}"
    digest = hashlib.sha256(TEST_REGISTER_CODE.encode()).hexdigest()
    asyncio.run(get_kv().set(code_key, digest, 600))
    return client.post("/api/auth/register", headers=csrf(client), json={
        "username": username,
        "display_name": username,
        "password": password,
        "confirm_password": password,
        "email": email,
        "code": TEST_REGISTER_CODE,
        "security_questions": [
            {"position": i, "question": f"测试问题{i}", "answer": f"answer{i}", "is_custom": True}
            for i in (1, 2, 3)
        ],
        **extra,
    })


def pytest_configure(config):
    config.addinivalue_line("markers", "login2fa: 走真实的陌生设备邮箱二次验证（默认用例跳过该门禁）")


@pytest.fixture(autouse=True)
def _skip_login2fa(request, monkeypatch):
    """测试环境无邮件通道，2FA 发码必然失败、登录一律被拒：默认把设备视为已信任。

    需要验证 2FA 本身的用例标记 @pytest.mark.login2fa，走真实门禁。
    """
    if request.node.get_closest_marker("login2fa"):
        return
    from app.api import auth

    async def _trusted(*args, **kwargs):
        return None

    monkeypatch.setattr(auth, "_login2fa_challenge", _trusted)


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    from app.core import rate_limit
    from app.core import middleware
    from app.core.kv import reset_kv
    rate_limit.reset()
    middleware._rate_buckets.clear()  # 全局 IP 令牌桶：不清会跨用例累积成 429
    reset_kv()  # 防爆破阶梯计数/封禁也存 KV：跨用例清零，避免阶梯状态泄漏
    yield
