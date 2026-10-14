"""认证 & 用户 Pydantic 模型。"""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.core.password_policy import MAX_LENGTH as PASSWORD_MAX_LENGTH
from app.core.password_policy import validate_password_strength
from app.core.security import Role
from app.schemas.common import LooseEmail, MultilineText, PlainText, UTCNaive, UTCDatetime

# 学号 / 手机号只允许常见字符
_STUDENT_ID_PATTERN = r"^[A-Za-z0-9\-]{1,32}$"
_PHONE_PATTERN = r"^\+?[0-9\- ]{5,32}$"

# 个人资料扩展字段允许值
_GENDER_VALUES = {"male", "female", "hidden"}
_THEME_PATTERN = r"^[a-z][a-z0-9-]{0,31}$"
_PRIVACY_VISIBILITY = {"public", "private"}


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
    # ---- 个人资料扩展字段（Phase 规格补齐） ----
    # 性别：male / female / hidden；NULL = 未设置
    gender: str | None = None
    # 生日（naive UTC 存储）；NULL = 未设置
    birthday: UTCDatetime | None = None
    # 个性签名 / 简介
    bio: str | None = None
    # 主题预设：default / apple / festival:* ；NULL = 跟随系统默认
    theme: str | None = None
    # 隐私设置：{"gender":"public","bio":"public","birthday":"public"}
    # region 字段永久公开，不在此 JSON 内
    profile_privacy: dict | None = None
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
    # ---- 个人资料扩展字段（Phase 规格补齐） ----
    # 性别：male / female / hidden；空字符串=清空（存 NULL）；不传=不修改
    gender: PlainText | None = Field(default=None, max_length=8)
    # 生日（naive UTC 存储）；空字符串/不传=不修改，传入则规范化为 UTC naive；
    # 显式传 null = 清空
    birthday: UTCNaive | None = None
    # 个性签名 / 简介；空字符串=清空；不传=不修改
    bio: MultilineText | None = Field(default=None, max_length=200)
    # 主题预设：default / apple / festival:* ；空字符串=跟随系统默认（存 NULL）
    theme: PlainText | None = Field(default=None, max_length=32)
    # 隐私设置 JSON：{"gender":"public|private","bio":"public|private","birthday":"public|private"}
    # 不传=不修改；显式传 null = 重置为默认（全部 public）；传入 dict 则合并更新
    profile_privacy: dict | None = None

    @field_validator("gender")
    @classmethod
    def _validate_gender(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return v  # 空串保留以便接口层清空逻辑识别；None 表示不修改
        if v not in _GENDER_VALUES:
            raise ValueError("gender 取值仅支持 male / female / hidden")
        return v

    @field_validator("theme")
    @classmethod
    def _validate_theme(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return v
        import re
        if not re.match(_THEME_PATTERN, v):
            raise ValueError("theme 取值需为合法主题 key（小写字母开头 + 小写字母/数字/连字符）")
        return v

    @field_validator("profile_privacy")
    @classmethod
    def _validate_privacy(cls, v: dict | None) -> dict | None:
        if v is None:
            return v
        if not isinstance(v, dict):
            raise ValueError("profile_privacy 必须是 JSON 对象")
        # 字段可见性：bio / gender / birthday → public / private
        visibility_keys = {"gender", "bio", "birthday"}
        # 发现与搜索权限：all=全部站内用户可搜索 / members=仅社团内部 / none=不可搜索
        discoverability_values = {"all", "members", "none"}
        # 新建内容默认可见范围：public / members / private
        scope_values = {"public", "members", "private"}
        allowed_values: dict[str, set[str]] = {
            **{k: _PRIVACY_VISIBILITY for k in visibility_keys},
            "discoverability": discoverability_values,
            "default_scope": scope_values,
        }
        allowed_keys = set(allowed_values.keys())
        bad_keys = set(v.keys()) - allowed_keys
        if bad_keys:
            raise ValueError(f"profile_privacy 不支持的键：{','.join(sorted(bad_keys))}")
        for k, val in v.items():
            if val not in allowed_values[k]:
                raise ValueError(f"profile_privacy.{k} 取值不合法")
        return v


class AvatarUploadOut(BaseModel):
    avatar_url: str


# ---------- 修改密码 ----------
class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    # 强度在接口层结合用户名 / 邮箱校验
    new_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    # 二次确认新密码：后端二次校验（防御前端绕过）
    confirm_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    # 改密后保留当前设备登录（默认勾选）；False = 全部会话（含本机）强制下线
    keep_current_device: bool = True


# ---------- 忘记密码申请 ----------
class ForgotPasswordRequest(BaseModel):
    contact_email: EmailStr
    username_hint: PlainText | None = Field(default=None, max_length=128)
    reason: MultilineText = Field(min_length=2, max_length=500)


class ForgotPasswordSendCodeRequest(BaseModel):
    """发送忘记密码验证码：绑定邮箱（防账号枚举：响应与邮箱是否存在无关）。"""
    email: LooseEmail


class ForgotPasswordResetRequest(BaseModel):
    """邮箱验证码重置密码：验证码 + 新密码 + 二次确认。"""
    email: LooseEmail
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    confirm_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)

    @model_validator(mode="after")
    def _validate(self) -> "ForgotPasswordResetRequest":
        if self.new_password != self.confirm_password:
            raise ValueError("两次输入的新密码不相同")
        return self


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


# ---------- 更换绑定邮箱（路径A 自助 / 路径B 自助核验 / 路径C 人工申请 / 豁免确认） ----------
class EmailChangeSendCodesRequest(BaseModel):
    """路径A 第一步：输入新邮箱，系统同时向旧邮箱+新邮箱各发一份验证码。"""
    new_email: LooseEmail


class EmailChangeNormalConfirmRequest(BaseModel):
    """路径A 第二步：旧邮箱验证码 + 新邮箱验证码 + 当前登录密码，三项全部通过才换绑。"""
    old_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    current_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class EmailChangeLostOldVerifyRequest(BaseModel):
    """路径B 第一步：四项身份核验（全部匹配才通过，任一错统一模糊拒绝）。"""
    current_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    student_id: str = Field(min_length=1, max_length=32)
    phone: str = Field(min_length=1, max_length=32)
    real_name: str = Field(min_length=1, max_length=64)


class EmailChangeLostOldSendCodeRequest(BaseModel):
    """路径B 第二步：核验通过后仅验证新邮箱所有权。"""
    new_email: LooseEmail


class EmailChangeLostOldConfirmRequest(BaseModel):
    new_email: LooseEmail
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class EmailChangeManualRequestRequest(BaseModel):
    """路径C：提交更改绑定邮箱人工申请（pending 期间自助入口全部禁用）。"""
    new_email: LooseEmail
    remark: MultilineText | None = Field(default=None, max_length=1000)


class EmailChangeExemptConfirmRequest(BaseModel):
    """人工审核豁免模式：跳过全部身份校验，仅凭一次性标记换绑。"""
    new_email: LooseEmail


class EmailChangeRejectRequest(BaseModel):
    """管理员驳回人工申请：理由必填非空。"""
    reason: MultilineText = Field(min_length=1, max_length=1000)


class EmailChangeStatusOut(BaseModel):
    """用户端换绑板块状态（GET /status）。"""
    current_email: str
    is_placeholder: bool
    allow_manual_email_switch: bool
    # 待审核申请详情（存在时用户端全部自助入口置灰禁用）
    pending: dict | None = None
    # 最近一条已同意申请（豁免模式预填目标邮箱）
    approved_application: dict | None = None
    # 最近一条驳回（含理由，用户端展示后可重新自助/再次申请）
    last_rejected: dict | None = None


class EmailChangeRequestOut(BaseModel):
    """后台审核列表行。"""
    id: int
    user_id: int
    username: str
    old_email: str
    new_email: str
    remark: str | None
    status: str
    reject_reason: str | None
    submit_ip: str | None
    fingerprint: str | None
    reviewed_by: int | None
    reviewed_at: UTCDatetime | None
    created_at: UTCDatetime

    model_config = {"from_attributes": True}
