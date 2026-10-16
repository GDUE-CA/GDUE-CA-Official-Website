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


class AnnouncementAttachmentOut(BaseModel):
    """公告附件输出：kind 决定前端渲染器（video/audio/pdf 在线预览，office 下载）。"""
    id: int
    kind: str
    url: str
    original_name: str | None
    mime: str
    size: int

    model_config = {"from_attributes": True}


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
    attachments: list[AnnouncementAttachmentOut] = Field(default_factory=list)

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
    # 发布时间兜底：start_at 为空（立即生效）时前端用 created_at 作为发布时间展示
    created_at: UTCDatetime
    # 多媒体/办公文档附件（详情页在线预览）
    attachments: list[AnnouncementAttachmentOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}
