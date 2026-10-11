"""内容块 Pydantic 模型。"""
from pydantic import BaseModel, Field

from app.schemas.common import MultilineText, PlainText, UTCDatetime


class ContentBlockUpdate(BaseModel):
    title: PlainText | None = Field(default=None, max_length=200)
    body_md: MultilineText = Field(min_length=1, max_length=100_000)


class ContentBlockOut(BaseModel):
    id: int
    key: str
    title: str | None
    body_md: str
    updated_at: UTCDatetime | None

    model_config = {"from_attributes": True}
