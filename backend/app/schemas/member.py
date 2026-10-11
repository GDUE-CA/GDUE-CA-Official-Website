"""成员管理 Pydantic 模型。

花名册扩展字段（性别/年級/院系/班级/电话/微信/政治面貌/留学生）来自
Excel 批量导入；其中电话、微信、政治面貌、留学生标识仅管理端可见，
不进入公开接口（MemberOut），防止个人信息泄露。
"""
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import MultilineText, PlainText, SafeUrl, UTCDatetime


class MemberCreate(BaseModel):
    name: PlainText = Field(min_length=1, max_length=64)
    role_title: PlainText | None = Field(default=None, max_length=64)
    term: Literal["current", "former"] = "current"
    bio: MultilineText | None = Field(default=None, max_length=2_000)
    avatar_url: SafeUrl | None = Field(default=None, max_length=512)
    display_order: int = Field(default=0, ge=-10000, le=10000)
    archived: bool = False
    # 花名册扩展字段
    gender: PlainText | None = Field(default=None, max_length=8)
    grade: PlainText | None = Field(default=None, max_length=32)
    department: PlainText | None = Field(default=None, max_length=64)
    major_class: PlainText | None = Field(default=None, max_length=64)
    phone: PlainText | None = Field(default=None, max_length=32)
    wechat: PlainText | None = Field(default=None, max_length=64)
    political_status: PlainText | None = Field(default=None, max_length=32)
    is_intl_student: bool = False


class MemberUpdate(BaseModel):
    name: PlainText | None = Field(default=None, min_length=1, max_length=64)
    role_title: PlainText | None = Field(default=None, max_length=64)
    term: Literal["current", "former"] | None = None
    bio: MultilineText | None = Field(default=None, max_length=2_000)
    avatar_url: SafeUrl | None = Field(default=None, max_length=512)
    display_order: int | None = Field(default=None, ge=-10000, le=10000)
    archived: bool | None = None
    # 花名册扩展字段
    gender: PlainText | None = Field(default=None, max_length=8)
    grade: PlainText | None = Field(default=None, max_length=32)
    department: PlainText | None = Field(default=None, max_length=64)
    major_class: PlainText | None = Field(default=None, max_length=64)
    phone: PlainText | None = Field(default=None, max_length=32)
    wechat: PlainText | None = Field(default=None, max_length=64)
    political_status: PlainText | None = Field(default=None, max_length=32)
    is_intl_student: bool | None = None


class MemberOut(BaseModel):
    """公开接口：仅含可公开展示字段（不含电话/微信/政治面貌/留学生标识）。"""

    id: int
    name: str
    role_title: str | None
    term: str
    bio: str | None
    avatar_url: str | None
    display_order: int
    archived: bool
    created_at: UTCDatetime
    gender: str | None = None
    grade: str | None = None
    department: str | None = None
    major_class: str | None = None

    model_config = {"from_attributes": True}


class MemberAdminOut(MemberOut):
    """管理端接口：在公开字段基础上追加敏感花名册字段。"""

    phone: str | None = None
    wechat: str | None = None
    political_status: str | None = None
    is_intl_student: bool = False


class AvatarUploadOut(BaseModel):
    avatar_url: str


class MemberBatchUpdate(BaseModel):
    """批量修改届别 / 职务：至少指定其中一项。"""

    ids: list[int] = Field(min_length=1, max_length=500)
    term: Literal["current", "former"] | None = None
    role_title: PlainText | None = Field(default=None, max_length=64)


class MemberImportError(BaseModel):
    row: int
    name: str
    reason: str


class MemberImportOut(BaseModel):
    total: int
    created: int
    updated: int
    skipped: int
    errors: list[MemberImportError] = []
