"""Memo 碎片笔记 Pydantic 模型。

设计要点：
- 标签输入仅接受 `tag_names` 字符串数组（#TagName 形式），后端懒创建
- 内容 Markdown 后端清洗控制字符；存原文 content_md，前端按需渲染
- 列表 / 详情 / 个人中心 / 归档 / 历史版本独立 schema，避免字段串台
- 公共字段：`UTCDatetime`（输出带大写 Z 的 ISO 字符串）、`UTCNaive`（输入统一 naive UTC）
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import MultilineText, UTCDatetime


# ---------- 标签输入（创建/编辑共用） ----------
# 单个标签最大 64 字符；最多 20 个；每个标签仅做去首尾空格 + 小写化（slug 派生）
_TAG_NAME_MAX = 64
_TAGS_MAX = 20


def _clean_tag_name(v: str) -> str:
    v = (v or "").strip()
    if not v:
        raise ValueError("标签名不能为空")
    if len(v) > _TAG_NAME_MAX:
        raise ValueError(f"标签名长度不能超过 {_TAG_NAME_MAX} 字符")
    # 标签名可含中英文/数字/_/-，禁止控制字符与空白分隔符
    if any(ch.isspace() for ch in v):
        raise ValueError("标签名不能包含空白字符（请使用连字符 - 或下划线 _ 分隔）")
    return v


TagNamesList = Annotated[list[str], Field(max_length=_TAGS_MAX)]
"""输入标签名列表：去重由后端处理；空字符串由 Pydantic 校验器拒绝。"""


# ---------- 可见性 ----------
MemoVisibilityLit = Literal["public", "member_only", "private"]


# ---------- 创建 ----------
class MemoCreate(BaseModel):
    """创建 Memo：content_md 必填；可见性 + 标签 + 附件可选。

    后端责任：
    1. Markdown 净化（仅去控制字符；渲染端再走 nh3 消毒）
    2. 标签懒创建（同名复用；scopes 追加 MEMO）
    3. 自动写入第一版本（version_no=1）
    """
    content_md: MultilineText = Field(min_length=1, max_length=20_000)
    visibility: MemoVisibilityLit = "public"
    tag_names: list[str] = Field(default_factory=list, max_length=_TAGS_MAX)
    # 附件 URL 列表（已上传到对象存储的引用；本字段仅前端编辑器在保存时聚合提交）
    attachment_urls: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("tag_names")
    @classmethod
    def _clean_tag_names(cls, v: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in v:
            try:
                n = _clean_tag_name(raw)
            except ValueError as e:
                raise ValueError(f"标签 '{raw}': {e}") from e
            key = n.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(n)
        return cleaned

    @field_validator("attachment_urls")
    @classmethod
    def _check_attachment_urls(cls, v: list[str]) -> list[str]:
        # 仅接受 /uploads/ 开头的站内相对路径；防止 SSRF 与 XSS
        for u in v:
            if not u or not u.startswith("/uploads/"):
                raise ValueError(f"附件 URL 必须以 /uploads/ 开头：{u}")
        return v


# ---------- 编辑 ----------
class MemoUpdate(BaseModel):
    """编辑 Memo：内容变更 → 自动产生版本快照（version_no+1）。
    标签 / 可见性 变更：不写入版本（仅在用户编辑正文时才算一次"版本"）。
    附件：仅编辑时可增，不可在此删（删除走单独接口 /attachments/{id}）。
    """
    content_md: MultilineText | None = Field(default=None, min_length=1, max_length=20_000)
    visibility: MemoVisibilityLit | None = None
    tag_names: list[str] | None = Field(default=None, max_length=_TAGS_MAX)
    attachment_urls: list[str] | None = Field(default=None, max_length=20)
    # 编辑原因（写入 memo_versions.edit_note，便于团队复盘）
    edit_note: str | None = Field(default=None, max_length=256)

    @field_validator("tag_names")
    @classmethod
    def _clean_tag_names(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in v:
            try:
                n = _clean_tag_name(raw)
            except ValueError as e:
                raise ValueError(f"标签 '{raw}': {e}") from e
            key = n.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(n)
        return cleaned


# ---------- 回滚 ----------
class MemoRollback(BaseModel):
    """回滚到指定版本：强制要求 edit_note 写明为什么回滚。"""
    target_version_no: int = Field(ge=1)
    edit_note: str = Field(min_length=1, max_length=256)


# ---------- 可见性输出辅助 ----------
class MemoVisibilityOut(BaseModel):
    """可见性枚举的对外常量（i18n key 由前端处理）。"""
    code: str
    label: str


# ---------- 标签输出（来自全站 tags 表） ----------
class TagOut(BaseModel):
    """全站共享标签。"""
    id: int
    name: str
    slug: str
    # 使用该标签的模块集合（前端按需展示"已用在 Blog/Memo/…"）
    scopes: list[str]
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


class TagWithCount(TagOut):
    """带跨模块关联总条数；COUNT(memo_tag_links) 等聚合。"""
    memo_count: int = 0


# ---------- 附件输出 ----------
class MemoAttachmentOut(BaseModel):
    id: int
    url: str
    original_name: str | None
    mime: str
    size: int
    kind: str  # "image" | "file"
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


# ---------- 作者摘要（嵌入到 Memo 输出中） ----------
class MemoAuthorBrief(BaseModel):
    """Memo 作者摘要：仅暴露 username + avatar_url，不暴露真实姓名/手机号/学号。"""
    id: int
    username: str
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


# ---------- Memo 详情 ----------
class MemoOut(BaseModel):
    """单条 Memo 完整输出：含 content_md 原文 + 渲染后 content_html（端点按需补）。"""
    id: int
    content_md: str
    content_html: str = ""
    archived: bool
    visibility: str
    share_slug: str | None
    like_count: int
    favorite_count: int
    comment_count: int
    author: MemoAuthorBrief | None
    tags: list[TagOut]
    attachments: list[MemoAttachmentOut]
    # 当前用户视角的互动状态（未登录时一律 false）
    liked_by_me: bool = False
    favorited_by_me: bool = False
    admin_removed: bool = False
    created_at: UTCDatetime
    updated_at: UTCDatetime

    model_config = {"from_attributes": True}


# ---------- Memo 简略（列表用） ----------
class MemoBriefOut(BaseModel):
    """时间线/列表项：不含正文，只给摘要 + 渲染预览（前端按需渲染）。"""
    id: int
    # 仅给前 280 字符的纯文本预览（后端从 content_md 派生）
    excerpt: str
    visibility: str
    archived: bool
    like_count: int
    favorite_count: int
    comment_count: int
    # 是否带图片附件（用于时间线卡片显示封面/缩略图）
    has_image: bool
    # 首张图片 URL（仅 has_image=true 时有意义）
    first_image_url: str | None = None
    author: MemoAuthorBrief | None
    tags: list[TagOut]
    liked_by_me: bool = False
    favorited_by_me: bool = False
    created_at: UTCDatetime
    updated_at: UTCDatetime

    model_config = {"from_attributes": True}


# ---------- Memo 版本输出 ----------
class MemoVersionOut(BaseModel):
    """版本快照列表项。"""
    id: int
    memo_id: int
    version_no: int
    content_md: str
    edit_note: str | None
    editor: MemoAuthorBrief | None
    visibility: str
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


class MemoVersionBriefOut(BaseModel):
    """版本列表（侧栏版本面板用）：不含正文。"""
    id: int
    memo_id: int
    version_no: int
    edit_note: str | None
    editor: MemoAuthorBrief | None
    visibility: str
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


# ---------- 创建响应 ----------
class MemoCreateOut(BaseModel):
    """创建后回传 id + 第一版本号 + 标签懒创建明细（前端可提示「已创建新标签」）。"""
    id: int
    version_no: int
    new_tags: list[str] = Field(default_factory=list)


# ---------- 分享链接响应 ----------
class MemoShareOut(BaseModel):
    """公开分享链接生成响应：前端拼接到 /memo/shared/{share_slug}。"""
    share_slug: str
    share_url: str  # 完整 URL（含 origin）
    visibility: str


# ---------- 互动结果 ----------
class MemoInteractionOut(BaseModel):
    """点赞 / 收藏 操作的统一响应：当前状态 + 最新计数。"""
    liked: bool
    favorited: bool
    like_count: int
    favorite_count: int


# ---------- 全文检索结果 ----------
class MemoSearchHit(BaseModel):
    """全文检索 hit（当前阶段为 SQL LIKE 占位，未来对接 Meilisearch 等）。"""
    memo: MemoBriefOut
    # 命中片段（仅 200 字符，含高亮）
    snippet: str
    # 命中关键词列表（便于前端高亮）
    matched_keywords: list[str] = Field(default_factory=list)


class MemoSearchResponse(BaseModel):
    """全文检索响应。"""
    items: list[MemoSearchHit]
    total: int