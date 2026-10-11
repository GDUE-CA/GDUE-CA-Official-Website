"""报名表单 Pydantic 模型（含国际区号校验）。"""
import re
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.schemas.common import MultilineText, PlainText, UTCDatetime

# 常见国家/地区区号
PHONE_COUNTRY_CODES = [
    "+86",   # 中国大陆
    "+852",  # 香港
    "+853",  # 澳门
    "+886",  # 台湾
    "+1",    # 美国/加拿大
    "+44",   # 英国
    "+81",   # 日本
    "+82",   # 韩国
    "+65",   # 新加坡
    "+61",   # 澳大利亚
    "+49",   # 德国
    "+33",   # 法国
    "+39",   # 意大利
    "+34",   # 西班牙
    "+7",    # 俄罗斯
    "+91",   # 印度
    "+60",   # 马来西亚
    "+63",   # 菲律宾
    "+66",   # 泰国
    "+84",   # 越南
    "+62",   # 印度尼西亚
    "+64",   # 新西兰
    "+55",   # 巴西
    "+52",   # 墨西哥
]
PhoneCcEnum = Enum("PhoneCc", {c.replace("+", "p"): c for c in PHONE_COUNTRY_CODES})


# 各国家/地区手机号本地格式正则（不含区号，不含前导 0）
_CN_PHONE = re.compile(r"^1[3-9]\d{9}$")          # 中国大陆 11 位
_HK_PHONE = re.compile(r"^[5-9]\d{7}$")            # 香港 8 位（5/6/7/8/9 开头）
_MO_PHONE = re.compile(r"^6\d{7}$")                # 澳门 8 位（6 开头）
_TW_PHONE = re.compile(r"^9\d{8}$")                # 台湾 9 位（9 开头）
_GB_PHONE = re.compile(r"^7[0-9]{9}$")             # 英国 10 位（7 开头移动号）
_US_PHONE = re.compile(r"^[2-9]\d{9}$")            # 美国/加拿大 10 位（区号首位 2-9）
_JP_PHONE = re.compile(r"^[7-9]0\d{8}$")           # 日本 10 位（70/80/90 开头移动号）
_KR_PHONE = re.compile(r"^1[016789]\d{8}$")        # 韩国 10 位（10/11/16-19 开头移动号）
_SG_PHONE = re.compile(r"^[89]\d{7}$")             # 新加坡 8 位（8/9 开头）
_AU_PHONE = re.compile(r"^4\d{8}$")                # 澳大利亚 9 位（4 开头移动号）
_DE_PHONE = re.compile(r"^[15-9]\d{8,10}$")        # 德国 10-11 位（移动号 15-16 或 16x 开头）
_FR_PHONE = re.compile(r"^[67]\d{8}$")             # 法国 9 位（6/7 开头移动号）
_IT_PHONE = re.compile(r"^3\d{8,9}$")              # 意大利 9-10 位（3 开头移动号）
_ES_PHONE = re.compile(r"^[67]\d{8}$")             # 西班牙 9 位（6/7 开头移动号）
_RU_PHONE = re.compile(r"^9\d{9}$")                # 俄罗斯 10 位（9 开头移动号）
_IN_PHONE = re.compile(r"^[6-9]\d{9}$")            # 印度 10 位（6-9 开头）
_MY_PHONE = re.compile(r"^1[1-9]\d{7,8}$")         # 马来西亚 9-10 位（1x 开头）
_PH_PHONE = re.compile(r"^9\d{9}$")                # 菲律宾 10 位（9 开头）
_TH_PHONE = re.compile(r"^[6-9]\d{7,8}$")          # 泰国 8-9 位
_VN_PHONE = re.compile(r"^[3-9]\d{7,8}$")          # 越南 8-9 位（3-9 开头）
_ID_PHONE = re.compile(r"^8\d{7,11}$")             # 印度尼西亚 8-12 位（8 开头移动号）
_NZ_PHONE = re.compile(r"^2[0-9]{6,8}$")           # 新西兰 7-9 位
_BR_PHONE = re.compile(r"^[1-9]\d{8,10}$")         # 巴西 9-11 位
_MX_PHONE = re.compile(r"^[1-9]\d{9}$")            # 墨西哥 10 位

# 区号 -> (国家中文名, 正则) 映射
_PHONE_RULES: dict[str, tuple[str, re.Pattern]] = {
    "+86":  ("中国大陆", _CN_PHONE),
    "+852": ("中国香港", _HK_PHONE),
    "+853": ("中国澳门", _MO_PHONE),
    "+886": ("中国台湾", _TW_PHONE),
    "+44":  ("英国", _GB_PHONE),
    "+1":   ("美国/加拿大", _US_PHONE),
    "+81":  ("日本", _JP_PHONE),
    "+82":  ("韩国", _KR_PHONE),
    "+65":  ("新加坡", _SG_PHONE),
    "+61":  ("澳大利亚", _AU_PHONE),
    "+49":  ("德国", _DE_PHONE),
    "+33":  ("法国", _FR_PHONE),
    "+39":  ("意大利", _IT_PHONE),
    "+34":  ("西班牙", _ES_PHONE),
    "+7":   ("俄罗斯", _RU_PHONE),
    "+91":  ("印度", _IN_PHONE),
    "+60":  ("马来西亚", _MY_PHONE),
    "+63":  ("菲律宾", _PH_PHONE),
    "+66":  ("泰国", _TH_PHONE),
    "+84":  ("越南", _VN_PHONE),
    "+62":  ("印度尼西亚", _ID_PHONE),
    "+64":  ("新西兰", _NZ_PHONE),
    "+55":  ("巴西", _BR_PHONE),
    "+52":  ("墨西哥", _MX_PHONE),
}

# 兜底宽松校验：6-15 位数字
_PHONE_DIGITS_FALLBACK = re.compile(r"^\d{6,15}$")


class RegistrationCreate(BaseModel):
    """访客提交报名的请求体（活动报名 & 社团报名共用）。"""
    name: PlainText = Field(min_length=1, max_length=64)
    student_id: str = Field(pattern=r"^[A-Za-z0-9\-]{1,32}$")
    college: PlainText = Field(min_length=1, max_length=128)
    major: PlainText = Field(min_length=1, max_length=128)
    phone_cc: str = Field(..., description="国家区号，如 +86")
    phone_number: str = Field(..., description="本地手机号，不含区号")
    email: EmailStr | None = None
    position: PlainText | None = Field(default=None, max_length=64, description="意向部门")
    introduction: MultilineText | None = Field(default=None, max_length=2000, description="自我介绍")

    @field_validator("phone_cc")
    @classmethod
    def check_cc(cls, v: str) -> str:
        if v not in PHONE_COUNTRY_CODES:
            raise ValueError(f"不支持的国家区号: {v}，可选值 {PHONE_COUNTRY_CODES}")
        return v

    @field_validator("phone_number")
    @classmethod
    def check_phone(cls, v: str, info) -> str:
        cc = info.data.get("phone_cc")
        rule = _PHONE_RULES.get(cc)
        if rule:
            country, pattern = rule
            if not pattern.match(v):
                raise ValueError(
                    f"{country}({cc})手机号格式不正确，请按本地规范填写（不含区号）"
                )
        else:
            if not _PHONE_DIGITS_FALLBACK.match(v):
                raise ValueError("手机号必须是 6-15 位数字")
        return v


class RegistrationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CHECKED_IN = "checked_in"


class RegistrationType(str, Enum):
    ACTIVITY = "activity"
    CLUB = "club"


class RegistrationSource(str, Enum):
    FORM = "form"       # 公开表单提交
    MANUAL = "manual"   # 管理员后台手动补录


class RegistrationOut(BaseModel):
    id: int
    receipt_code: str
    content_lang: str
    registration_type: RegistrationType
    # 报名来源：form=公开表单 / manual=管理员手动补录
    source: RegistrationSource = RegistrationSource.FORM
    activity_id: int | None
    name: str
    student_id: str
    college: str
    major: str
    phone_cc: str
    phone_number: str
    email: str | None
    position: str | None
    introduction: str | None
    status: RegistrationStatus
    remark: str | None
    submit_ip: str | None
    checked_in_at: UTCDatetime | None
    submitted_at: UTCDatetime

    model_config = {"from_attributes": True}


class ManualRegistrationCreate(RegistrationCreate):
    """管理员手动补录报名：字段同公开表单，另附类型 / 活动 / 状态 / 备注。

    服务端不校验报名时间窗与人数上限（线下补报名、截止后人工增补场景）。
    """
    registration_type: RegistrationType = RegistrationType.ACTIVITY
    # 活动报名必填；社团报名忽略
    activity_id: int | None = None
    status: RegistrationStatus = RegistrationStatus.APPROVED
    # 管理员备注（补录原因等），写入 remark
    remark: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _check_type(self) -> "ManualRegistrationCreate":
        if self.registration_type == RegistrationType.ACTIVITY and not self.activity_id:
            raise ValueError("活动报名必须指定活动")
        if self.registration_type == RegistrationType.CLUB and not self.position:
            raise ValueError("社团报名必须填写意向部门")
        return self
