"""活动管理 Pydantic 模型。"""
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import MultilineText, PlainText, SafeUrl, UTCNaive, UTCDatetime


class ActivityStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    REGISTRATION_OPEN = "registration_open"
    ENDED = "ended"
    ARCHIVED = "archived"


class RuntimeStatus(str, Enum):
    """业务运行时状态（后端实时计算，不存入数据库；P0 规范五态 + 草稿/归档）。"""
    PRE_REGISTER = "pre_register"          # 预报名（报名窗口未开始）
    REGISTRATION_OPEN = "registration_open"  # 报名中
    UPCOMING = "upcoming"                  # 即将进行（报名截止、活动未开始）
    ONGOING = "ongoing"                    # 进行中
    ENDED = "ended"                        # 已结束
    DRAFT = "draft"                        # 草稿（仅后台可见）
    ARCHIVED = "archived"                  # 已归档


class ActivityCreate(BaseModel):
    title: PlainText = Field(min_length=1, max_length=200)
    # 前台展示标识（slug）：历史数据迁移自 markdown；留空则无 slug
    slug: PlainText | None = Field(default=None, max_length=64)
    # 列表短描述：前台活动列表 / 首页近期活动栏目展示
    description: PlainText | None = Field(default=None, max_length=300)
    # Markdown 正文：前端用 react-markdown 渲染（不启用原始 HTML），这里只做清洗
    content: MultilineText = Field(max_length=50_000)
    category: PlainText | None = Field(default=None, max_length=64)
    status: ActivityStatus = ActivityStatus.DRAFT
    register_start: UTCNaive | None = None
    register_end: UTCNaive | None = None
    # 活动开始/结束时间（Phase 3：发布活动时双必填）
    start_at: UTCNaive | None = None
    end_at: UTCNaive | None = None
    max_participants: int = Field(default=0, ge=0, le=100_000)  # 0 = 无上限
    # 实际参与人数（历史活动统计值；空 = 未统计）
    participants: int | None = Field(default=None, ge=0, le=10_000_000)
    cover_url: SafeUrl | None = Field(default=None, max_length=512)

    @model_validator(mode="after")
    def _check_required_times(self) -> "ActivityCreate":
        """category 可选但 DB 列 NOT NULL，未分类时落空串。"""
        if self.category is None:
            self.category = ""
        """发布（非草稿）活动必须填写活动开始与结束时间。"""
        if self.status != ActivityStatus.DRAFT:
            if not self.start_at or not self.end_at:
                raise ValueError("发布活动必须填写活动开始时间与活动结束时间")
            if self.start_at >= self.end_at:
                raise ValueError("活动开始时间必须早于活动结束时间")
        if self.start_at and self.end_at and self.start_at >= self.end_at:
            raise ValueError("活动开始时间必须早于活动结束时间")
        if self.register_start and self.register_end and self.register_start >= self.register_end:
            raise ValueError("报名开始时间必须早于报名结束时间")
        return self


class ActivityUpdate(BaseModel):
    title: PlainText | None = Field(default=None, min_length=1, max_length=200)
    slug: PlainText | None = Field(default=None, max_length=64)
    description: PlainText | None = Field(default=None, max_length=300)
    content: MultilineText | None = Field(default=None, max_length=50_000)
    category: PlainText | None = Field(default=None, max_length=64)
    status: ActivityStatus | None = None
    register_start: UTCNaive | None = None
    register_end: UTCNaive | None = None
    start_at: UTCNaive | None = None
    end_at: UTCNaive | None = None
    max_participants: int | None = Field(default=None, ge=0, le=100_000)
    participants: int | None = Field(default=None, ge=0, le=10_000_000)
    cover_url: SafeUrl | None = Field(default=None, max_length=512)
    checkin_open: bool | None = None  # 签到开关


class ActivityOut(BaseModel):
    id: int
    title: str
    slug: str | None
    description: str
    content: str
    category: str | None
    status: ActivityStatus
    register_start: UTCDatetime | None
    register_end: UTCDatetime | None
    start_at: UTCDatetime | None
    end_at: UTCDatetime | None
    max_participants: int
    participants: int | None
    cover_url: str | None
    checkin_open: bool
    # 一键报名人数（activity_enrols 表 is_deleted=False 计数；后端实时计算）
    enrolled_count: int = 0
    # 当前登录用户是否已报名（仅登录态请求填充；游客恒为 False）
    enrolled: bool = False
    # 实时业务状态（start_at/end_at/报名窗口 + 当前 UTC 时间即时计算，不存库）
    runtime_status: RuntimeStatus | None = None
    created_at: UTCDatetime
    updated_at: UTCDatetime

    model_config = {"from_attributes": True}
