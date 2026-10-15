"""系统基础数据（学院/年级/专业/班级）Pydantic 模型。

全部数据库存储、后台管理员维护；不提供物理删除（仅启用/禁用软控制）。
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


# ---------- 公开列表 ----------
class SysCollegeOut(BaseModel):
    id: int
    college_name: str
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class SysGradeOut(BaseModel):
    id: int
    grade_year: int
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class SysMajorOut(BaseModel):
    id: int
    college_id: int
    major_name: str
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class SysClassOut(BaseModel):
    id: int
    college_id: int | None
    grade_id: int | None
    major_id: int | None
    class_suffix: str | None
    display_name: str
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


# ---------- 后台管理（含禁用状态与时间戳） ----------
class SysCollegeAdminOut(SysCollegeOut):
    is_disabled: bool
    created_at: datetime
    updated_at: datetime


class SysGradeAdminOut(SysGradeOut):
    is_disabled: bool
    created_at: datetime
    updated_at: datetime


class SysMajorAdminOut(SysMajorOut):
    is_disabled: bool
    created_at: datetime
    updated_at: datetime


class SysClassAdminOut(SysClassOut):
    is_disabled: bool
    created_at: datetime
    updated_at: datetime


# ---------- 创建 / 更新 ----------
class SysCollegeCreate(BaseModel):
    college_name: str
    sort_order: int = 0

    @field_validator("college_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 128:
            raise ValueError("学院名称不能为空且不超过 128 字")
        return v


class SysCollegeUpdate(BaseModel):
    college_name: str | None = None
    sort_order: int | None = None

    @field_validator("college_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v or len(v) > 128:
            raise ValueError("学院名称不能为空且不超过 128 字")
        return v


class SysGradeCreate(BaseModel):
    grade_year: int
    sort_order: int = 0

    @field_validator("grade_year")
    @classmethod
    def _year(cls, v: int) -> int:
        if v < 1900 or v > 2999:
            raise ValueError("年级必须为 4 位入学年份")
        return v


class SysGradeUpdate(BaseModel):
    grade_year: int | None = None
    sort_order: int | None = None

    @field_validator("grade_year")
    @classmethod
    def _year(cls, v: int | None) -> int | None:
        if v is None:
            return v
        if v < 1900 or v > 2999:
            raise ValueError("年级必须为 4 位入学年份")
        return v


class SysMajorCreate(BaseModel):
    college_id: int
    major_name: str
    sort_order: int = 0

    @field_validator("major_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 128:
            raise ValueError("专业名称不能为空且不超过 128 字")
        return v


class SysMajorUpdate(BaseModel):
    college_id: int | None = None
    major_name: str | None = None
    sort_order: int | None = None

    @field_validator("major_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v or len(v) > 128:
            raise ValueError("专业名称不能为空且不超过 128 字")
        return v


class SysClassCreate(BaseModel):
    college_id: int | None = None
    grade_id: int | None = None
    major_id: int | None = None
    class_suffix: str | None = None
    display_name: str
    sort_order: int = 0

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 128:
            raise ValueError("班级显示名不能为空且不超过 128 字")
        return v

    @field_validator("class_suffix")
    @classmethod
    def _suffix(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        v = v.strip().upper()
        if len(v) > 8:
            raise ValueError("班号后缀不超过 8 字符")
        return v


class SysClassUpdate(BaseModel):
    college_id: int | None = None
    grade_id: int | None = None
    major_id: int | None = None
    class_suffix: str | None = None
    display_name: str | None = None
    sort_order: int | None = None

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v or len(v) > 128:
            raise ValueError("班级显示名不能为空且不超过 128 字")
        return v

    @field_validator("class_suffix")
    @classmethod
    def _suffix(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        v = v.strip().upper()
        if len(v) > 8:
            raise ValueError("班号后缀不超过 8 字符")
        return v


# ---------- 拖拽排序 / 启停 ----------
class SysSortRequest(BaseModel):
    """拖拽排序：按前端提交后的新顺序传 id 列表，依序写入 sort_order。"""
    ids: list[int]


class SysEnabledRequest(BaseModel):
    is_disabled: bool
