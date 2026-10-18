"""评论系统 Pydantic 模型（软删除 + IP 属地 + 全局开关）。

评论内容为纯文本（前端 React 转义渲染），MultilineText 清洗控制字符即视为消毒；
完整 submit_ip 仅后台管理接口返回，公开接口只暴露属地（location_zh/en）与设备类别。
"""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import MultilineText, PlainText, UTCDatetime


class CommentCreate(BaseModel):
    """发表评论（昵称 + 内容）；登录用户的昵称以账号显示名为准，此字段被忽略。"""
    author_name: PlainText = Field(min_length=1, max_length=64)
    content: MultilineText = Field(min_length=1, max_length=1000)


class CommentPublic(BaseModel):
    """公开评论：绝不返回完整 IP / 原始 UA / 内部用户 id，只返回属地与设备类别。

    author_username / author_avatar_url 仅登录用户发表且账号仍有效时有值
    （前端据此展示头像与主页链接；匿名评论前端按昵称生成首字母头像）。
    """
    id: int
    post_id: int
    author_name: str
    content: str
    location_zh: str | None
    location_en: str | None
    device: str | None = None
    author_username: str | None = None
    author_avatar_url: str | None = None
    created_at: UTCDatetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _author_from_orm(cls, data: Any) -> Any:
        """ORM 对象：从预加载的 author_user 取用户名 / 头像（账号已注销则视同匿名）。"""
        user = getattr(data, "author_user", None)
        if user is None or isinstance(data, dict):
            return data
        if getattr(user, "is_deleted", False) or not getattr(user, "is_active", True):
            return data
        return {
            **{k: getattr(data, k) for k in (
                "id", "post_id", "author_name", "content", "location_zh", "location_en",
                "device", "created_at",
            )},
            # 管理端子类需要的字段（CommentAdminOut 继承本模型）
            **{k: getattr(data, k) for k in ("submit_ip", "is_deleted", "is_hidden", "deleted_at")
               if hasattr(data, k)},
            "author_username": user.username,
            "author_avatar_url": user.avatar_url,
        }


class CommentAdminOut(CommentPublic):
    """后台评论：含完整 IP 溯源 + 双布尔状态 + 所属文章标题。"""
    submit_ip: str | None
    is_deleted: bool
    is_hidden: bool
    # 状态标签 key（前端 i18n 渲染）：normal / user_deleted / admin_hidden
    status_label: str | None = None
    deleted_at: UTCDatetime | None
    post_title: str | None = None


class CommentSettingsOut(BaseModel):
    """评论全局开关（存 SystemSetting.comments_enabled）。"""
    comments_enabled: bool


class CommentSettingsUpdate(BaseModel):
    comments_enabled: bool
