"""启动补列（_add_missing_model_columns）回归测试：SQLite / PostgreSQL 通用。

覆盖：
- 旧表缺列：按模型补齐，存量行按默认值回填（布尔 / 整数 / 枚举名 / server_default）
- 无默认值的非空列按可空补列（不因存量行失败）；可调用默认按可空补列
- 外键内联、涉及新列的索引补建、PostgreSQL 原生 ENUM 类型补建
- 重复执行幂等

PostgreSQL 用例需设置 TEST_POSTGRES_URL（postgresql+asyncpg://...），未设置则跳过。
"""
import asyncio
import enum
import os
from datetime import datetime

import pytest
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    inspect,
    text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.ext.asyncio import create_async_engine

from app.main import _add_missing_model_columns


class SyncColor(enum.Enum):
    RED = "red"
    BLUE = "blue"


def _metadata() -> MetaData:
    md = MetaData()
    Table("sync_parent", md, Column("id", Integer, primary_key=True))
    Table(
        "sync_items", md,
        Column("id", Integer, primary_key=True),
        Column("flag", Boolean, nullable=False, default=True),
        Column("count", Integer, nullable=False, default=0),
        Column("color", SAEnum(SyncColor), nullable=False, default=SyncColor.BLUE),
        Column("note", String(20), nullable=False),
        Column("seen_at", DateTime, default=datetime.now),
        Column("parent_id", Integer, ForeignKey("sync_parent.id"), index=True),
        Column("src", String(8), server_default="FORM"),
        Column("meta", JSON),
    )
    return md


NEW_COLS = ["flag", "count", "color", "note", "seen_at", "parent_id", "src", "meta"]

_urls = [pytest.param("sqlite+aiosqlite://", id="sqlite")]
if os.environ.get("TEST_POSTGRES_URL"):
    _urls.append(pytest.param(os.environ["TEST_POSTGRES_URL"], id="postgresql"))


async def _drop(conn):
    await conn.execute(text("DROP TABLE IF EXISTS sync_items"))
    await conn.execute(text("DROP TABLE IF EXISTS sync_parent"))
    if conn.dialect.name == "postgresql":
        await conn.execute(text("DROP TYPE IF EXISTS synccolor"))


async def _scenario(url: str):
    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            await _drop(conn)
            # 旧版表结构：只有主键，且已有一行存量数据
            await conn.execute(text("CREATE TABLE sync_parent (id INTEGER PRIMARY KEY)"))
            await conn.execute(text("CREATE TABLE sync_items (id INTEGER PRIMARY KEY)"))
            await conn.execute(text("INSERT INTO sync_parent (id) VALUES (7)"))
            await conn.execute(text("INSERT INTO sync_items (id) VALUES (1)"))

        md = _metadata()
        async with engine.begin() as conn:
            added = await _add_missing_model_columns(conn, md)
        assert added == [f"sync_items.{c}" for c in NEW_COLS]

        async with engine.begin() as conn:
            row = (await conn.execute(text(
                "SELECT flag, count, color, note, seen_at, parent_id, src FROM sync_items WHERE id = 1"
            ))).one()
            assert bool(row.flag) is True and row.count == 0 and row.color == "BLUE"
            assert row.note is None and row.seen_at is None and row.parent_id is None
            assert row.src == "FORM"

            cols, indexes, fks = await conn.run_sync(lambda c: (
                {col["name"]: col for col in inspect(c).get_columns("sync_items")},
                {i["name"] for i in inspect(c).get_indexes("sync_items")},
                inspect(c).get_foreign_keys("sync_items"),
            ))
            assert cols["flag"]["nullable"] is False
            assert cols["note"]["nullable"] is True
            assert "ix_sync_items_parent_id" in indexes
            assert [(fk["referred_table"], fk["constrained_columns"]) for fk in fks] == [
                ("sync_parent", ["parent_id"])
            ]

            # 新行走 ORM 层同样可写（枚举类型 / 外键可用）
            await conn.execute(md.tables["sync_items"].insert().values(
                id=2, note="n", color=SyncColor.RED, parent_id=7, meta={"a": 1}))

        async with engine.begin() as conn:
            assert await _add_missing_model_columns(conn, md) == []
            await _drop(conn)
    finally:
        await engine.dispose()


@pytest.mark.parametrize("url", _urls)
def test_add_missing_model_columns(url):
    asyncio.run(_scenario(url))
