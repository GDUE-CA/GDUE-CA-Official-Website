"""通用列表助手：分页 + 模糊搜索 + 等值筛选。

所有新 CMS 模块的后台列表接口复用这套助手，保证返回结构统一为
``{total, items, page, page_size}``，避免每个路由各写一套。
"""
from typing import Any, Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select


def apply_search(stmt: Select, fields: Sequence[Any], q: str | None) -> Select:
    """对多个字符串列做 OR ilike 模糊匹配；q 为空时原样返回。"""
    q = (q or "").strip()
    if not q or not fields:
        return stmt
    pattern = f"%{q}%"
    return stmt.where(or_(*[f.ilike(pattern, escape="\\") for f in fields]))


def apply_eq(stmt: Select, field: Any, value: Any | None) -> Select:
    """等值筛选；value 为 None 时原样返回。"""
    if value is None:
        return stmt
    return stmt.where(field == value)


async def paginate(
    db: AsyncSession,
    stmt: Select,
    page: int = 1,
    page_size: int = 20,
    *,
    out_model: Any | None = None,
) -> dict:
    """对带 where/排序的 select 语句分页，返回 {total, items, page, page_size}。

    - total = 满足条件的总行数（子查询去 order_by）
    - items = 当前页记录（offset/limit）
    - page 从 1 起；page_size 上限 100，防过大拉取
    - out_model 传入 Pydantic Out 模型时，items 先经 Out 模型校验序列化为
      JSON 基本类型（UTCDatetime 输出带大写 Z 的 ISO 字符串）。裸 SQLAlchemy
      ORM 对象无法被 FastAPI 的 dict 响应序列化，必须转换。
    """
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))

    # 计数：去掉 order_by 避免无意义排序开销
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    paged = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(paged)).scalars().all()

    if out_model is not None:
        items = [out_model.model_validate(r).model_dump(mode="json") for r in rows]
    else:
        items = list(rows)

    return {"total": total, "items": items, "page": page, "page_size": page_size}
