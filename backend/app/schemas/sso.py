"""自建 SSO 授权服务器的请求/响应模型。"""
from pydantic import BaseModel, Field

from app.schemas.common import UTCDatetime


class SsoClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    redirect_uris: list[str] = Field(min_length=1)


class SsoClientUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    redirect_uris: list[str] | None = None
    is_active: bool | None = None


class SsoClientOut(BaseModel):
    """受信应用输出：client_secret 仅创建 / 重置时一次性返回明文（secret 字段）。"""
    id: int
    client_id: str
    name: str
    redirect_uris: list[str]
    is_active: bool
    created_at: UTCDatetime
    # 仅创建 / 重置响应中非空
    secret: str | None = None


class SsoTokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int


class SsoUserInfo(BaseModel):
    """SSO 用户信息（最小化：不含手机号 / 学号等敏感字段）。"""
    sub: str
    username: str
    role: str
    realname_verified: bool
