"""公告 CMS Pydantic 模型。"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import MultilineText, PlainText, SafeUrl, UTCNaive, UTCDatetime


class AnnouncementCreate(BaseModel):
    category: Literal["homepage", "home"] = "homepage"
    title: PlainText = Field(min_length=1, max_length=200)
    content: MultilineText = Field(min_length=1, max_length=10_000)
    link: SafeUrl | None = Field(default=None, max_length=512)
    start_at: UTCNaive | None = None
    end_at: UTCNaive | None = None
    enabled: bool = True
    priority: int = Field(default=0, ge=-1000, le=1000)


class AnnouncementUpdate(BaseModel):
    category: Literal["homepage", "home"] | None = None
    title: PlainText | None = Field(default=None, min_length=1, max_length=200)
    content: MultilineText | None = Field(default=None, min_length=1, max_length=10_000)
    link: SafeUrl | None = Field(default=None, max_length=512)
    start_at: UTCNaive | None = None
    end_at: UTCNaive | None = None
    enabled: bool | None = None
    priority: int | None = Field(default=None, ge=-1000, le=1000)


class AnnouncementOut(BaseModel):
    id: int
    category: str
    title: str
    content: str
    link: str | None
    start_at: UTCDatetime | None
    end_at: UTCDatetime | None
    enabled: bool
    priority: int
    created_by: int | None
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


class AnnouncementPublicOut(BaseModel):
    """前端公开接口：仅返回当前生效中的公告字段（不含 created_by 等管理信息）。"""
    id: int
    category: str
    title: str
    content: str
    link: str | None
    start_at: UTCDatetime | None
    end_at: UTCDatetime | None
    priority: int

    model_config = {"from_attributes": True}
