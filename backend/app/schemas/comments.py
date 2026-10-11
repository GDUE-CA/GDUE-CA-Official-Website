"""评论系统 Pydantic 模型（软删除 + IP 属地 + 全局开关）。

评论内容为纯文本（前端 React 转义渲染），MultilineText 清洗控制字符即视为消毒；
完整 submit_ip 仅后台管理接口返回，公开接口只暴露属地（location_zh/en）。
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import MultilineText, PlainText, UTCDatetime


class CommentCreate(BaseModel):
    """访客发表评论（无账号，昵称 + 内容）。"""
    author_name: PlainText = Field(min_length=1, max_length=64)
    content: MultilineText = Field(min_length=1, max_length=1000)


class CommentPublic(BaseModel):
    """公开评论：绝不返回完整 IP，只返回属地。"""
    id: int
    post_id: int
    author_name: str
    content: str
    location_zh: str | None
    location_en: str | None
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


class CommentAdminOut(CommentPublic):
    """后台评论：含完整 IP 溯源 + 状态 + 所属文章标题。"""
    submit_ip: str | None
    status: Literal["visible", "user_deleted", "admin_removed"]
    deleted_at: UTCDatetime | None
    post_title: str | None = None


class CommentSettingsOut(BaseModel):
    """评论全局开关（存 SystemSetting.comments_enabled）。"""
    comments_enabled: bool


class CommentSettingsUpdate(BaseModel):
    comments_enabled: bool
