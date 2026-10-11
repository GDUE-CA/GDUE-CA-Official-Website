"""安全接口：IP 黑白名单 CRUD、封禁状态查询、网络配置读写。

- GET /api/security/ip-rules：列出黑白名单（需 security view）
- POST /api/security/ip-rules：创建规则（需 security manage，仅 super_admin）
- DELETE /api/security/ip-rules/{id}：删除规则（需 security manage）
- GET /api/security/ban-status：公开，返回当前 IP 封禁状态
- GET /api/security/network：读取网络配置（需 security view）
- PUT /api/security/network：修改网络配置（需 security manage）
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.db.models import AuditLog, IpRule, IpRuleType, NetworkConfigHistory, SystemSetting
from app.db.session import get_db
from app.schemas.security import (
    BanStatusOut,
    IpRuleCreate,
    IpRuleOut,
    NetworkConfigOut,
    NetworkConfigUpdate,
)
from app.utils.crud import apply_eq, apply_search, paginate

router = APIRouter(prefix="/api/security", tags=["security"])


def _log(db: AsyncSession, uid: int | None, action: str, detail: str | None, ip: str | None):
    db.add(AuditLog(user_id=uid, action=action, detail=detail, ip=ip))


def _is_expired(expires_at) -> bool:
    """判断规则是否已过期（UTC naive 存储）"""
    if not expires_at:
        return False
    exp = expires_at.replace(tzinfo=timezone.utc) if expires_at.tzinfo is None else expires_at
    return datetime.now(timezone.utc) >= exp


# ---------- IP 规则列表 ----------
@router.get("/ip-rules", response_model=list[IpRuleOut])
async def list_ip_rules(
    type: str | None = None,
    q: str | None = None,
    user: dict = Depends(require_permission("security", "view")),
    db: AsyncSession = Depends(get_db),
):
    """列出 IP 规则；支持按 type=whitelist/blacklist 过滤、按 rule/label/reason 搜索。"""
    stmt = select(IpRule).order_by(IpRule.created_at.desc())
    if type:
        try:
            t = IpRuleType(type)
        except ValueError as e:
            raise HTTPException(status_code=400, detail="type 必须为 whitelist 或 blacklist") from e
        stmt = apply_eq(stmt, IpRule.type, t)
    if q:
        stmt = apply_search(stmt, [IpRule.rule, IpRule.label, IpRule.reason], q)
    rows = (await db.execute(stmt)).scalars().all()
    return rows


# ---------- 创建规则 ----------
@router.post("/ip-rules", response_model=IpRuleOut, status_code=201)
async def create_ip_rule(
    payload: IpRuleCreate,
    request: Request,
    user: dict = Depends(require_permission("security", "manage")),
    db: AsyncSession = Depends(get_db),
):
    try:
        rule_type = IpRuleType(payload.type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="type 必须为 whitelist 或 blacklist") from e

    # bound_user_id 存在性校验
    if payload.bound_user_id is not None:
        from app.db.models import User
        exists = await db.get(User, payload.bound_user_id)
        if not exists:
            raise HTTPException(status_code=400, detail="bound_user_id 指向的账号不存在")

    rec = IpRule(
        type=rule_type,
        rule=payload.rule,
        label=payload.label,
        reason=payload.reason,
        expires_at=payload.expires_at.replace(tzinfo=None) if payload.expires_at else None,
        bound_user_id=payload.bound_user_id,
        created_by=int(user["user_id"]),
    )
    db.add(rec)
    _log(db, int(user["user_id"]), f"ip_rule.{rule_type.value}.create",
         f"{rec.rule} | reason={rec.reason or ''} | bound={rec.bound_user_id}",
         get_client_ip(request))
    await db.commit()
    await db.refresh(rec)
    return rec


# ---------- 删除规则 ----------
@router.delete("/ip-rules/{rule_id}", status_code=204)
async def delete_ip_rule(
    rule_id: int,
    request: Request,
    user: dict = Depends(require_permission("security", "manage")),
    db: AsyncSession = Depends(get_db),
):
    rec = await db.get(IpRule, rule_id)
    if not rec:
        raise HTTPException(status_code=404, detail="规则不存在")
    _log(db, int(user["user_id"]), f"ip_rule.{rec.type.value}.delete",
         f"{rec.rule} | id={rule_id}", get_client_ip(request))
    await db.delete(rec)
    await db.commit()


# ---------- 封禁状态（公开） ----------
@router.get("/ban-status", response_model=BanStatusOut)
async def get_ban_status(request: Request):
    """返回当前请求 IP 的封禁状态；未封禁返回 {banned: false}。"""
    from app.core.middleware import _ip_rules_cache, _ip_hit_rule
    # 复用中间件内存缓存（已由 ip_rules_middleware 定期刷新）
    # 缓存可能未刷新（如启动后第一次请求）；此处直接读 DB 保证准确
    from app.db.session import async_session
    ip = get_client_ip(request)
    if not ip:
        return BanStatusOut(banned=False)
    async with async_session() as s:
        rows = (await s.execute(
            select(IpRule).where(IpRule.type == IpRuleType.BLACKLIST)
        )).scalars().all()
        now = datetime.now(timezone.utc)
        for r in rows:
            if r.expires_at:
                exp = r.expires_at.replace(tzinfo=timezone.utc) if r.expires_at.tzinfo is None else r.expires_at
                if now >= exp:
                    continue
            if _ip_hit_rule(ip, r.rule):
                exp_out = None
                permanent = True
                if r.expires_at:
                    exp = r.expires_at.replace(tzinfo=timezone.utc) if r.expires_at.tzinfo is None else r.expires_at
                    exp_out = exp
                    permanent = False
                return BanStatusOut(
                    banned=True,
                    reason=r.reason,
                    expires_at=exp_out,
                    permanent=permanent,
                )
    return BanStatusOut(banned=False)


# ---------- 网络配置 ----------
async def _get_or_create_settings(db: AsyncSession) -> SystemSetting:
    rec = await db.get(SystemSetting, 1)
    if not rec:
        rec = SystemSetting(id=1)
        db.add(rec)
        await db.flush()
    return rec


def _log_network_change(db: AsyncSession, rec: SystemSetting, uid: int | None,
                        changed_keys: list[str], ip: str | None):
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
    rows = await db.execute(
        select(NetworkConfigHistory).order_by(NetworkConfigHistory.created_at.desc())
    )
    for old in rows.scalars().all()[5:]:
        await db.delete(old)


@router.get("/network", response_model=NetworkConfigOut)
async def get_network_config(
    user: dict = Depends(require_permission("security", "view")),
    db: AsyncSession = Depends(get_db),
):
    rec = await _get_or_create_settings(db)
    return rec


@router.put("/network", response_model=NetworkConfigOut)
async def update_network_config(
    payload: NetworkConfigUpdate,
    request: Request,
    user: dict = Depends(require_permission("security", "manage")),
    db: AsyncSession = Depends(get_db),
):
    rec = await _get_or_create_settings(db)
    network_keys = {"network_port", "network_listen_ip", "network_domains"}
    changed_keys = [k for k in payload.model_dump(exclude_unset=True).keys() if k in network_keys]
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(rec, k, v)
    uid = int(user["user_id"])
    client_ip = get_client_ip(request)
    _log(db, uid, "security.network.update",
         f"changed: {changed_keys}" if changed_keys else "no-op", client_ip)
    if changed_keys:
        _log_network_change(db, rec, uid, changed_keys, client_ip)
        await _trim_history(db)
    await db.commit()
    await db.refresh(rec)
    return rec
