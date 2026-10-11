"""测试夹具：隔离的临时工作目录 + SQLite 数据库，每个测试模块一个应用实例。"""
import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

STRONG_ADMIN_PASSWORD = "Gd#Ca-Str0ng!Pwd"
ADMIN_EMAIL = "root@gdue-ca.cn"


@pytest.fixture(scope="session")
def app(tmp_path_factory):
    work = tmp_path_factory.mktemp("work")
    os.chdir(work)
    os.environ.update({
        "DATABASE_URL": f"sqlite+aiosqlite:///{work / 'test.db'}",
        "FIRST_SUPERADMIN_EMAIL": ADMIN_EMAIL,
        "FIRST_SUPERADMIN_PASSWORD": STRONG_ADMIN_PASSWORD,
        "CORS_ORIGINS": "",
        "LOGIN_MAX_FAILURES": "3",
    })
    from app.main import app as fastapi_app
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


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    from app.core import rate_limit
    from app.core import middleware
    rate_limit.reset()
    middleware._rate_buckets.clear()  # 全局 IP 令牌桶：不清会跨用例累积成 429
    yield
