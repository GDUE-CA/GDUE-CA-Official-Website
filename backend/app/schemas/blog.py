"""博客 CMS Pydantic 模型（文章 + 标签 + 图片上传）。

Markdown 正文允许包含 HTML 语法（Markdown 原生特性），
MultilineText 仅清洗控制字符；后端渲染 HTML 输出经 nh3 消毒。
"""
import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, field_validator, model_validator

from app.schemas.common import MultilineText, PlainText, SafeUrl, UTCNaive, UTCDatetime

# slug：小写字母/数字 + 连字符分段（公开 URL 使用）
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _slug(v: str) -> str:
    v = v.strip().lower()
    if not v:
        return v
    if len(v) > 128 or not _SLUG_RE.match(v):
        raise ValueError("slug 仅支持小写字母、数字和连字符（如 my-first-post）")
    return v


Slug = Annotated[str, AfterValidator(_slug)]


# ---------- 标签 ----------
class BlogTagCreate(BaseModel):
    name: PlainText = Field(min_length=1, max_length=64)
    slug: Slug | None = Field(default=None, max_length=128)


class BlogTagUpdate(BaseModel):
    name: PlainText | None = Field(default=None, min_length=1, max_length=64)
    slug: Slug | None = Field(default=None, max_length=128)


class BlogTagOut(BaseModel):
    id: int
    name: str
    slug: str
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


class BlogTagBrief(BaseModel):
    """嵌入文章响应中的标签摘要。"""
    id: int
    name: str
    slug: str

    model_config = {"from_attributes": True}


# ---------- 文章 ----------
class BlogPostCreate(BaseModel):
    title: PlainText = Field(min_length=1, max_length=200)
    # 不填则后端按 post-{id} 自动生成（创建后回填）
    slug: Slug | None = Field(default=None, max_length=128)
    content_md: MultilineText = Field(min_length=1, max_length=200_000)
    excerpt: PlainText | None = Field(default=None, max_length=500)
    cover_url: SafeUrl | None = Field(default=None, max_length=512)
    status: Literal["draft", "published", "scheduled", "archived"] = "draft"
    # 定时发布时间（status=scheduled 时必填且须晚于当前）；统一转 naive UTC
    scheduled_at: UTCNaive | None = None
    # 标签 ID 列表（须已存在的标签）
    tag_ids: list[int] = Field(default_factory=list, max_length=20)
    allow_comments: bool = True
    # 展示用作者名（历史迁移内容无系统账号时使用；为空回退关联账号 username）
    author_name: PlainText | None = Field(default=None, max_length=64)


class BlogPostUpdate(BaseModel):
    title: PlainText | None = Field(default=None, min_length=1, max_length=200)
    slug: Slug | None = Field(default=None, max_length=128)
    content_md: MultilineText | None = Field(default=None, min_length=1, max_length=200_000)
    excerpt: PlainText | None = Field(default=None, max_length=500)
    cover_url: SafeUrl | None = Field(default=None, max_length=512)
    status: Literal["draft", "published", "scheduled", "archived", None] = None
    scheduled_at: UTCNaive | None = None
    tag_ids: list[int] | None = Field(default=None, max_length=20)
    allow_comments: bool | None = None
    author_name: PlainText | None = Field(default=None, max_length=64)


class BlogPostBriefOut(BaseModel):
    """列表项：不含正文。"""
    id: int
    title: str
    slug: str
    excerpt: str | None
    cover_url: str | None
    status: str
    published_at: UTCDatetime | None
    scheduled_at: UTCDatetime | None
    allow_comments: bool
    author: str | None
    tags: list[BlogTagBrief]
    # ---- 4 项统计指标（冗余计数，供前端列表/详情展示） ----
    like_count: int
    comment_count: int
    share_count: int
    favourite_count: int
    created_at: UTCDatetime
    updated_at: UTCDatetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _prefer_author_name(cls, data):
        """展示作者名优先：历史迁移内容无系统账号，author_name 覆盖关联账号 username。

        仅当输入为 ORM 对象且 author_name 非空时转为 dict，避免污染 ORM 实体。
        """
        if isinstance(data, dict):
            return data
        name = getattr(data, "author_name", None)
        if not name:
            return data
        values = {f: getattr(data, f) for f in cls.model_fields if hasattr(data, f)}
        values["author"] = name
        return values

    @field_validator("author", mode="before")
    @classmethod
    def _author_username(cls, v):
        """from_attributes 下 author 是 User 对象，取 username 字符串。"""
        if v is None or isinstance(v, str):
            return v
        return getattr(v, "username", None)


class BlogPostOut(BlogPostBriefOut):
    """详情：含原始 Markdown 正文 + 预渲染消毒 HTML（端点按需回填）。"""
    content_md: str
    content_html: str = ""


class BlogUploadOut(BaseModel):
    """博客内嵌图片 / 封面上传结果。"""
    url: str
    size: int
    original_size: int


class BlogMetricOut(BaseModel):
    """博客指标操作结果（点赞/分享/收藏）：返回操作后的最新计数。

    share/like/favourite 各端点均返回此模型，前端可直接刷新 UI。
    """
    like_count: int
    comment_count: int
    share_count: int
    favourite_count: int
