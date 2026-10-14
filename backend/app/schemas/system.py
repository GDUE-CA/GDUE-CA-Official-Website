"""系统配置 Pydantic 模型。"""
import ipaddress
import re

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import MultilineText, PlainText, UTCDatetime

_HOST_RE = re.compile(
    r"^(?:\*\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$"
)
_ORIGIN_RE = re.compile(r"^https?://[A-Za-z0-9.\-\[\]:]+$")


class SystemSettingPublicOut(BaseModel):
    """公开接口只返回站点展示信息，不暴露 IP 黑名单 / 域名 / 网络等安全配置。"""
    site_name: str
    footer: str | None
    icp_info: str | None
    club_checkin_open: bool
    # 本地化系统全局默认（前端渲染「[跟随系统：{value}]」用）
    sys_default_locale: str | None = None
    sys_default_timezone: str | None = "Asia/Shanghai"
    sys_default_region: str | None = None
    sys_default_currency: str | None = None

    model_config = {"from_attributes": True}


class SystemSettingOut(BaseModel):
    id: int
    site_name: str
    footer: str | None
    icp_info: str | None
    ip_blacklist: list[str]
    allowed_hosts: list[str]
    cors_origins: list[str]
    club_checkin_open: bool
    # 本地化系统全局默认（用户字段 NULL 时回退此处）
    sys_default_locale: str | None = None
    sys_default_timezone: str | None = "Asia/Shanghai"
    sys_default_region: str | None = None
    sys_default_currency: str | None = None
    # 网络配置
    network_port: int = 443
    network_listen_ip: str = "0.0.0.0"
    network_domains: list[str] = []
    # 管理员可信来源 IP 白名单（Web 配置，优先于环境变量 ADMIN_TRUSTED_IPS）
    admin_trusted_ips: list[str] = []
    # 全局登录会话空闲超时（分钟），预设值 [1,2,5,10,15,20,30,60,120]
    session_idle_timeout_minutes: int = 30

    model_config = {"from_attributes": True}


class SystemSettingUpdate(BaseModel):
    site_name: PlainText | None = Field(default=None, min_length=1, max_length=128)
    footer: MultilineText | None = Field(default=None, max_length=2000)
    icp_info: PlainText | None = Field(default=None, max_length=128)
    ip_blacklist: list[str] | None = None
    allowed_hosts: list[str] | None = None
    cors_origins: list[str] | None = None
    club_checkin_open: bool | None = None  # 社团报名签到开关
    # 本地化系统全局默认；PUT 时校验 IANA 时区有效性
    sys_default_locale: str | None = Field(default=None, max_length=16)
    sys_default_timezone: str | None = Field(default=None, max_length=64)
    sys_default_region: str | None = Field(default=None, max_length=16)
    sys_default_currency: str | None = Field(default=None, max_length=8)
    # 网络配置
    network_port: int | None = Field(default=None, ge=1, le=65535)
    network_listen_ip: str | None = Field(default=None, max_length=64)
    network_domains: list[str] | None = None
    # 全局登录会话空闲超时（分钟），预设值 [1,2,5,10,15,20,30,60,120]，硬性上限 120
    session_idle_timeout_minutes: int | None = Field(default=None, ge=1, le=120)

    @field_validator("ip_blacklist")
    @classmethod
    def _valid_blacklist(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out = []
        for item in (x.strip() for x in v):
            if not item:
                continue
            try:
                ipaddress.ip_network(item, strict=False)
            except ValueError:
                raise ValueError(f"无效的 IP / CIDR：{item}")
            out.append(item)
        return out

    @field_validator("allowed_hosts")
    @classmethod
    def _valid_hosts(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out = []
        for item in (x.strip() for x in v):
            if not item:
                continue
            try:
                ipaddress.ip_address(item)
            except ValueError:
                if not _HOST_RE.match(item):
                    raise ValueError(f"无效的域名 / IP：{item}")
            out.append(item)
        return out

    @field_validator("cors_origins")
    @classmethod
    def _valid_origins(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out = []
        for item in (x.strip().rstrip("/") for x in v):
            if not item:
                continue
            if not _ORIGIN_RE.match(item):
                raise ValueError(f"无效的来源（需形如 https://example.com）：{item}")
            out.append(item)
        return out

    @field_validator("network_listen_ip")
    @classmethod
    def _valid_ip(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return "0.0.0.0"
        from ipaddress import ip_address
        try:
            ip_address(v)
        except ValueError:
            raise ValueError("无效的监听 IP 地址")
        return v

    @field_validator("network_domains")
    @classmethod
    def _valid_domains(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        import re
        # 允许 domain.tld 或 *.domain.tld 的域名格式
        pattern = re.compile(
            r"^(?:\*\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$"
        )
        for d in v:
            d = d.strip()
            if d and not pattern.match(d):
                raise ValueError(f"无效的域名格式：{d}")
        return [d.strip() for d in v if d.strip()]

    @field_validator("session_idle_timeout_minutes")
    @classmethod
    def _valid_session_timeout(cls, v: int | None) -> int | None:
        if v is None:
            return None
        allowed = {1, 2, 5, 10, 15, 20, 30, 60, 120}
        if v not in allowed:
            raise ValueError(f"无效的超时时间，允许值：{sorted(allowed)}")
        return v


class AdminTrustedIpsUpdate(BaseModel):
    """管理员可信 IP 白名单保存请求：原始行数组（原样入审计日志）。

    每行一条；空行与 `#` 开头注释行过滤；其余逐行校验必须为合法
    IPv4 / IPv6 地址或两者的 CIDR 网段，任一行非法整体拒绝（400 + 行号）。
    """
    ips: list[str] = Field(default_factory=list, max_length=500)


class NetworkConfigHistoryOut(BaseModel):
    id: int
    config_snapshot: dict
    change_summary: str | None = None
    user_id: int | None = None
    ip: str | None = None
    created_at: UTCDatetime | None = None

    model_config = {"from_attributes": True}
