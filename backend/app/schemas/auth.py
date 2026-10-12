"""认证 & 用户 Pydantic 模型。"""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.core.password_policy import MAX_LENGTH as PASSWORD_MAX_LENGTH
from app.core.password_policy import validate_password_strength
from app.core.security import Role
from app.schemas.common import LooseEmail, MultilineText, PlainText, UTCDatetime

# 学号 / 手机号只允许常见字符
_STUDENT_ID_PATTERN = r"^[A-Za-z0-9\-]{1,32}$"
_PHONE_PATTERN = r"^\+?[0-9\- ]{5,32}$"


class LoginRequest(BaseModel):
    username: str | None = Field(default=None, max_length=128)
    email: LooseEmail | None = None
    # 登录只做校验不做强度检查（强度在设置 / 修改密码时强制）
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    # 勾选「记住此设备」：空闲超时 30 分钟 → 30 天，token 硬顶 30 天
    remember_device: bool = False


class LoginResponse(BaseModel):
    """登录成功：凭据通过 HttpOnly Cookie 下发，响应体不返回 token。"""
    role: Role
    # 登录后轮换的 CSRF 令牌（防会话固定），前端用于后续写请求的 X-CSRF-Token 头
    csrf_token: str
    username: str
    must_change_password: bool = False
    # 实名状态（前端后台守卫用：未实名的管理员级账号跳转 /realname）
    realname_verified: bool = True
    # Break-Glass 应急账号会话（前端启用三层警告 UI / 初始化向导跳转）
    is_break_glass: bool = False
    # 系统尚未完成初始化（前端跳转 /admin/setup 初始化向导）
    must_setup: bool = False


# ---------- 登录会话（设备管理） ----------
class LoginSessionOut(BaseModel):
    id: int
    device_name: str
    device_model: str
    user_agent: str
    ip: str | None = None
    # 登录地点（IP 归属地）：zh=en 双语字段；"local"/"intranet" 为枚举 code
    location_zh: str | None = None
    location_en: str | None = None
    remember_device: bool
    revoked: bool
    revoked_at: UTCDatetime | None = None
    login_at: UTCDatetime
    last_active_at: UTCDatetime
    expires_at: UTCDatetime
    # 是否为当前请求所用的登录会话
    is_current: bool = False

    model_config = {"from_attributes": True}


# ---------- 公开注册（P0） ----------
class RegisterRequest(BaseModel):
    """公开注册入参：强制 member 角色，不提供任何角色字段。"""
    username: PlainText = Field(min_length=2, max_length=64)
    display_name: PlainText = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    confirm_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    email: LooseEmail | None = None
    phone: str | None = Field(default=None, pattern=_PHONE_PATTERN)

    @model_validator(mode="after")
    def _validate(self) -> "RegisterRequest":
        if self.password != self.confirm_password:
            raise ValueError("两次输入的密码不一致")
        validate_password_strength(self.password, self.username, self.email)
        return self


class RegisterOut(BaseModel):
    id: int
    username: str
    display_name: str | None = None
    role: Role


class UserCreate(BaseModel):
    username: PlainText = Field(min_length=2, max_length=64)
    email: LooseEmail
    password: str = Field(max_length=PASSWORD_MAX_LENGTH)
    role: Role = Role.MEMBER
    student_id: str = Field(pattern=_STUDENT_ID_PATTERN)
    real_name: PlainText = Field(min_length=1, max_length=64)
    phone: str = Field(pattern=_PHONE_PATTERN)

    @model_validator(mode="after")
    def _strong_password(self) -> "UserCreate":
        validate_password_strength(self.password, self.username, self.email)
        return self


class UserUpdate(BaseModel):
    """更新账号信息：自己可改基础资料，super_admin 额外可改 role/is_active/permission_overrides"""
    username: PlainText | None = Field(default=None, min_length=2, max_length=64)
    real_name: PlainText | None = Field(default=None, min_length=1, max_length=64)
    student_id: str | None = Field(default=None, pattern=_STUDENT_ID_PATTERN)
    phone: str | None = Field(default=None, pattern=_PHONE_PATTERN)
    role: Role | None = None
    is_active: bool | None = None
    # 模块级权限覆盖（仅 super_admin 可写；None = 不修改）
    permission_overrides: dict[str, list[str]] | None = None


class UserOut(BaseModel):
    id: int
    username: str
    # 响应模型不做严格邮箱校验：数据写入时已校验，严格校验曾致占位域账号序列化 500
    email: str
    role: Role
    is_active: bool
    must_change_password: bool = False
    # Break-Glass 应急账号（/api/auth/me 合成响应专用；非库中真实字段）
    is_break_glass: bool = False
    # 系统尚未完成初始化（BG 会话前端跳转初始化向导用）
    must_setup: bool = False
    student_id: str
    real_name: str
    phone: str
    avatar_url: str | None = None
    # 实名验证状态（Phase 6）
    realname_verified: bool = False
    realname_verified_at: UTCDatetime | None = None
    realname_submitted_at: UTCDatetime | None = None
    realname_note: str | None = None
    # IANA 时区；null = 自动探测浏览器时区
    timezone: str | None = None
    # 用户物理位置（三级行政区）
    country: str | None = None       # 国家
    region: str | None = None        # 一级行政区（省/州）
    locality: str | None = None      # 二级行政区（市/郡）；可为空
    # —— 标准化地区编码（i18n：只存 code，不存显示文字） ——
    country_code: str | None = None
    subdiv1_code: str | None = None
    subdiv2_code: str | None = None
    locality_text: str | None = None
    # 模块级权限覆盖；null = 按角色默认矩阵
    permission_overrides: dict[str, list[str]] | None = None
    # 展示昵称（公开注册 / 个人资料；NULL = 回退 username）
    display_name: str | None = None
    # ---- 区域格式（只存编码 / 模式字符串，不存展示文本） ----
    primary_calendar: str = "gregorian"
    secondary_calendar: str | None = None
    week_first_day: str = "monday"
    date_short_pattern: str = "YYYY-MM-DD"
    date_long_pattern: str = "YYYY年M月D日"
    time_short_pattern: str = "HH:mm"
    time_long_pattern: str = "HH:mm:ss"
    # 本地化系统：用户个人偏好（NULL = 跟随系统全局 sys_default_*）
    locale: str | None = None
    region_code: str | None = None
    currency: str | None = None
    created_at: UTCDatetime
    last_login_at: UTCDatetime | None = None

    model_config = {"from_attributes": True}


# ---------- 个人资料更新 ----------
class ProfileUpdate(BaseModel):
    """用户自行更新资料：显示名称、真实姓名、手机号、学号、时区"""
    username: PlainText | None = Field(default=None, min_length=2, max_length=64)
    display_name: PlainText | None = Field(default=None, min_length=1, max_length=64)
    real_name: PlainText | None = Field(default=None, min_length=1, max_length=64)
    phone: str | None = Field(default=None, pattern=_PHONE_PATTERN)
    student_id: str | None = Field(default=None, pattern=_STUDENT_ID_PATTERN)
    # IANA 时区字符串；空字符串 = 恢复自动探测（存 NULL）；不传 = 不修改
    timezone: str | None = Field(default=None, max_length=64)
    # 三级行政区地址；空字符串 = 清空（存 NULL）；不传 = 不修改
    country: PlainText | None = Field(default=None, max_length=64)
    region: PlainText | None = Field(default=None, max_length=128)
    locality: PlainText | None = Field(default=None, max_length=128)
    # —— 标准化地区编码（i18n：只存 code，不存显示文字） ——
    # ISO-3166-1 二位国家代码；空字符串=清空
    country_code: PlainText | None = Field(default=None, max_length=8)
    # 一级行政区代码；空字符串=清空
    subdiv1_code: PlainText | None = Field(default=None, max_length=32)
    # 二级行政区代码；空字符串=清空
    subdiv2_code: PlainText | None = Field(default=None, max_length=32)
    # 无标准行政区时的自由文本地点；空字符串=清空
    locality_text: PlainText | None = Field(default=None, max_length=128)
    # ---- 区域格式（只存编码 / 模式字符串） ----
    primary_calendar: PlainText | None = Field(default=None, max_length=16)
    secondary_calendar: PlainText | None = Field(default=None, max_length=16)
    week_first_day: PlainText | None = Field(default=None, max_length=16)
    date_short_pattern: PlainText | None = Field(default=None, max_length=32)
    date_long_pattern: PlainText | None = Field(default=None, max_length=32)
    time_short_pattern: PlainText | None = Field(default=None, max_length=32)
    time_long_pattern: PlainText | None = Field(default=None, max_length=32)
    # 本地化系统：用户个人偏好；空字符串=恢复跟随系统（存 NULL）；不传=不修改
    locale: PlainText | None = Field(default=None, max_length=16)
    region_code: PlainText | None = Field(default=None, max_length=16)
    currency: PlainText | None = Field(default=None, max_length=8)


class AvatarUploadOut(BaseModel):
    avatar_url: str


# ---------- 修改密码 ----------
class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    # 强度在接口层结合用户名 / 邮箱校验
    new_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


# ---------- 忘记密码申请 ----------
class ForgotPasswordRequest(BaseModel):
    contact_email: EmailStr
    username_hint: PlainText | None = Field(default=None, max_length=128)
    reason: MultilineText = Field(min_length=2, max_length=500)


class PasswordResetOut(BaseModel):
    id: int
    contact_email: str
    username_hint: str | None
    reason: str
    status: str
    admin_note: str | None
    handled_at: UTCDatetime | None
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


class PasswordResetHandleRequest(BaseModel):
    status: str = Field(pattern="^(handled|rejected)$")
    admin_note: MultilineText | None = Field(default=None, max_length=1000)


# ---------- 安全问题恢复 ----------
class SecurityQuestionOut(BaseModel):
    """公开接口只返回问题，不返回答案。"""
    question: str


class SecurityAnswerRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=256)
    # 恢复后设置的新密码（强度在接口层结合超管用户名校验）
    new_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


# ---------- 安全问题管理（仅 super_admin） ----------
class SecurityQuestionUpdate(BaseModel):
    question: PlainText = Field(min_length=2, max_length=256)
    # 答案需有一定强度，防止被枚举猜中
    answer: str = Field(min_length=6, max_length=256)
