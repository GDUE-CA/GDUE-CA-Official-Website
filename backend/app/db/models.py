"""SQLAlchemy ORM 模型。"""
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.core.log import current_trace_id


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# ---------- 用户 ----------
class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    EDITOR = "editor"
    MEMBER = "member"   # 普通成员：无后台权限


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    # bcrypt 加盐哈希（不存储原始密码）
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 默认管理员首次登录后必须改密
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    # 登录失败处理已迁移至（账号+维度）阶梯防爆破（app/core/brute_force.py，数据存 KV/Redis）
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 更改绑定邮箱人工审核一次性豁免标记：管理员同意人工申请后置 True，
    # 用户端凭此跳过身份校验完成换绑，成功瞬间同事务清除（一次性，禁止复用）
    allow_manual_email_switch: Mapped[bool] = mapped_column(Boolean, default=False)
    # --- 账号身份信息（用于身份验证和密码恢复） ---
    student_id: Mapped[str] = mapped_column(String(32), index=True)  # 学号
    real_name: Mapped[str] = mapped_column(String(64))               # 真实姓名
    phone: Mapped[str] = mapped_column(String(32))                   # 手机号（含区号）
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # IANA 时区（如 Asia/Shanghai）；NULL = 使用浏览器自动探测
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 用户物理位置：国家 + 省份/城市（手动设置或浏览器 Geolocation 自动定位）
    country: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 一级行政区（省/州）
    region: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 二级行政区（市/郡）；为空时仅 country + region 两级
    locality: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # —— 标准化地区编码（i18n：只存 code，不存显示文字；前端按 code 查表渲染） ——
    # ISO-3166-1 二位国家/地区代码（如 CN / US / GB）
    country_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # 一级行政区代码（省/州/构成国/区/堂区/县市，如 CN-44）
    subdiv1_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 二级行政区代码（城市，如 CN-44-01；HK/MO/TW 固定为 None）
    subdiv2_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 无标准行政区时的自由文本地点（如小型岛国/自定义地点）
    locality_text: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 模块级权限覆盖（JSON）：{"activities": ["view"], "review.bugs": ["view", "manage"]}
    # null = 完全按角色默认矩阵；仅 super_admin 可写
    permission_overrides: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 实名验证（Phase 6）：未实名账号禁止进后台，仅可浏览前台
    realname_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    realname_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    realname_submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    realname_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 展示昵称（公开注册 / 个人资料用；NULL = 回退 username）
    display_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # ---- 区域格式（只存编码 / 模式字符串，不存展示文本；仅控制前端渲染层） ----
    # 主日历：gregorian / chinese / japanese / buddhist
    primary_calendar: Mapped[str] = mapped_column(String(16), default="gregorian")
    # 第二附加日历（仅附加展示）：None = 关闭
    secondary_calendar: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # 一周起始日：sunday / monday / tuesday
    week_first_day: Mapped[str] = mapped_column(String(16), default="monday")
    # 短日期格式模式（如 YYYY-MM-DD / DD/MM/YYYY）
    date_short_pattern: Mapped[str] = mapped_column(String(32), default="YYYY-MM-DD")
    # 长日期格式模式
    date_long_pattern: Mapped[str] = mapped_column(String(32), default="YYYY年M月D日")
    # 短时间格式（12/24 小时）
    time_short_pattern: Mapped[str] = mapped_column(String(32), default="HH:mm")
    # 长时间格式（带秒）
    time_long_pattern: Mapped[str] = mapped_column(String(32), default="HH:mm:ss")
    # 默认货币 ISO-4217（如 CNY/USD/EUR）；NULL = 跟随系统全局 sys_default_currency
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # 用户个人 UI 界面语言（如 zh-cn/en-us）；NULL = 跟随系统全局 sys_default_locale
    locale: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # 用户个人区域格式化代码（ISO-3166-1 二位，如 CN/GB/JP）；NULL = 跟随系统全局 sys_default_region
    region_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # ---- 个人资料扩展字段（Phase 规格补齐） ----
    # 性别：male / female / hidden（不显示）；NULL = 未设置
    gender: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # 生日（naive UTC 存储）；NULL = 未设置
    birthday: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 个性签名 / 简介
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 主题预设：default / apple / festival:* ；NULL = 跟随系统默认
    theme: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 隐私设置 JSON：{"gender":"public","bio":"public","birthday":"public"}
    # region 永久公开不在此 JSON 内
    profile_privacy: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 软删除：True 送入内容回收站，定时任务 30 天后物理删除；删除后禁止登录
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


# ---------- 登录会话（设备管理 / 踢出登录 / 30 分钟滑动超时） ----------
class LoginSession(Base):
    __tablename__ = "login_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # JWT jti，唯一标识一次登录会话
    session_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # 设备名称（浏览器 + 操作系统），如 "Chrome 129 · Windows"
    device_name: Mapped[str] = mapped_column(String(128))
    # 设备型号，如 "Windows 10/11 桌面" / "iPhone" / "22081212C (Android 13)"
    device_model: Mapped[str] = mapped_column(String(128))
    # 完整 User-Agent（详细展示用）
    user_agent: Mapped[str] = mapped_column(String(512), default="")
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 登录地点（IP 归属地）：中文（ip2region）/ 英文（GeoLite2）；
    # "local"=本机回环，"intranet"=校园内网（枚举由前端按语言渲染）
    location_zh: Mapped[str | None] = mapped_column(String(128), nullable=True)
    location_en: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 勾选「记住此设备」登录：空闲超时从 30 分钟放宽到 30 天
    remember_device: Mapped[bool] = mapped_column(Boolean, default=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    login_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    # 滑动续期：每次认证请求刷新
    last_active_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    # 会话硬顶：登录时间 + token 有效期
    expires_at: Mapped[datetime] = mapped_column(DateTime)


# ---------- 用户界面显示偏好（/setting/界面与显示，跟随账号多端同步） ----------
class ColorScheme(str, Enum):
    LIGHT = "light"    # 浅色
    DARK = "dark"      # 深色
    SYSTEM = "system"  # 跟随系统


class UserDisplayPreference(Base):
    """界面显示偏好：风格主题 / 深浅色 / 字体缩放 / 横屏。每用户至多一行。"""
    __tablename__ = "user_display_preferences"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    # 风格主题 key（default / apple / festival:*）；NULL = 跟随系统默认
    theme_name: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 深浅色模式
    color_scheme: Mapped[ColorScheme] = mapped_column(
        SAEnum(ColorScheme), default=ColorScheme.SYSTEM
    )
    # 字体缩放系数：1.0 = 默认，允许 0.85 ~ 1.30
    font_scale: Mapped[float] = mapped_column(Float, default=1.0)
    # 是否允许横屏（移动端偏好；前端视能力应用）
    enable_landscape: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


# ---------- 用户通知偏好（/setting/通知设置；安全类通知强制锁定） ----------
class UserNotificationPreference(Base):
    """通知开关。内容互动/业务消息可自由开关；安全告警强制开启（security_notice_locked 恒为 True）。"""
    __tablename__ = "user_notification_preferences"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    # —— 内容互动类 ——
    # 笔记被点赞
    content_liked: Mapped[bool] = mapped_column(Boolean, default=True)
    # 笔记收到评论
    content_commented: Mapped[bool] = mapped_column(Boolean, default=True)
    # 我的评论收到回复
    content_replied: Mapped[bool] = mapped_column(Boolean, default=True)
    # —— 业务协作类 ——
    # 分配给我的任务
    biz_task_assigned: Mapped[bool] = mapped_column(Boolean, default=True)
    # 任务状态变更
    biz_task_changed: Mapped[bool] = mapped_column(Boolean, default=True)
    # 站内公告
    biz_announcement: Mapped[bool] = mapped_column(Boolean, default=True)
    # —— 账号安全类（锁死，前端置灰；后端忽略任何关闭请求） ——
    # 异地设备登录提醒
    security_new_device: Mapped[bool] = mapped_column(Boolean, default=True)
    # 密码修改 / 绑定变更提醒
    security_credential_change: Mapped[bool] = mapped_column(Boolean, default=True)
    # 安全通知锁定标记：恒为 True，仅作语义表达与前端展示依据
    security_notice_locked: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


# ---------- 用户黑名单（/setting/隐私设置/黑名单） ----------
class UserBlock(Base):
    """拉黑关系：blocker 拉黑 blocked。被拉黑者无法访问其主页、评论、点赞。"""
    __tablename__ = "user_blocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    blocker_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    blocked_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id", name="uq_user_block_pair"),
    )


# ---------- 活动 ----------
class ActivityStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    REGISTRATION_OPEN = "registration_open"
    ENDED = "ended"
    ARCHIVED = "archived"


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    # 列表短描述（前台活动列表/首页栏目展示；content 为详情正文）
    description: Mapped[str] = mapped_column(String(300), default="")
    # 前台展示用标识（历史数据迁移自 markdown slug；唯一、可空）
    slug: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    content: Mapped[str] = mapped_column(Text)
    # 分类：历史数据为 lecture/competition/recruitment/workshop；后台可自由扩展
    category: Mapped[str] = mapped_column(String(64))
    status: Mapped[ActivityStatus] = mapped_column(SAEnum(ActivityStatus), default=ActivityStatus.DRAFT)
    register_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    register_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 活动开始/结束时间（Phase 3：状态自动识别 + 双必填校验由后端强制）
    start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    max_participants: Mapped[int] = mapped_column(Integer, default=0)  # 0 = 无上限
    # 实际参与人数（历史活动统计值；报名制活动可为空=未统计）
    participants: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cover_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # 签到开关：管理员在活动开始时手动开放，报名者凭回执码签到
    checkin_open: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # 最后操作管理员（编辑 / 归档 / 删除等管理操作的操作人）
    operator_admin_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # 软删除：True 送入内容回收站，定时任务 30 天后物理删除（与归档互不干扰）
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    registrations: Mapped[list["Registration"]] = relationship(back_populates="activity")


# ---------- 报名 ----------
class RegistrationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CHECKED_IN = "checked_in"


class RegistrationType(str, Enum):
    ACTIVITY = "activity"   # 活动报名（关联 Activity）
    CLUB = "club"           # 社团报名（意向部门入会）


class RegistrationSource(str, Enum):
    FORM = "form"       # 用户通过公开表单提交
    MANUAL = "manual"   # 管理员后台手动补录（线下报名 / 截止后增补）


class Registration(Base):
    __tablename__ = "registrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # 回执码（唯一，用于扫码/输号查询进度）
    receipt_code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    # 提交内容语言（detect_lang 检测结果：zh-cn / ja / en / ko 等，后台按此自动翻译）
    content_lang: Mapped[str] = mapped_column(String(8), default="zh-cn")
    # 提交来源 IP（内网 / 公网 / IPv6，取自 XFF → X-Real-IP → 直连）
    submit_ip: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # 报名类型：activity 需关联活动，club 无需关联
    registration_type: Mapped[RegistrationType] = mapped_column(
        SAEnum(RegistrationType), default=RegistrationType.ACTIVITY, index=True
    )
    # 报名来源：form=公开表单提交；manual=管理员后台手动补录
    source: Mapped[RegistrationSource] = mapped_column(
        SAEnum(RegistrationSource), default=RegistrationSource.FORM, server_default="form"
    )
    activity_id: Mapped[int | None] = mapped_column(
        ForeignKey("activities.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(64))
    student_id: Mapped[str] = mapped_column(String(32))
    college: Mapped[str] = mapped_column(String(128))
    major: Mapped[str] = mapped_column(String(128))
    phone_cc: Mapped[str] = mapped_column(String(16))  # 国家区号，如 +86
    phone_number: Mapped[str] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 意向部门（社团报名必填，活动报名可选）
    position: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 自我介绍
    introduction: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[RegistrationStatus] = mapped_column(
        SAEnum(RegistrationStatus), default=RegistrationStatus.PENDING
    )
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 签到时间（仅通过回执码公开签到接口产生，管理员不可手动设置）
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    activity: Mapped[Activity] = relationship(back_populates="registrations")


# ---------- 活动报名（登录用户一键报名，报名人数统计来源） ----------
class ActivityEnrol(Base):
    """活动报名表：登录用户对活动的一键报名记录。

    - 每个用户对同一活动仅一条记录（唯一约束）；取消报名置 is_deleted=True（软删）
    - 活动报名人数统计 = 该表 is_deleted=False 的计数
    - 账号软删除 / 物理清除时报名记录保留（统计完整性），仅用户物理清除时随之清理
    """
    __tablename__ = "activity_enrols"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    __table_args__ = (
        UniqueConstraint("activity_id", "user_id", name="uq_activity_enrol"),
    )


# ---------- Bug 反馈 ----------
class BugReport(Base):
    __tablename__ = "bug_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    receipt_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    content_lang: Mapped[str] = mapped_column(String(8), default="zh-cn")
    # 提交来源 IP（内网 / 公网 / IPv6，取自 XFF → X-Real-IP → 直连）
    submit_ip: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    contact_email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(48), nullable=True)
    description: Mapped[str] = mapped_column(Text)
    extra: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


# ---------- 翻译缓存 ----------
class TranslationCache(Base):
    """表单内容自动翻译的缓存，避免重复调用外部翻译接口。"""
    __tablename__ = "translation_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_hash: Mapped[str] = mapped_column(String(64), index=True)  # 原文 SHA-256
    source_lang: Mapped[str] = mapped_column(String(8))
    target_lang: Mapped[str] = mapped_column(String(8))
    source_text: Mapped[str] = mapped_column(Text)
    translated_text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---------- 系统配置（单例表，id 固定为 1） ----------
class SystemSetting(Base):
    __tablename__ = "system_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_name: Mapped[str] = mapped_column(String(128), default="广东第二师范学院计算机协会")
    footer: Mapped[str | None] = mapped_column(Text, nullable=True)
    icp_info: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # JSON 字段：存储数组更方便改
    ip_blacklist: Mapped[list[str]] = mapped_column(JSON, default=list)
    allowed_hosts: Mapped[list[str]] = mapped_column(JSON, default=list)
    cors_origins: Mapped[list[str]] = mapped_column(JSON, default=list)
    # 社团报名签到开关（社团报名不关联活动，用全局开关控制）
    club_checkin_open: Mapped[bool] = mapped_column(Boolean, default=False)
    # 系统默认 IANA 时区（前端降级回退用）；默认 Asia/Shanghai；NULL 兜底 Asia/Shanghai
    sys_default_timezone: Mapped[str | None] = mapped_column(String(64), nullable=True, default="Asia/Shanghai")
    # 网络配置（接入层 Nginx/Caddy 热重载参考用；实际生效需运维手动重载）
    network_port: Mapped[int] = mapped_column(Integer, default=443)
    network_listen_ip: Mapped[str] = mapped_column(String(64), default="0.0.0.0")
    network_domains: Mapped[list[str]] = mapped_column(JSON, default=list)
    # 博客评论全局开关（关闭后全部文章评论区禁止提交）
    comments_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # 活动自动归档开关：开启后定时任务将 end_at < 当前 UTC 时间的活动自动置为 archived
    auto_archive_events: Mapped[bool] = mapped_column(Boolean, default=False)
    # 管理员可信来源 IP 白名单（Web 配置，优先于环境变量 ADMIN_TRUSTED_IPS）。
    # 存原始字符串数组（单 IP 内部按 /32、/128 网段匹配）；空列表 = 未配置，
    # 回落读取环境变量 ADMIN_TRUSTED_IPS，环境变量也为空则不限制来源
    admin_trusted_ips: Mapped[list[str]] = mapped_column(JSON, default=list)
    # 全局登录会话空闲超时（分钟）：管理员在后台配置，预设值 [1,2,5,10,15,20,30,60,120]
    # 最大硬性限制 120 分钟（2 小时）；基于 last_active_at 滑动计算，非登录时刻
    session_idle_timeout_minutes: Mapped[int] = mapped_column(Integer, default=30)
    # ---------- 系统初始化向导（Break-Glass 体系） ----------
    # false = 尚未完成初始化：仅 Break-Glass 可登录，普通账号全部拒绝
    # 完成向导后置 true 且永久隐藏向导入口（仅允许手动改库重置）
    system_initialized: Mapped[bool] = mapped_column(Boolean, default=False)
    # 初始化向导写入的全局基础参数（本地化系统全局默认；用户字段 NULL 时回退此处）
    sys_default_locale: Mapped[str | None] = mapped_column(String(16), nullable=True)   # 如 zh-cn
    sys_default_region: Mapped[str | None] = mapped_column(String(16), nullable=True)   # 如 CN
    sys_default_currency: Mapped[str | None] = mapped_column(String(8), nullable=True)  # ISO-4217 如 CNY


# ---------- 操作日志 ----------
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # 操作者展示标识：Break-Glass 应急账号固定为 [BREAK_GLASS_ESCAPE]（user_id 保持 NULL）；
    # 普通账号为 None，展示时回落到 user_id 关联的用户名
    actor: Mapped[str | None] = mapped_column(String(64), nullable=True)
    action: Mapped[str] = mapped_column(String(64))     # 如 "login" / "activity.create"
    target: Mapped[str | None] = mapped_column(String(64), nullable=True)   # 如 "activity:5"
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 产生该审计记录的请求 traceId，可据此在应用日志中检索完整请求链路
    trace_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True, default=lambda: _trace_or_none()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


def _trace_or_none() -> str | None:
    tid = current_trace_id()
    return None if tid == "-" else tid


# ---------- 网络配置变更历史（最近 5 次） ----------
class NetworkConfigHistory(Base):
    __tablename__ = "network_config_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # 快照：变更后的完整网络配置（JSON 存储）
    config_snapshot: Mapped[dict] = mapped_column(JSON)
    change_summary: Mapped[str | None] = mapped_column(String(512), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---------- 忘记密码申请 ----------
class PasswordResetStatus(str, Enum):
    PENDING = "pending"
    HANDLED = "handled"
    REJECTED = "rejected"


class PasswordResetRequest(Base):
    """访客提交的忘记密码申请，管理员审核后手动处理。"""
    __tablename__ = "password_reset_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contact_email: Mapped[str] = mapped_column(String(128))
    username_hint: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default=PasswordResetStatus.PENDING.value, index=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    handled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class EmailChangeStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class EmailChangeRequest(Base):
    """更改绑定邮箱人工申请（路径C兜底通道）。

    用户旧邮箱失效且无法通过自助核验（路径B）时提交，管理员审核：
    - 同意：仅打一次性豁免标记 users.allow_manual_email_switch=True，
      最终换绑必须由用户本人在设置页确认提交（管理员绝不直接改邮箱）；
    - 驳回：必填理由，用户端展示并可重新自助操作或再次申请。
    """
    __tablename__ = "email_change_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    old_email: Mapped[str] = mapped_column(String(128))   # 提交时现存绑定邮箱快照
    new_email: Mapped[str] = mapped_column(String(128))   # 用户填写的目标新邮箱
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)  # 申请备注（原邮箱失效原因）
    status: Mapped[EmailChangeStatus] = mapped_column(
        SAEnum(EmailChangeStatus), default=EmailChangeStatus.PENDING, index=True
    )
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    submit_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    fingerprint: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


# ---------- IP 规则（黑白名单，替代 system_settings.ip_blacklist JSON） ----------
class IpRuleType(str, Enum):
    WHITELIST = "whitelist"   # 可信 IP：豁免网络层限制；绑定账号可自动登录（opt-in）
    BLACKLIST = "blacklist"   # 全站拦截：带违规原因 + 封禁时长（临时倒计时 / 永久）


class IpRule(Base):
    """IP 黑白名单规则，支持单 IP 与 CIDR；白名单可选绑定账号实现自动登录。"""
    __tablename__ = "ip_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[IpRuleType] = mapped_column(SAEnum(IpRuleType), index=True)
    # 规则原文：单 IP（192.168.1.1）或 CIDR（10.0.0.0/24）；IPv6 同样支持
    rule: Mapped[str] = mapped_column(String(64), index=True)
    # 可选标签（如「办公室」「恶意爬虫 2026-10」）
    label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 违规原因（黑名单展示给前端弹窗） / 信任原因（白名单备注）
    reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # null = 永久；到期时间（UTC，naive 存储）
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    # 白名单可选：绑定账号 ID，命中时实现可信 IP 自动登录（opt-in）
    bound_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


# ---------- 安全问题（单例表，id 固定为 1） ----------
class SecurityQuestion(Base):
    """紧急恢复用安全问题，所有管理员失能时通过回答问题恢复超级管理员。"""
    __tablename__ = "security_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question: Mapped[str] = mapped_column(String(256))
    # 答案的 bcrypt 哈希（规范化：去首尾空格 + 小写后再哈希），不存明文
    answer: Mapped[str] = mapped_column(String(256))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


# ==================== Phase 3 内容 CMS ====================

# ---------- 信息通知/主页公告 ----------
class AnnouncementCategory(str, Enum):
    HOMEPAGE = "homepage"   # 信息通知（弹窗推送 / 投递至用户通知列表）
    HOME = "home"           # 主页公告（官网首页「最新公告」栏目展示）


class Announcement(Base):
    """信息通知 + 主页公告 CMS。

    前端公开接口自动过滤：时间生效中（start_at ≤ now ≤ end_at，空值不限）+ 已启用，
    按 priority 降序展示；过期自动隐藏，无需手动删除。
    """
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[AnnouncementCategory] = mapped_column(
        SAEnum(AnnouncementCategory), default=AnnouncementCategory.HOMEPAGE, index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    # 弹窗简短内容（多行文本，前端按纯文本/Markdown 展示，后端做控制字符清洗）
    content: Mapped[str] = mapped_column(Text)
    # 可选跳转链接（http(s):// 或站内 / 开头）
    link: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # 生效时间窗（NULL = 立即生效/永不失效；均以 UTC 存储）
    start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    # 优先级：数字越大越优先展示
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class UserNotifyRead(Base):
    """用户通知已读记录（user_notify_read）：记录哪个用户已读哪条通知。

    (user_id, announcement_id) 唯一；通知列表未读角标 = 生效中且已启用的
    通知数 - 已读记录数。通知删除后由管理接口显式清理对应已读行。
    """
    __tablename__ = "user_notify_reads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    announcement_id: Mapped[int] = mapped_column(ForeignKey("announcements.id"), index=True)
    read_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "announcement_id", name="uq_user_notify_read"),
    )


class UserMessage(Base):
    """站内私信通知（user_messages）：系统事件触发的每用户消息。

    与 Announcement（全站广播，已读靠 user_notify_reads 关联行）不同：
    每行仅属于一个接收用户，is_read 行内标记。由后端业务事件写入
    （如换绑邮箱审核结果），用户端通知抽屉展示并标记已读。
    """
    __tablename__ = "user_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # 消息类别（业务事件标识，如 email_change；便于后续按类别过滤/扩展）
    kind: Mapped[str] = mapped_column(String(50), default="general", index=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    # 可选站内跳转链接（/ 开头路径）
    link: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


# ---------- 富文本内容块（社团介绍等） ----------
class ContentBlock(Base):
    """key 唯一的内容块（社团介绍、招新说明、联系我们等）。

    存原始 Markdown，前端用 Markdown 阅读器渲染。改内容无需重新部署。
    """
    __tablename__ = "content_blocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body_md: Mapped[str] = mapped_column(Text)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


# ---------- 成员管理（现任/往届） ----------
class MemberTerm(str, Enum):
    CURRENT = "current"   # 现任
    FORMER = "former"     # 往届


class Member(Base):
    """社团成员信息，区分现任/往届，支持归档、头像上传。"""
    __tablename__ = "members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    # 职务（如「会长」「技术部部长」）
    role_title: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 花名册扩展字段（Excel 批量导入；电话/微信仅管理端可见，不进公开接口）
    gender: Mapped[str | None] = mapped_column(String(8), nullable=True)
    grade: Mapped[str | None] = mapped_column(String(32), nullable=True)
    department: Mapped[str | None] = mapped_column(String(64), nullable=True)
    major_class: Mapped[str | None] = mapped_column(String(64), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    wechat: Mapped[str | None] = mapped_column(String(64), nullable=True)
    political_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_intl_student: Mapped[bool] = mapped_column(Boolean, default=False)
    term: Mapped[MemberTerm] = mapped_column(
        SAEnum(MemberTerm), default=MemberTerm.CURRENT, index=True
    )
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # 展示顺序：数字越小越靠前；后台可调整
    display_order: Mapped[int] = mapped_column(Integer, default=0, index=True)
    # 归档：前端默认不展示归档成员
    archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---------- 招新信息 ----------
class RecruitmentInfo(Base):
    """招新信息内容 CMS（独立于招新报名数据）。"""
    __tablename__ = "recruitment_infos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    # 目标部门（如「技术部」「策划部」，可选）
    target_dept: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


# ---------- 活动报名统计快照 ----------
class ActivityStatistics(Base):
    """已结束活动的报名统计快照。

    活动结束（status=ended）后管理员手动 finalize 时生成；前端只渲染，禁止计算。
    """
    __tablename__ = "activity_statistics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    activity_id: Mapped[int] = mapped_column(
        ForeignKey("activities.id"), unique=True, index=True
    )
    total: Mapped[int] = mapped_column(Integer, default=0)
    pending: Mapped[int] = mapped_column(Integer, default=0)
    approved: Mapped[int] = mapped_column(Integer, default=0)
    rejected: Mapped[int] = mapped_column(Integer, default=0)
    checked_in: Mapped[int] = mapped_column(Integer, default=0)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---------- 媒体文件统一管理 ----------
class MediaCategory(str, Enum):
    AVATAR = "avatar"    # 用户头像
    MEMBER = "member"    # 成员头像
    COVER = "cover"      # 活动/文章封面
    BLOG = "blog"        # 博客内嵌图片
    MISC = "misc"        # 其他


class MediaFile(Base):
    """统一文件资源记录（avatar/member/cover/blog/misc）。

    实际文件存储于 uploads/{category}/，本表记录元数据供后台统一管理。
    """
    __tablename__ = "media_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(128), index=True)
    original_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    mime: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(Integer)
    storage_path: Mapped[str] = mapped_column(String(512))
    uploader_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    category: Mapped[MediaCategory] = mapped_column(
        SAEnum(MediaCategory), default=MediaCategory.MISC, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


# ==================== Phase 4 博客 CMS ====================

class BlogPostStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    SCHEDULED = "scheduled"   # 定时发布：scheduled_at 到点后惰性转为 published
    ARCHIVED = "archived"     # 下架归档


class BlogPost(Base):
    """博客文章（Markdown 存储）。

    slug 唯一用于公开 URL；定时发布通过公开接口惰性刷新（scheduled_at ≤ now → published）。
    """
    __tablename__ = "blog_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    # 展示用作者名（历史迁移内容无系统账号时使用；为空时回退关联账号 username）
    author_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 原始 Markdown 正文（存储原文，渲染交给前端 Markdown 阅读器）
    content_md: Mapped[str] = mapped_column(Text)
    excerpt: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[BlogPostStatus] = mapped_column(
        SAEnum(BlogPostStatus), default=BlogPostStatus.DRAFT, index=True
    )
    # 首次发布时间（手工发布或定时到点时写入）
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    # 定时发布时间（仅 status=scheduled 时有意义）
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # 是否允许评论（Phase 5 评论系统读取此开关 + 全局开关共同决定）
    allow_comments: Mapped[bool] = mapped_column(Boolean, default=True)
    # ---- 博客 4 项统计指标（冗余计数字段，用于列表/详情展示） ----
    # 点赞数
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    # 评论数（含用户已删除 + 管理员已屏蔽的全部行数；与前端展示数可不一致）
    comment_count: Mapped[int] = mapped_column(Integer, default=0)
    # 转发/分享次数（仅计数器，不存储分享者身份）
    share_count: Mapped[int] = mapped_column(Integer, default=0)
    # 收藏数
    favourite_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    author: Mapped["User"] = relationship(lazy="joined")
    tags: Mapped[list["BlogTag"]] = relationship(
        secondary="blog_post_tags", lazy="selectin"
    )
    # 文章删除时级联清理评论（ORM 级联；SQLite 未开外键 pragma，不能依赖 DB CASCADE）
    comments: Mapped[list["Comment"]] = relationship(cascade="all, delete-orphan")


class BlogTag(Base):
    """博客标签：文章多标签绑定，前端按标签筛选。"""
    __tablename__ = "blog_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class BlogPostTag(Base):
    """文章-标签绑定表（联合主键，级联清理）。"""
    __tablename__ = "blog_post_tags"

    post_id: Mapped[int] = mapped_column(
        ForeignKey("blog_posts.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("blog_tags.id", ondelete="CASCADE"), primary_key=True
    )


class CommentStatus(str, Enum):
    """旧枚举（已弃用，仅保留兼容旧库 status 列；新代码使用 is_deleted/is_hidden）。
    迁移回填：VISIBLE→(F,F) / USER_DELETED→(T,F) / ADMIN_REMOVED→(F,T)
    """
    VISIBLE = "visible"
    USER_DELETED = "user_deleted"
    ADMIN_REMOVED = "admin_removed"


class Comment(Base):
    """博客评论（双布尔软删除 + 管理员可物理删除）。

    访客无账号，评论以「昵称 + 内容」提交；提交 IP 完整存储仅后台可见，
    公开接口只返回属地（国家/省份粒度）。

    软删除矩阵：
    - is_deleted=True  → 用户自删（公开列表不可见，后台留存）
    - is_hidden=True   → 管理员屏蔽（公开列表不可见，后台留存）
    - 两者可独立为 True（一条评论可被用户删后再被管理员屏蔽）
    - 物理删除 = 管理员确认后 DELETE 数据库行（不可逆）
    """
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("blog_posts.id"), index=True)
    author_name: Mapped[str] = mapped_column(String(64))
    content: Mapped[str] = mapped_column(Text)
    # 提交者完整 IP：仅后台管理员可见，公开接口绝不返回
    submit_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # IP 属地：中文 ip2region / 英文 GeoLite2，前端按语言渲染；
    # "local"=本机回环，"intranet"=校园内网（特殊枚举由前端 i18n 渲染）
    location_zh: Mapped[str | None] = mapped_column(String(128), nullable=True)
    location_en: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 用户自删标记（软删除）：公开列表过滤 is_deleted=false
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # 管理员屏蔽标记（软删除）：公开列表过滤 is_hidden=false
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


# ==================== Phase 9 项目展示 CMS ====================

class ProjectStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"   # 下架归档（不再对外展示）


class Project(Base):
    """项目展示（Markdown 详情存储）：前台 /projects 列表与详情页数据源。

    slug 唯一用于公开 URL；tech_stack / screenshots 为 JSON 数组；
    列表按 year 降序 + id 升序展示（与原 markdown 排序语义一致）。
    """
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    # 列表卡片短描述（详情正文为 content_md）
    description: Mapped[str] = mapped_column(String(500), default="")
    # 技术栈标签数组（如 ["Next.js", "React"]）
    tech_stack: Mapped[list] = mapped_column(JSON, default=list)
    github_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    demo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # 截图 URL 数组
    screenshots: Mapped[list] = mapped_column(JSON, default=list)
    # 完成年份（列表分组/排序用）
    year: Mapped[int] = mapped_column(Integer, index=True)
    # 项目负责人（展示名，可空）
    leader: Mapped[str] = mapped_column(String(64), default="")
    content_md: Mapped[str] = mapped_column(Text)
    status: Mapped[ProjectStatus] = mapped_column(
        SAEnum(ProjectStatus), default=ProjectStatus.DRAFT, index=True
    )
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


# ==================== 主题系统（管理员可上传/启停/排序，无需改前端代码） ====================

class ThemeLayout(str, Enum):
    """主题排版骨架：microsoft=两栏（左导航+右内容）；apple=三栏（分组/子项/内容）。"""
    MICROSOFT = "microsoft"
    APPLE = "apple"


class Theme(Base):
    """界面主题（CSS 变量包 + 布局骨架）。

    - key 唯一（default / apple / 自定义如 festival-spring），User.theme 引用此 key；
    - css_vars / dark_vars 为 JSON 对象 {"--background": "60 9% 97.8%"}：
      键须 ^--[a-z0-9-]+$，值禁止 url(/expression(/</javascript:（schema 层校验）；
    - dark_vars 为 NULL 时暗色模式沿用基础 .dark 变量；
    - 软删除后由定时任务 30 天物理清除。
    """
    __tablename__ = "themes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64))
    layout: Mapped[ThemeLayout] = mapped_column(
        SAEnum(ThemeLayout), default=ThemeLayout.MICROSOFT
    )
    # 亮色 CSS 变量包（注入 documentElement.style）
    css_vars: Mapped[dict] = mapped_column(JSON, default=dict)
    # 暗色 CSS 变量包（仅 dark 模式注入；NULL = 沿用基础暗色变量）
    dark_vars: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


# ==================== Phase 6 登录体系：第三方 OAuth + SSO + 实名验证 ====================

class OAuthProvider(str, Enum):
    GITHUB = "github"
    MICROSOFT = "microsoft"
    APPLE = "apple"
    GOOGLE = "google"


class OAuthAccount(Base):
    """第三方登录绑定：provider + openid 唯一，防止重复绑定。

    raw_profile 存第三方返回的原始资料（JSON），供后台排查；不向前端展示。
    """
    __tablename__ = "oauth_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    provider: Mapped[OAuthProvider] = mapped_column(SAEnum(OAuthProvider), index=True)
    # 第三方平台的唯一用户标识（GitHub/Microsoft/Google 数字 id 或 Apple sub）
    openid: Mapped[str] = mapped_column(String(128))
    raw_profile: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class LoginChannel(Base):
    """第三方登录渠道配置（每 provider 一行）：开关 + 凭据。

    client_secret 使用 Fernet 对称加密存储（密钥派生自 JWT_SECRET_KEY），
    接口永不回传明文；Apple 渠道 secret 支持 .p8 签发的 JWT 私钥文本。
    """
    __tablename__ = "login_channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[OAuthProvider] = mapped_column(SAEnum(OAuthProvider), unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    client_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    client_secret_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 回调地址留空 = 自动按请求 host 生成 /api/oauth/{provider}/callback
    redirect_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # 预留扩展配置（如 Apple team_id/key_id、Microsoft tenant）
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )


class SsoClient(Base):
    """自建 SSO 授权服务器的受信应用。

    client_secret 仅创建/重置时明文返回一次，库中存 bcrypt 哈希；
    redirect_uris 为 JSON 数组，授权时严格精确匹配。
    """
    __tablename__ = "sso_clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    client_secret_hash: Mapped[str] = mapped_column(String(256))
    name: Mapped[str] = mapped_column(String(128))
    redirect_uris: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class RealnameStatus(str, Enum):
    PENDING = "pending"      # 待审核
    APPROVED = "approved"    # 已通过（用户 realname_verified=True）
    REJECTED = "rejected"    # 已拒绝（note 记原因，可重新提交）


class RealnameRequest(Base):
    """实名验证申请：学号 + 真实姓名 + 手机号 + 可选凭证图片。

    审核通过时同步更新 User（student_id/real_name/phone + realname_verified）。
    """
    __tablename__ = "realname_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    student_id: Mapped[str] = mapped_column(String(32))
    real_name: Mapped[str] = mapped_column(String(64))
    phone: Mapped[str] = mapped_column(String(32))
    # 凭证图片 URL（学生证/校园卡照片，可选）
    evidence_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[RealnameStatus] = mapped_column(
        SAEnum(RealnameStatus), default=RealnameStatus.PENDING, index=True
    )
    # 拒绝原因（管理员填写）
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )


# ==================== Phase 8 Memo 碎片笔记 ====================
# 业务边界：与 Blog（正式长文）、Document（多人协作文档）、Activity 并列独立。
# 三张数据表（memo / blog_post / document）不可互相替代。
#
# 全局标签池 `tags` 与 Memo / Document / Activity 共享；本期内 Document/Activity 暂未实装，
# 表结构与原生引用一致，所有新模块的标签写入同一池；旧 BlogTag 兼容历史数据，后续迁移专题处理。

# ---------- 全局共享标签池 ----------
class TagScope(str, Enum):
    """标签作用域：标识哪些模块在使用该标签。
    多模块共用同一标签时按 set 求并集；前端按需聚合展示。
    """
    MEMO = "memo"
    DOCUMENT = "document"
    ACTIVITY = "activity"


class Tag(Base):
    """全站共享标签池（与 Blog/Document/Activity/Memo 共享）；不区分模块，全局唯一。
    历史 BlogTag 保留以兼容 blog_posts / blog_post_tags；后续迁移专题处理。
    """
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # 标签显示名：用户输入原文（保留大小写 / 空格 / 中文 / Emoji）
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # URL slug：小写化 + 去特殊字符；通过 #TagName 自动懒创建时由后端从 name 派生
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    # 使用该标签的模块集合（JSON 列表，便于跨模块筛选时聚合查询）
    scopes: Mapped[list[str]] = mapped_column(JSON, default=list)
    # 全站公共基线字段
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)


# ---------- Memo 主体 ----------
class MemoVisibility(str, Enum):
    """可见性枚举：
    - public：所有人可见（含匿名访客），可被公开分享
    - member_only：仅已登录用户可见
    - private：仅作者本人可见（含后台管理员也不可见，隐私优先级最高）
    """
    PUBLIC = "public"
    MEMBER_ONLY = "member_only"
    PRIVATE = "private"


class Memo(Base):
    """碎片笔记主表（Markdown 存储；轻量随手想法，与 Blog/Document 不可互相替代）。

    公共基线字段：id / created_at / updated_at / deleted_at / tenant_id
    - deleted_at 软删除基线；archived 独立归档布尔（归档内容不在主时间线展示）
    - 归档 ≠ 删除；归档页专门浏览，删除走 deleted_at
    """
    __tablename__ = "memos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Markdown 原文（前端 MarkdownRenderer 渲染；后端存储原文便于检索 / 版本对比）
    content_md: Mapped[str] = mapped_column(Text)
    # 预渲染消毒 HTML（端点按需生成写入，列表查询时按需补）
    content_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 可见性：public / member_only / private
    visibility: Mapped[MemoVisibility] = mapped_column(
        SAEnum(MemoVisibility), default=MemoVisibility.PUBLIC, index=True
    )
    # 归档；true 时不在主时间线展示，归档页专门浏览
    archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # 公开分享 slug（可选；null = 未生成）；命中 slug 即可匿名访问（仅限 public）
    share_slug: Mapped[str | None] = mapped_column(
        String(64), nullable=True, unique=True, index=True
    )
    # 点赞数 / 收藏数冗余字段（数据源在关联表；此处用于排序与列表展示）
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    favorite_count: Mapped[int] = mapped_column(Integer, default=0)
    # 评论数（本期评论为预留接口骨架，计数仍写入）
    comment_count: Mapped[int] = mapped_column(Integer, default=0)
    # 转发/分享次数（仅计数器，不存储分享者身份）
    share_count: Mapped[int] = mapped_column(Integer, default=0)
    # 作者（外键：作者账号被删除时禁止物理删除 memo，置 author_id 为 NULL）
    author_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # 后台下架标记（admin_removed）；与 deleted_at 区分，下架可恢复，删除不可
    admin_removed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # 后台下架原因（写 audit 同步）
    admin_removed_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    admin_removed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    admin_removed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # 公共基线字段（一致遵循）
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    tenant_id: Mapped[int] = mapped_column(Integer, default=1, index=True)

    author: Mapped["User"] = relationship(foreign_keys=[author_id], lazy="joined")
    tags: Mapped[list["Tag"]] = relationship(
        secondary="memo_tag_links", lazy="selectin"
    )
    versions: Mapped[list["MemoVersion"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin",
        order_by="MemoVersion.version_no.desc()"
    )
    attachments: Mapped[list["MemoAttachment"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )


class MemoVersion(Base):
    """Memo 版本快照：每次编辑保存一条历史；支持浏览历史版本、回滚（回滚=产生新版本）。

    独立表 `memo_version`；保留原文便于 diff / 回滚；HTML 仅作为查询时的快速参考。
    """
    __tablename__ = "memo_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    memo_id: Mapped[int] = mapped_column(
        ForeignKey("memos.id", ondelete="CASCADE"), index=True
    )
    # 递增版本号（同一 memo 内单调递增）；新版覆盖编辑时+1
    version_no: Mapped[int] = mapped_column(Integer, index=True)
    # 编辑时的内容快照
    content_md: Mapped[str] = mapped_column(Text)
    # 编辑原因（可选；前端回滚时强制要求原因）
    edit_note: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # 编辑者（NULL = 系统回滚 / 自动版本）
    editor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # 编辑时的可见性快照（便于回滚时连同可见性一起回滚）
    visibility: Mapped[MemoVisibility] = mapped_column(SAEnum(MemoVisibility))

    # 公共基线字段
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tenant_id: Mapped[int] = mapped_column(Integer, default=1, index=True)

    editor: Mapped["User"] = relationship(foreign_keys=[editor_id])

    __table_args__ = (
        UniqueConstraint("memo_id", "version_no", name="uq_memo_version_no"),
    )


class MemoTag(Base):
    """Memo-Tag 多对多关联表；独立表便于扩展（与 Blog 的 blog_post_tags 风格一致）。"""
    __tablename__ = "memo_tag_links"

    memo_id: Mapped[int] = mapped_column(
        ForeignKey("memos.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class MemoLike(Base):
    """点赞：联合主键 (memo_id, user_id)；同人对同条只能点赞一次。"""
    __tablename__ = "memo_likes"

    memo_id: Mapped[int] = mapped_column(
        ForeignKey("memos.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class MemoFavorite(Base):
    """收藏：联合主键 (memo_id, user_id)。"""
    __tablename__ = "memo_favorites"

    memo_id: Mapped[int] = mapped_column(
        ForeignKey("memos.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class MemoAttachment(Base):
    """Memo 附件：支持多张图片 + 文件附件；走对象存储适配器（uploads/）。

    引用统一资源管理；删除 Memo 时随父级联清理。
    """
    __tablename__ = "memo_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    memo_id: Mapped[int] = mapped_column(
        ForeignKey("memos.id", ondelete="CASCADE"), index=True
    )
    # 文件 URL（/uploads/...）；可指向 memos 子目录
    url: Mapped[str] = mapped_column(String(512))
    # 原始文件名（用户上传时的 name，方便在日志里溯源）
    original_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    mime: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(Integer)
    # 附件类型：image / file（图片走 Markdown 自动插入；文件生成可下载链接）
    kind: Mapped[str] = mapped_column(String(16), default="file")

    # 公共基线字段
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tenant_id: Mapped[int] = mapped_column(Integer, default=1, index=True)


# ==================== 后台异步任务（通用基础设施） ====================

class BackgroundTaskCategory(str, Enum):
    """后台任务类别（可扩展；当前仅数据库全量导出）。"""
    DB_EXPORT = "db_export"


class BackgroundTaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class BackgroundTask(Base):
    """后台异步任务记录（持久化；进程重启记录不丢，禁止仅内存存储）。

    设计要点：
    - 任务行本身即「通知中心」的后台任务通知数据源（数据同源）：
      状态/进度变更直接体现在本行，通知中心与悬浮弹窗都读本表；
    - 通知不自动消失：用户手动关闭 = 置 dismissed_at；未关闭的记录刷新后仍可见；
    - 进程重启时，启动流程把残留 pending/running 记录标记为 failed（中断）。
    """
    __tablename__ = "background_tasks"

    # UUID 字符串主键（对外暴露 task_id）
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(128))
    category: Mapped[BackgroundTaskCategory] = mapped_column(
        SAEnum(BackgroundTaskCategory), index=True
    )
    status: Mapped[BackgroundTaskStatus] = mapped_column(
        SAEnum(BackgroundTaskStatus), default=BackgroundTaskStatus.PENDING, index=True
    )
    # 进度 0-100；失败时保持当前进度不回退
    progress: Mapped[int] = mapped_column(Integer, default=0)
    # 当前状态文字（如「调用 pg_dump 开始转储全部数据表」）；失败时写错误详情
    message: Mapped[str] = mapped_column(String(512), default="")
    # 成功：{"filename": ..., "path": ..., "size_bytes": ...}；失败：{"error": ...}
    result_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 创建者（Break-Glass 无 user_id → NULL，与审计约定一致）
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 用户手动关闭时间；NULL = 仍在通知中心/悬浮弹窗可见
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
