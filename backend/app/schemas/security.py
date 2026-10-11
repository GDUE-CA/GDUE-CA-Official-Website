"""安全模块 Pydantic 模型：IP 黑白名单规则、封禁状态、网络配置。"""
import ipaddress
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import MultilineText, PlainText, UTCDatetime


class IpRuleCreate(BaseModel):
    """创建 IP 规则。黑名单可选 reason（展示给前端弹窗）；白名单可选 bound_user_id。"""
    type: Literal["whitelist", "blacklist"]
    rule: PlainText = Field(min_length=1, max_length=64)
    label: PlainText | None = Field(default=None, max_length=128)
    reason: MultilineText | None = Field(default=None, max_length=512)
    expires_at: datetime | None = None
    bound_user_id: int | None = None

    @field_validator("rule")
    @classmethod
    def _valid_rule(cls, v: str) -> str:
        v = v.strip()
        try:
            ipaddress.ip_network(v, strict=False)
        except ValueError as e:
            raise ValueError(f"无效的 IP / CIDR：{v}") from e
        return v

    @field_validator("bound_user_id")
    @classmethod
    def _bound_only_whitelist(cls, v, info) -> int | None:
        if v is not None and info.data.get("type") != "whitelist":
            raise ValueError("bound_user_id 仅白名单可设置")
        return v


class IpRuleOut(BaseModel):
    id: int
    type: Literal["whitelist", "blacklist"]
    rule: str
    label: str | None = None
    reason: str | None = None
    expires_at: UTCDatetime | None = None
    bound_user_id: int | None = None
    created_by: int | None = None
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


class BanStatusOut(BaseModel):
    """当前请求 IP 的封禁状态。未封禁时 banned=false，其余字段为 null。"""
    banned: bool
    reason: str | None = None
    expires_at: UTCDatetime | None = None
    permanent: bool = False


class NetworkConfigOut(BaseModel):
    """网络配置（监听端口 / IP / 域名），供后台展示与修改。"""
    network_port: int = 443
    network_listen_ip: str = "0.0.0.0"
    network_domains: list[str] = []

    model_config = {"from_attributes": True}


class NetworkConfigUpdate(BaseModel):
    network_port: int | None = Field(default=None, ge=1, le=65535)
    network_listen_ip: str | None = Field(default=None, max_length=64)
    network_domains: list[str] | None = None

    @field_validator("network_listen_ip")
    @classmethod
    def _valid_ip(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return "0.0.0.0"
        try:
            ipaddress.ip_address(v)
        except ValueError as e:
            raise ValueError("无效的监听 IP 地址") from e
        return v

    @field_validator("network_domains")
    @classmethod
    def _valid_domains(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        import re
        pattern = re.compile(
            r"^(?:\*\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$"
        )
        out = []
        for d in v:
            d = d.strip()
            if d and not pattern.match(d):
                raise ValueError(f"无效的域名格式：{d}")
            out.append(d)
        return out
