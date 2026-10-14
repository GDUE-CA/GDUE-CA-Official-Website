"""账号自服务（/setting）Pydantic 模型：界面显示偏好 / 通知偏好 / 黑名单 / OAuth 授权。"""
from datetime import datetime

from pydantic import BaseModel, Field


# ---------- 界面显示偏好 ----------
class DisplayPreferenceOut(BaseModel):
    theme_name: str | None = None
    color_scheme: str = "system"
    font_scale: float = 1.0
    enable_landscape: bool = True
    updated_at: datetime | None = None


class DisplayPreferenceUpdate(BaseModel):
    # 风格主题 key（default/apple/festival:*）；None 不传；空串 = 恢复默认（存 NULL）
    theme_name: str | None = Field(default=None, max_length=32)
    color_scheme: str | None = Field(default=None, pattern="^(light|dark|system)$")
    font_scale: float | None = Field(default=None, ge=0.85, le=1.30)
    enable_landscape: bool | None = None


# ---------- 通知偏好 ----------
class NotificationPreferenceOut(BaseModel):
    # 内容互动
    content_liked: bool = True
    content_commented: bool = True
    content_replied: bool = True
    # 业务协作
    biz_task_assigned: bool = True
    biz_task_changed: bool = True
    biz_announcement: bool = True
    # 账号安全（恒为 True，仅展示）
    security_new_device: bool = True
    security_credential_change: bool = True
    security_notice_locked: bool = True
    updated_at: datetime | None = None


class NotificationPreferenceUpdate(BaseModel):
    """仅内容互动 / 业务协作 6 项可改；安全类开关后端忽略，恒为 True。"""
    content_liked: bool | None = None
    content_commented: bool | None = None
    content_replied: bool | None = None
    biz_task_assigned: bool | None = None
    biz_task_changed: bool | None = None
    biz_announcement: bool | None = None


# ---------- 黑名单 ----------
class BlockedUserOut(BaseModel):
    id: int
    username: str
    display_name: str | None = None
    avatar_url: str | None = None
    blocked_at: datetime


class BlockCreate(BaseModel):
    user_id: int | None = Field(default=None, ge=1)
    username: str | None = Field(default=None, max_length=64)


class BlockedUserBrief(BaseModel):
    """拉黑搜索结果（公开最小信息）。"""
    id: int
    username: str
    display_name: str | None = None
    avatar_url: str | None = None


# ---------- OAuth 授权 ----------
class OAuthGrantOut(BaseModel):
    id: int
    provider: str
    created_at: datetime
