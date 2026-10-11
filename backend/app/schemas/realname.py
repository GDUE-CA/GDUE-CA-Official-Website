"""实名验证的请求/响应模型。"""
from pydantic import BaseModel, Field

from app.schemas.common import UTCDatetime


class RealnameSubmit(BaseModel):
    """提交实名申请：学号 + 真实姓名 + 手机号（区号+号码）+ 可选凭证图片 URL。"""
    student_id: str = Field(min_length=1, max_length=32)
    real_name: str = Field(min_length=1, max_length=64)
    phone_cc: str = Field(min_length=2, max_length=16)
    phone_number: str = Field(min_length=5, max_length=32)
    evidence_url: str | None = Field(default=None, max_length=512)


class RealnameRequestOut(BaseModel):
    """实名申请输出（管理端：含申请者账号信息）。"""
    model_config = {"from_attributes": True}

    id: int
    user_id: int
    username: str | None = None
    student_id: str
    real_name: str
    phone: str
    evidence_url: str | None = None
    status: str
    note: str | None = None
    submitted_at: UTCDatetime
    reviewed_at: UTCDatetime | None = None
    # 申请者当前实名状态（用户已审核通过后再次提交的边界展示）
    user_realname_verified: bool | None = None


class RealnameReject(BaseModel):
    note: str = Field(min_length=1, max_length=500)


class RealnameStatusOut(BaseModel):
    """用户端实名状态：当前账号实名状态 + 最近一次申请。"""
    verified: bool
    verified_at: UTCDatetime | None = None
    latest: RealnameRequestOut | None = None
