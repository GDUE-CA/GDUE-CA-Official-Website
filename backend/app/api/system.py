"""系统配置接口：站点信息、IP 黑名单、域名白名单、网络配置、管理员可信 IP 白名单。"""
import ipaddress
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.db.models import AuditLog, NetworkConfigHistory, SystemSetting
from app.db.session import get_db
from app.schemas.system import (
    AdminTrustedIpsUpdate,
    NetworkConfigHistoryOut,
    SystemSettingOut,
    SystemSettingPublicOut,
    SystemSettingUpdate,
)

router = APIRouter(prefix="/api/system", tags=["system"])
# 管理员可信 IP 白名单独立路由（前端设置页专用）
admin_config_router = APIRouter(prefix="/api/admin/config", tags=["system"])


def _log(db: AsyncSession, ctx_or_uid, action: str, detail: str | None, ip: str | None):
    """统一审计写入：ctx_or_uid 支持 ctx dict（自动区分 Break-Glass）/ int / None。"""
    log_action(db, ctx_or_uid, action, detail=detail, ip=ip)


def _log_network_change(
    db: AsyncSession,
    rec: SystemSetting,
    uid: int | None,
    changed_keys: list[str],
    ip: str | None,
):
    """网络配置变更 → 写 NetworkConfigHistory，限制最近 5 条。"""
    from datetime import datetime, timezone

    snapshot = {
        "network_port": rec.network_port,
        "network_listen_ip": rec.network_listen_ip,
        "network_domains": rec.network_domains,
    }
    summary = f"修改网络配置：{', '.join(changed_keys)}" if changed_keys else None
    db.add(NetworkConfigHistory(
        config_snapshot=snapshot,
        change_summary=summary,
        user_id=uid,
        ip=ip,
        created_at=datetime.now(timezone.utc),
    ))


async def _trim_history(db: AsyncSession):
    """只保留最近 5 条网络配置历史。"""
    rows = await db.execute(
        select(NetworkConfigHistory).order_by(NetworkConfigHistory.created_at.desc())
    )
    all_records = rows.scalars().all()
    for old in all_records[5:]:
        await db.delete(old)


async def _get_or_create_settings(db: AsyncSession) -> SystemSetting:
    rec = await db.get(SystemSetting, 1)
    if not rec:
        rec = SystemSetting(id=1)
        db.add(rec)
        await db.flush()
    return rec


# ---------- 读取：公开接口仅返回站点展示信息 ----------
@router.get("/settings", response_model=SystemSettingPublicOut)
async def get_settings(db: AsyncSession = Depends(get_db)):
    return await _get_or_create_settings(db)


# ---------- 读取：完整配置（含安全配置，需 admin） ----------
@router.get("/settings/admin", response_model=SystemSettingOut)
async def get_settings_admin(
    user: dict = Depends(require_permission("settings", "view")),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_create_settings(db)


# ---------- 修改（需 admin） ----------
@router.put("/settings", response_model=SystemSettingOut)
async def update_settings(
    req: SystemSettingUpdate,
    request: Request,
    user: dict = Depends(require_permission("settings", "manage")),
    db: AsyncSession = Depends(get_db),
):
    rec = await _get_or_create_settings(db)
    # IANA 时区校验（如果本次请求包含 sys_default_timezone）
    if req.sys_default_timezone is not None:
        try:
            from zoneinfo import ZoneInfo
            ZoneInfo(req.sys_default_timezone)
        except Exception:
            raise HTTPException(status_code=400, detail="无效的 IANA 时区")
    changed_keys = list(req.model_dump(exclude_unset=True).keys())
    network_keys = {"network_port", "network_listen_ip", "network_domains"}
    network_changed = [k for k in changed_keys if k in network_keys]
    for k, v in req.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(rec, k, v)
    uid = ctx_uid(user)
    client_ip = get_client_ip(request)
    _log(db, user, "system.settings.update",
         f"changed: {changed_keys}" if changed_keys else "no-op",
         client_ip)
    # 网络配置变更 → 写历史 + 修剪
    if network_changed:
        _log_network_change(db, rec, uid, network_changed, client_ip)
        await _trim_history(db)
    return rec


# ---------- 网络配置变更历史（需 admin，最多 5 条） ----------
@router.get("/network-config/history", response_model=list[NetworkConfigHistoryOut])
async def get_network_config_history(
    user: dict = Depends(require_permission("settings", "view")),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        select(NetworkConfigHistory)
        .order_by(NetworkConfigHistory.created_at.desc())
        .limit(5)
    )
    return rows.scalars().all()


# ---------- IP 黑名单快速操作 ----------
@router.post("/ip-blacklist")
async def add_ip_to_blacklist(
    ip: str,
    request: Request,
    user: dict = Depends(require_permission("settings", "manage")),
    db: AsyncSession = Depends(get_db),
):
    import ipaddress
    ip = ip.strip()
    try:
        ipaddress.ip_network(ip, strict=False)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的 IP / CIDR")
    rec = await _get_or_create_settings(db)
    if ip not in rec.ip_blacklist:
        rec.ip_blacklist = [*rec.ip_blacklist, ip]
        _log(db, user, "ip.blacklist.add", ip,
             get_client_ip(request))
    return {"blacklist": rec.ip_blacklist}


@router.delete("/ip-blacklist")
async def remove_ip_from_blacklist(
    ip: str,
    request: Request,
    user: dict = Depends(require_permission("settings", "manage")),
    db: AsyncSession = Depends(get_db),
):
    rec = await _get_or_create_settings(db)
    rec.ip_blacklist = [x for x in rec.ip_blacklist if x != ip]
    _log(db, user, "ip.blacklist.remove", ip,
         get_client_ip(request))
    return {"blacklist": rec.ip_blacklist}


# ---------- 管理员可信 IP 白名单（PUT /api/admin/config/admin-trusted-ips） ----------
def _parse_trusted_ip_lines(raw_lines: list[str]) -> list[str]:
    """解析白名单原始行数组：去前后空白、滤空行与 `#` 注释行，逐行校验格式。

    每行须为合法 IPv4 / IPv6 地址或两者的 CIDR 网段（单 IP 内部按 /32、/128
    Network 对象做包含判断，存储保留原始写法）。任一行非法整体拒绝，
    报错带原始行号（从 1 起）。返回过滤后的有效条目。
    """
    entries: list[str] = []
    for line_no, raw in enumerate(raw_lines, start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        try:
            ipaddress.ip_network(line, strict=False)
        except ValueError:
            raise ValueError(
                f"第{line_no}行：无效IP/CIDR格式，仅支持IPv4、IPv6以及两者的CIDR网段"
            )
        entries.append(line)
    return entries


@admin_config_router.put("/admin-trusted-ips")
async def update_admin_trusted_ips(
    req: AdminTrustedIpsUpdate,
    request: Request,
    user: dict = Depends(require_permission("settings", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """保存管理员可信 IP 白名单（支持 IPv4 / IPv6 / 两种 CIDR 混合存放）。

    - 任一行格式非法 → HTTP 400，提示含行号，整体拒绝保存；
    - 清空列表 → 回到默认状态（数据库为空回落环境变量，仍为空则全部放行）；
    - 审计日志原样记录原始字符串数组（含空行 / 注释行，不做转换）。
    """
    try:
        entries = _parse_trusted_ip_lines(req.ips)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    rec = await _get_or_create_settings(db)
    rec.admin_trusted_ips = entries
    # 审计：原样保存原始字符串数组，不做任何转换
    _log(db, user, "system.admin_trusted_ips.update",
         json.dumps(req.ips, ensure_ascii=False), get_client_ip(request))
    return {"admin_trusted_ips": entries}
