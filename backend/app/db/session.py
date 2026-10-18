"""数据库会话与引擎。"""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core import db_trace  # noqa: F401 —— 注册数据库写操作审计事件
from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    # SQLite 需要 connect_args 兼容异步
    connect_args={"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {},
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    """FastAPI 依赖注入，提供一个事务内的会话。

    一律以 `Depends(get_db, scope="function")` 注入：接口函数返回后、响应发出前即提交 / 回滚，
    保证提交失败能反映在响应里，且写操作 trace id（X-Trace-Id）能随响应下发。
    scope 参与依赖缓存键，混用默认 scope 会在同一请求内创建两个会话，禁止混用。
    """
    async with async_session() as s:
        try:
            yield s
            await s.commit()
        except Exception:
            await s.rollback()
            raise
