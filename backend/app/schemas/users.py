"""用户个人主页公开 Pydantic 模型。

隐私规则（与 app/api/users.py:_public_profile 对应）：
- 地区字段永久公开（硬性约束，用户不可关闭）；
- bio / gender / birthday 受 profile_privacy JSON 控制，privacy=private 时返回 None；
- gender='hidden' 时即使 privacy=public 也返回 None（用户显式选择「不显示」）。
"""
from app.schemas.common import UTCDatetime
from pydantic import BaseModel


class UserProfileOut(BaseModel):
    """用户公开个人主页信息（隐私过滤后）。"""
    id: int
    username: str
    display_name: str
    avatar_url: str | None = None
    bio: str | None = None
    gender: str | None = None
    birthday: UTCDatetime | None = None
    # ---- 地区字段（永久公开） ----
    country: str | None = None
    region: str | None = None
    locality: str | None = None
    country_code: str | None = None
    subdiv1_code: str | None = None
    subdiv2_code: str | None = None
    locality_text: str | None = None
    created_at: UTCDatetime

    model_config = {"from_attributes": True}
