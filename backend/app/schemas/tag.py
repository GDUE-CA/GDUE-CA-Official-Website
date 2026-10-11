"""全站共享标签池 Pydantic 模型（与 Memo/Document/Activity 共用）。"""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.common import UTCDatetime


class TagOut(BaseModel):
    """全站共享标签：与后端 db.models.Tag 一一对应。"""
    id: int
    name: str
    slug: str
    scopes: list[str]
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


class TagWithCount(TagOut):
    """带跨模块关联数：memo_count / blog_count（后续）/ doc_count / activity_count。"""
    memo_count: int = 0