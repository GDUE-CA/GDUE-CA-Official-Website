"""系统配置接口：站点信息、IP 黑名单、域名白名单、网络配置。"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.db.models import AuditLog, NetworkConfigHistory, SystemSetting
from app.db.session import get_db
from app.schemas.system import (
    NetworkConfigHistoryOut,
    SystemSettingOut,
    SystemSettingPublicOut,
    SystemSettingUpdate,
)

router = APIRouter(prefix="/api/system", tags=["system"])


def _log(db: AsyncSession, uid: int | None, action: str, detail: str | None, ip: str | None):
    db.add(AuditLog(user_id=uid, action=action, detail=detail, ip=ip))


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
    # IANA 时区校验（如果本次请求包含 system_timezone）
    if req.system_timezone is not None:
        try:
            from zoneinfo import ZoneInfo
            ZoneInfo(req.system_timezone)
        except Exception:
            raise HTTPException(status_code=400, detail="无效的 IANA 时区")
    changed_keys = list(req.model_dump(exclude_unset=True).keys())
    network_keys = {"network_port", "network_listen_ip", "network_domains"}
    network_changed = [k for k in changed_keys if k in network_keys]
    for k, v in req.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(rec, k, v)
    uid = int(user["user_id"])
    client_ip = get_client_ip(request)
    _log(db, uid, "system.settings.update",
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
        _log(db, int(user["user_id"]), "ip.blacklist.add", ip,
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
    _log(db, int(user["user_id"]), "ip.blacklist.remove", ip,
         get_client_ip(request))
    return {"blacklist": rec.ip_blacklist}
