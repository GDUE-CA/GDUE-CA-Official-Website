"""第三方 OAuth 登录接口的请求/响应模型。"""
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import UTCDatetime


class ChannelBrief(BaseModel):
    """公开渠道开关（登录页显隐按钮用，不含任何凭据信息）。"""
    provider: str
    enabled: bool


class ChannelOut(BaseModel):
    """后台渠道配置输出（secret 永不回传明文，仅展示脱敏掩码）。"""
    provider: str
    enabled: bool
    client_id: str | None = None
    has_secret: bool = False
    secret_masked: str | None = None
    redirect_uri: str | None = None
    updated_at: UTCDatetime | None = None


class ChannelUpdate(BaseModel):
    """后台渠道配置更新：client_secret 传明文则重新加密保存，空串=清除。"""
    enabled: bool | None = None
    client_id: str | None = Field(default=None, max_length=256)
    client_secret: str | None = Field(default=None, max_length=8192)
    redirect_uri: str | None = Field(default=None, max_length=512)


class PendingProfile(BaseModel):
    """补资料页展示的第三方预填信息（不含敏感凭据）。"""
    provider: str
    email: str | None = None
    name: str | None = None
    avatar: str | None = None


class CompleteProfileRequest(BaseModel):
    """第三方首次登录后的补资料请求：用户名必须手动自定义（禁用第三方昵称）。"""
    username: str = Field(min_length=2, max_length=64)
    student_id: str = Field(min_length=1, max_length=32)
    real_name: str = Field(min_length=1, max_length=64)
    phone_cc: str = Field(min_length=2, max_length=16)
    phone_number: str = Field(min_length=5, max_length=32)
