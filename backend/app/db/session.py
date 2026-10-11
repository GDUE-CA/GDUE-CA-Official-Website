"""数据库会话与引擎。"""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

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
    """FastAPI 依赖注入，提供一个事务内的会话。"""
    async with async_session() as s:
        try:
            yield s
            await s.commit()
        except Exception:
            await s.rollback()
            raise
