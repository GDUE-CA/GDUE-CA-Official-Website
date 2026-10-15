"""后台概览统计：访问来源（IP 聚合 + 地区分类）。

数据来源：
- audit_logs.ip：后台操作日志（登录、资料修改、审核等，含 IP）
- registrations.submit_ip：活动/社团报名提交 IP
- bug_reports.submit_ip：Bug 反馈提交 IP
- password_reset_requests 无 submit_ip 字段，不参与统计

地区分类（region）：
- loopback：本机回环
- internal：内网（私有地址段）
- public：公网（国家 / ASN 见 country_code / asn / org，来自 app.core.ip_intel）
- invalid：无法解析
"""
from ipaddress import ip_address
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.core.ip_intel import lookup_many
from app.core.ip_location import resolve_location
from app.db.models import (
    Activity,
    AuditLog,
    BugReport,
    PasswordResetRequest,
    PasswordResetStatus,
    Registration,
    RegistrationStatus,
)
from app.db.session import get_db
from app.schemas.common import UTCDatetime

router = APIRouter(prefix="/api/admin-stats", tags=["admin-stats"])


def _region(ip: str | None) -> str:
    """IP 地区基础分类。"""
    if not ip:
        return "invalid"
    try:
        addr = ip_address(ip.strip())
    except ValueError:
        return "invalid"
    if addr.is_loopback:
        return "loopback"
    if addr.is_private:
        return "internal"
    return "public"


class IpSourceStat(BaseModel):
    """单个 IP 的访问来源聚合。"""
    ip: str
    region: str
    total: int
    admin_actions: int
    registrations: int
    bugs: int
    last_seen: UTCDatetime | None = None
    # GeoIP 可读属地（离线库缺失/查不到时为 None，前端显示「地区未知」）
    location_zh: str | None = None
    location_en: str | None = None
    # ISO-3166-1 alpha-2 国家代码（大写，前端渲染国旗 + 本地化国名）；非公网 / 查不到为 None
    country_code: str | None = None
    asn: str | None = None
    org: str | None = None


class AccessStatsOut(BaseModel):
    total_events: int
    unique_ips: int
    top_ips: list[IpSourceStat]


class OverviewOut(BaseModel):
    """仪表盘聚合：各模块待办计数（首屏单请求替代多全量列表）。"""

    activities_total: int
    registrations_total: int
    registrations_pending: int
    bugs_open: int
    resets_pending: int


@router.get("/overview", response_model=OverviewOut)
async def get_overview(
    user: Annotated[dict, Depends(require_permission("dashboard", "view"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """仪表盘待办聚合：SQL COUNT 直查，不拉全量列表。"""
    activities_total = (await db.execute(
        select(func.count()).select_from(Activity)
    )).scalar_one()
    registrations_total = (await db.execute(
        select(func.count()).select_from(Registration)
    )).scalar_one()
    registrations_pending = (await db.execute(
        select(func.count()).select_from(Registration)
        .where(Registration.status == RegistrationStatus.PENDING)
    )).scalar_one()
    bugs_open = (await db.execute(
        select(func.count()).select_from(BugReport)
        .where(BugReport.resolved.is_(False))
    )).scalar_one()
    resets_pending = (await db.execute(
        select(func.count()).select_from(PasswordResetRequest)
        .where(PasswordResetRequest.status == PasswordResetStatus.PENDING)
    )).scalar_one()
    return OverviewOut(
        activities_total=activities_total,
        registrations_total=registrations_total,
        registrations_pending=registrations_pending,
        bugs_open=bugs_open,
        resets_pending=resets_pending,
    )


@router.get("/access", response_model=AccessStatsOut)
async def get_access_stats(
    user: Annotated[dict, Depends(require_permission("dashboard", "view"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """聚合后台操作与游客表单提交的 IP 来源统计（概览页访问来源卡片）。"""
    # 三个来源分别按 IP 聚合：次数 + 最近时间
    audit_rows = await db.execute(
        select(AuditLog.ip, func.count(), func.max(AuditLog.created_at))
        .where(AuditLog.ip.isnot(None))
        .group_by(AuditLog.ip)
    )
    reg_rows = await db.execute(
        select(Registration.submit_ip, func.count(), func.max(Registration.submitted_at))
        .where(Registration.submit_ip.isnot(None))
        .group_by(Registration.submit_ip)
    )
    bug_rows = await db.execute(
        select(BugReport.submit_ip, func.count(), func.max(BugReport.created_at))
        .where(BugReport.submit_ip.isnot(None))
        .group_by(BugReport.submit_ip)
    )

    merged: dict[str, dict] = {}

    def _bump(ip: str, count: int, last, field: str):
        entry = merged.setdefault(ip, {
            "total": 0, "admin_actions": 0, "registrations": 0, "bugs": 0, "last_seen": None,
        })
        entry["total"] += count
        entry[field] += count
        if last is not None and (entry["last_seen"] is None or last > entry["last_seen"]):
            entry["last_seen"] = last

    for ip, cnt, last in audit_rows.all():
        _bump(ip.strip(), cnt, last, "admin_actions")
    for ip, cnt, last in reg_rows.all():
        _bump(ip.strip(), cnt, last, "registrations")
    for ip, cnt, last in bug_rows.all():
        _bump(ip.strip(), cnt, last, "bugs")

    top = sorted(merged.items(), key=lambda kv: kv[1]["total"], reverse=True)[:20]
    intel = await lookup_many([ip for ip, _ in top])
    return AccessStatsOut(
        total_events=sum(e["total"] for e in merged.values()),
        unique_ips=len(merged),
        top_ips=[
            IpSourceStat(
                ip=ip,
                region=_region(ip),
                total=e["total"],
                admin_actions=e["admin_actions"],
                registrations=e["registrations"],
                bugs=e["bugs"],
                last_seen=e["last_seen"],
                location_zh=_geo(ip)[0],
                location_en=_geo(ip)[1],
                country_code=intel[ip].country_code,
                asn=intel[ip].asn,
                org=intel[ip].org,
            )
            for ip, e in top
        ],
    )


def _geo(ip: str) -> tuple[str | None, str | None]:
    """单 IP 属地解析（GeoIP 失败时降级为 (None, None)，绝不抛 500）。"""
    try:
        return resolve_location(ip)
    except Exception:
        return (None, None)
