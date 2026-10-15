"""学校身份人工验证（Module D-1）Pydantic 模型。

状态流转：未提交 →（用户提交）pending →（管理员）approved / rejected；
rejected 允许重新提交；pending 期间禁止重复提交。
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

import re

STUDENT_ID_PATTERN = re.compile(r"^\d{11}$")


class SchoolVerifySubmit(BaseModel):
    student_id: str
    college_id: int
    major_id: int
    grade_id: int
    class_id: int
    remark: str | None = None
    attach_url: str | None = None

    @field_validator("student_id")
    @classmethod
    def _student_id(cls, v: str) -> str:
        v = v.strip()
        if not STUDENT_ID_PATTERN.fullmatch(v):
            raise ValueError("学号必须是 11 位纯数字")
        return v

    @field_validator("remark")
    @classmethod
    def _remark(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        return v[:1000] if v else None

    @field_validator("attach_url")
    @classmethod
    def _attach(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        v = v.strip()
        if len(v) > 512 or not v.startswith("/"):
            raise ValueError("附件链接无效")
        return v


class SchoolVerifyApplicationOut(BaseModel):
    """申请记录（联表输出学院/专业/年级/班级展示文本由 API 层组装）。"""
    id: int
    user_id: int
    student_id: str
    college_id: int
    major_id: int
    grade_id: int
    class_id: int
    remark: str | None
    attach_url: str | None
    status: str
    admin_remark: str | None
    created_at: datetime
    reviewed_at: datetime | None

    # 联表展示文本（API 层填充）
    username: str | None = None
    display_name: str | None = None
    college_name: str | None = None
    major_name: str | None = None
    grade_year: int | None = None
    class_display_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SchoolVerifyStatusOut(BaseModel):
    """当前用户的学校验证状态（个人设置页）。"""
    identity_school_verified: bool
    # none / pending / approved / rejected（以最近一次申请为准）
    status: str
    latest: SchoolVerifyApplicationOut | None = None
    # 全部申请历史（含驳回记录）
    history: list[SchoolVerifyApplicationOut] = []


class SchoolVerifyReviewRequest(BaseModel):
    action: str  # approved / rejected
    admin_remark: str | None = None

    @field_validator("action")
    @classmethod
    def _action(cls, v: str) -> str:
        if v not in ("approved", "rejected"):
            raise ValueError("action 仅支持 approved / rejected")
        return v

    @field_validator("admin_remark")
    @classmethod
    def _remark(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        return v[:1000] if v else None


class SchoolVerifyAdminOut(BaseModel):
    id: int
    user_id: int
    student_id: str
    college_id: int
    major_id: int
    grade_id: int
    class_id: int
    remark: str | None
    attach_url: str | None
    status: str
    admin_remark: str | None
    created_at: datetime
    reviewed_at: datetime | None
    username: str
    display_name: str | None
    college_name: str | None = None
    major_name: str | None = None
    grade_year: int | None = None
    class_display_name: str | None = None

    model_config = ConfigDict(from_attributes=True)
