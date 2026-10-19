"""公告 CMS Pydantic 模型。"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.locales import SUPPORTED_LOCALE_IDS
from app.schemas.common import MultilineText, PlainText, SafeUrl, UTCNaive, UTCDatetime

# 多语言覆盖白名单字段（V0.6.1 需求4）
_I18N_FIELDS = ("title", "content", "publisher_intro")


class AnnouncementCreate(BaseModel):
    category: Literal["homepage", "home"] = "homepage"
    title: PlainText = Field(min_length=1, max_length=200)
    content: MultilineText = Field(min_length=1, max_length=10_000)
    link: SafeUrl | None = Field(default=None, max_length=512)
    start_at: UTCNaive | None = None
    end_at: UTCNaive | None = None
    enabled: bool = True
    priority: int = Field(default=0, ge=-1000, le=1000)
    # 发布者介绍（可选，详情页标题下展示）
    publisher_intro: PlainText | None = Field(default=None, max_length=200)
    # 多语言覆盖：{locale: {field: text}}；locale/字段均走白名单校验，空条目剔除
    i18n: dict | None = None

    @field_validator("i18n", mode="after")
    @classmethod
    def _clean_i18n(cls, v: dict | None) -> dict | None:
        if v is None:
            return None
        if not isinstance(v, dict):
            raise ValueError("i18n 必须是对象")
        out: dict = {}
        for loc, fields in v.items():
            loc_key = str(loc).lower()
            if loc_key not in SUPPORTED_LOCALE_IDS:
                raise ValueError(f"i18n 语言不支持：{loc}")
            if not isinstance(fields, dict):
                raise ValueError(f"i18n.{loc} 必须是对象")
            clean: dict = {}
            for k, text in fields.items():
                if k not in _I18N_FIELDS:
                    raise ValueError(f"i18n 字段不支持：{k}")
                if text is None:
                    continue
                if not isinstance(text, str):
                    raise ValueError(f"i18n.{loc}.{k} 必须是字符串")
                limits = {"title": 200, "content": 10_000, "publisher_intro": 200}
                if len(text) > limits[k]:
                    raise ValueError(f"i18n.{loc}.{k} 长度超限（≤{limits[k]}）")
                clean[k] = text
            if clean:
                out[loc_key] = clean
        return out or None


class AnnouncementUpdate(AnnouncementCreate):
    category: Literal["homepage", "home"] | None = None  # type: ignore[assignment]
    title: PlainText | None = Field(default=None, min_length=1, max_length=200)  # type: ignore[assignment]
    content: MultilineText | None = Field(default=None, min_length=1, max_length=10_000)  # type: ignore[assignment]
    enabled: bool | None = None  # type: ignore[assignment]
    priority: int | None = Field(default=None, ge=-1000, le=1000)  # type: ignore[assignment]


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
    # 状态派生（V0.6.1 需求4）：映射 enabled 单真值源，草稿仅后台可见
    status: Literal["draft", "published"] = "published"
    priority: int
    publisher_intro: str | None = None
    i18n: dict | None = None
    created_by: int | None
    created_at: UTCDatetime
    attachments: list[AnnouncementAttachmentOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _derive_status(self):
        self.status = "published" if self.enabled else "draft"
        return self


class AnnouncementPublicOut(BaseModel):
    """前端公开接口：仅返回当前生效中的公告字段（不含 created_by 等管理信息与 i18n 全量）。"""
    id: int
    category: str
    title: str
    content: str
    link: str | None
    start_at: UTCDatetime | None
    end_at: UTCDatetime | None
    enabled: bool = True
    status: Literal["draft", "published"] = "published"
    priority: int
    publisher_intro: str | None = None
    # 发布时间兜底：start_at 为空（立即生效）时前端用 created_at 作为发布时间展示
    created_at: UTCDatetime
    # 多媒体/办公文档附件（详情页在线预览）
    attachments: list[AnnouncementAttachmentOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _derive_status(self):
        self.status = "published" if self.enabled else "draft"
        return self
