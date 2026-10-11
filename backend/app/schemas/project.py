"""项目展示 CMS Pydantic 模型（列表/详情/创建/更新）。"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import MultilineText, PlainText, SafeUrl, UTCDatetime

# slug：小写字母/数字 + 连字符分段（公开 URL 使用）
from app.schemas.blog import Slug

ProjectStatusLiteral = Literal["draft", "published", "archived"]


class ProjectBase(BaseModel):
    title: PlainText = Field(min_length=1, max_length=200)
    description: PlainText = Field(default="", max_length=500)
    # 技术栈标签数组（如 ["Next.js", "React"]；每项 ≤64 字符）
    tech_stack: list[PlainText] = Field(default_factory=list, max_length=24)
    github_url: SafeUrl | None = Field(default=None, max_length=512)
    demo_url: SafeUrl | None = Field(default=None, max_length=512)
    # 截图 URL 数组
    screenshots: list[SafeUrl] = Field(default_factory=list, max_length=12)
    # 完成年份
    year: int = Field(ge=1900, le=3000)
    # 项目负责人（展示名）
    leader: PlainText = Field(default="", max_length=64)
    content_md: MultilineText = Field(min_length=1, max_length=200_000)


class ProjectCreate(ProjectBase):
    # 不填则后端按 project-{id} 自动生成（创建后回填）
    slug: Slug | None = Field(default=None, max_length=128)
    status: ProjectStatusLiteral = "draft"


class ProjectUpdate(BaseModel):
    title: PlainText | None = Field(default=None, min_length=1, max_length=200)
    slug: Slug | None = Field(default=None, max_length=128)
    description: PlainText | None = Field(default=None, max_length=500)
    tech_stack: list[PlainText] | None = Field(default=None, max_length=24)
    github_url: SafeUrl | None = Field(default=None, max_length=512)
    demo_url: SafeUrl | None = Field(default=None, max_length=512)
    screenshots: list[SafeUrl] | None = Field(default=None, max_length=12)
    year: int | None = Field(default=None, ge=1900, le=3000)
    leader: PlainText | None = Field(default=None, max_length=64)
    content_md: MultilineText | None = Field(default=None, min_length=1, max_length=200_000)
    status: ProjectStatusLiteral | None = None


class ProjectBriefOut(BaseModel):
    """列表项：不含正文。"""
    id: int
    title: str
    slug: str
    description: str
    tech_stack: list[str]
    github_url: str | None
    demo_url: str | None
    screenshots: list[str]
    year: int
    leader: str
    status: str
    created_at: UTCDatetime
    updated_at: UTCDatetime

    model_config = {"from_attributes": True}


class ProjectOut(ProjectBriefOut):
    """详情：含原始 Markdown 正文（前端 Markdown 阅读器渲染）。"""
    content_md: str
