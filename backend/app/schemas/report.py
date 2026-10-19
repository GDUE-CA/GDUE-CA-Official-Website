"""V0.6.1 需求5：举报（Report）Pydantic 模型。

隐私隔离：举报人信息（reporter_user_id / reporter_ip）仅对具备
review.reports 权限的管理员输出，绝不下发给被举报对象。
"""
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.db.models import ReportStatus, ReportType
from app.schemas.common import MultilineText, UTCDatetime, clean_multiline_text


class ReportCreate(BaseModel):
    """访客 / 登录用户提交举报。

    user 类型可用 target_username（前台以 username 寻址）或 target_id 指定对象；
    blog / post 类型必须提供 target_id。
    """

    report_type: ReportType
    target_id: int | None = Field(default=None, ge=1)
    target_username: str | None = Field(default=None, max_length=64)
    reason: MultilineText = Field(min_length=2, max_length=2000)

    @field_validator("reason")
    @classmethod
    def _strip_reason(cls, v: str) -> str:
        # 基础内容过滤：剥除危险 HTML 标签 / 脚本协议（纵深防御，前端另有转义）
        return clean_multiline_text(v)[:2000]


class ReportReporterOut(BaseModel):
    """举报人信息（仅管理员可见，被举报用户不可见）。"""

    user_id: int | None = None
    username: str | None = None
    display_name: str | None = None


class ReportOut(BaseModel):
    """举报记录（管理端）。target_label 为资源预览文本，target_username 为被举报对象。"""

    id: int
    report_type: ReportType
    target_id: int
    target_label: str | None = None
    target_username: str | None = None
    reporter: ReportReporterOut | None = None
    reporter_ip: str | None = None
    reason: str
    status: ReportStatus
    admin_comment: str | None = None
    penalty: str | None = None
    created_at: UTCDatetime
    reviewed_at: UTCDatetime | None = None


class ReportListOut(BaseModel):
    items: list[ReportOut]
    total: int


class ReportReviewIn(BaseModel):
    """管理员审核：通过（可选处罚动作）或驳回。"""

    status: Literal["approved", "rejected"]
    admin_comment: str | None = None
    # 处罚动作：warning / hide_profile / ban_temp（用户类）；hide_content（博客/说人类）
    penalty: str | None = None
    # 临时封禁天数（仅 penalty=ban_temp 时生效；1~30 天）
    ban_days: int | None = Field(default=None, ge=1, le=30)


class ReportNotifySetting(BaseModel):
    """举报审核通知全局开关。"""

    notify_enabled: bool
