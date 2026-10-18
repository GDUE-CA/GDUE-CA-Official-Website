"""社团报名（Module D-2）Pydantic 模型。

重要隔离规则：社团报名 ≠ 学校身份验证；报名不自动开启 identity_school_verified。
校验策略：仅校验学院、专业 ID 合法有效；不校验年级/班级是否存在于 sys_class
（兼容尚未录入系统的新生）。学号：11 位数字 + 后端年份区间校验（普通用户提交）。
"""
from datetime import datetime

import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common import UTCDatetime

STUDENT_ID_PATTERN = re.compile(r"^\d{11}$")
CLASS_SUFFIX_PATTERN = re.compile(r"^[A-Z]$")
ALLOWED_DEPARTMENT_LEN = 64
MAX_DEPARTMENTS = 10


class ClubApplySubmit(BaseModel):
    real_name: str
    phone: str
    email: str | None = None
    # 仅限本校在读学生报名（校外社会报名通道已移除）
    applicant_type: str = "school"
    # —— 本校在读学生必填字段 ——
    student_id: str
    college_id: int
    major_id: int
    enroll_year: int
    class_suffix: str | None = None
    # —— 通用 ——
    departments: list[str]
    intro: str | None = None

    @field_validator("real_name")
    @classmethod
    def _real_name(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 64:
            raise ValueError("姓名不能为空且不超过 64 字")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 32:
            raise ValueError("手机号不能为空且不超过 32 字符")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        v = v.strip()
        if len(v) > 128 or "@" not in v:
            raise ValueError("邮箱格式无效")
        return v

    @field_validator("applicant_type")
    @classmethod
    def _type(cls, v: str) -> str:
        if v != "school":
            raise ValueError("仅接受本校在读学生报名")
        return v

    @field_validator("student_id")
    @classmethod
    def _student_id(cls, v: str) -> str:
        v = v.strip()
        if not STUDENT_ID_PATTERN.fullmatch(v):
            raise ValueError("学号必须是 11 位纯数字")
        return v

    @field_validator("enroll_year")
    @classmethod
    def _year(cls, v: int) -> int:
        # 4 位数字年份校验（合理性区间由 API 层按业务校验：1900-2999 宽松即可）
        if v < 1900 or v > 2999:
            raise ValueError("入学年份必须为 4 位数字年份")
        return v

    @field_validator("class_suffix")
    @classmethod
    def _suffix(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        v = v.strip().upper()
        if not CLASS_SUFFIX_PATTERN.fullmatch(v):
            raise ValueError("班号后缀必须为大写字母 A-Z")
        return v

    @field_validator("departments")
    @classmethod
    def _departments(cls, v: list[str]) -> list[str]:
        cleaned = []
        for d in v:
            d = (d or "").strip()
            if not d:
                continue
            if len(d) > ALLOWED_DEPARTMENT_LEN:
                raise ValueError(f"意向部门「{d[:20]}…」超过 {ALLOWED_DEPARTMENT_LEN} 字")
            if d not in cleaned:
                cleaned.append(d)
        if not cleaned:
            raise ValueError("请至少选择一个意向部门")
        if len(cleaned) > MAX_DEPARTMENTS:
            raise ValueError(f"意向部门最多 {MAX_DEPARTMENTS} 个")
        return cleaned

    @field_validator("intro")
    @classmethod
    def _intro(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        return v[:2000] if v else None


class MyClubApplyOut(BaseModel):
    """本人报名进度（最小化：不含内部主键 / user_id / 审核人 / 提交时填写的个人信息）。"""
    receipt_code: str | None
    status: str
    departments: list
    college: str | None
    major: str | None
    class_name: str | None
    # 仅被拒绝时回传审核备注作为拒绝原因；通过时的备注属内部意见，不外泄
    reject_reason: str | None
    created_at: UTCDatetime
    reviewed_at: UTCDatetime | None


class ClubApplyOut(BaseModel):
    id: int
    # V0.5.9 起访客免注册报名 user_id 为 NULL
    user_id: int | None
    real_name: str
    phone: str
    email: str | None
    applicant_type: str
    student_id: str | None
    college_id: int | None
    major_id: int | None
    enroll_year: int | None
    class_suffix: str | None
    college: str | None
    major: str | None
    class_name: str | None
    departments: list
    intro: str | None
    status: str
    admin_note: str | None
    created_at: datetime
    reviewed_at: datetime | None
    # 联表补充（API 层填充）
    username: str | None = None
    display_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ClubApplyReviewRequest(BaseModel):
    action: str  # accept / reject
    admin_note: str | None = None

    @field_validator("action")
    @classmethod
    def _action(cls, v: str) -> str:
        if v not in ("accept", "reject"):
            raise ValueError("action 仅支持 accept / reject")
        return v

    @field_validator("admin_note")
    @classmethod
    def _note(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        return v[:1000] if v else None


# ---------- V0.5.9 需求5：访客免注册报名 ----------
class ClubApplyPublicSendCodeRequest(BaseModel):
    """访客报名第一步：发送 6 位邮箱验证码。

    邮箱非法时不抛 422，由接口层返回 ok:false（HTTP 200），故用裸 str + 接口层校验。
    """
    email: str = Field(min_length=1, max_length=128)


class ClubApplyGuestSubmit(ClubApplySubmit):
    """访客免注册社团报名：在登录版字段基础上追加必填邮箱 + 一次性验证码。"""
    email: EmailStr  # type: ignore[assignment]  # 访客必填（覆盖父类 Optional）
    code: str

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("验证码为 6 位数字")
        return v


# ---------- V0.6.0 Issue6：意向部门选项动态化 ----------
class ClubDepartmentIn(BaseModel):
    """新增意向部门选项（中英双语名必填）。"""
    name_zh: str
    name_en: str
    enabled: bool = True
    sort_order: int = 0

    @field_validator("name_zh", "name_en")
    @classmethod
    def _name(cls, v: str) -> str:
        v = (v or "").strip()
        if not v or len(v) > 64:
            raise ValueError("部门名称不能为空且不超过 64 字")
        return v


class ClubDepartmentUpdate(BaseModel):
    """编辑意向部门选项（部分更新；None = 保持原值）。"""
    name_zh: str | None = None
    name_en: str | None = None
    enabled: bool | None = None
    sort_order: int | None = None

    @field_validator("name_zh", "name_en")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v or len(v) > 64:
            raise ValueError("部门名称不能为空且不超过 64 字")
        return v
