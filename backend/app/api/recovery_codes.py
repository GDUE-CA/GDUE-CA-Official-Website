"""一次性安全恢复码 API（V0.5.8 §4：账号兜底找回密钥）。

用户端（/api/auth/recovery-codes）：
- POST   /            生成新码：明文仅此一次返回，库中只存 SHA-256；
- GET    /            列出本账号全部恢复码元数据（无明文/哈希）；
- DELETE /{code_id}   手动作废旧码（仅本人，已使用的码不可再作废）。

找回端（/api/auth/forgot-password/recovery-reset）：
- 忘记密码页面的「使用安全恢复码找回账号」通道；账号定位支持用户名或绑定邮箱；
- 防账号枚举：账号不存在 / 码错误 / 码已使用 / 码已作废，对外统一 400 模糊提示；
- 找回成功：码一次性作废（同事务 used_at）+ 重置密码 + 全部会话强制下线。

安全要点：
- 生成 / 使用 / 作废全部写审计日志；
- Break-Glass 应急账号不适用（无 users 行，无恢复码）；
- 恢复码高熵（20 位去混淆字符，约 100 bits），SHA-256 存储即可抗离线爆破。
"""
import hashlib
import json
import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import _reject_break_glass, _require_strong_password, _revoke_user_sessions
from app.core.audit import ctx_uid, log_action
from app.core.middleware import get_client_ip
from app.core.rate_limit import rate_limit
from app.core.security import Role, hash_password, require_role
from app.db.models import User, UserRecoveryCode
from app.db.session import get_db
from app.schemas.auth import RecoveryCodeCreateOut, RecoveryCodeOut, RecoveryResetRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger("gdueca.recovery_codes")

# 去混淆字符集（无 0/O/1/I/L），4 组 × 5 位展示形态
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

# 写基准：对齐 auth.py profile 更新端点（登录 member 及以上即可管理自己的恢复码）
_WRITE_DEP = Depends(require_role(Role.MEMBER, allow_unverified_realname=True))


def _now() -> datetime:
    """数据库统一存 naive UTC。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _gen_code() -> str:
    """生成展示形态恢复码：XXXXX-XXXXX-XXXXX-XXXXX（20 位去混淆字符）。"""
    raw = "".join(secrets.choice(_ALPHABET) for _ in range(20))
    return "-".join(raw[i:i + 5] for i in range(0, 20, 5))


def _digest(code: str) -> str:
    """规范化（去分隔符 + 去空格 + 大写）后 SHA-256。"""
    norm = code.replace("-", "").replace(" ", "").strip().upper()
    return hashlib.sha256(norm.encode()).hexdigest()


def _out(row: UserRecoveryCode) -> RecoveryCodeOut:
    return RecoveryCodeOut.model_validate(row)


# ---------- 用户端：生成 / 列表 / 作废 ----------
@router.post(
    "/recovery-codes",
    response_model=RecoveryCodeCreateOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("recovery-gen", limit=5, window_seconds=3600))],
)
async def generate_recovery_code(
    request: Request,
    user: dict = _WRITE_DEP,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """生成一次性恢复码：明文仅此响应返回一次，此后服务端只存哈希无法还原。"""
    _reject_break_glass(user)
    uid = ctx_uid(user)
    code = _gen_code()
    row = UserRecoveryCode(user_id=uid, code_sha256=_digest(code))
    db.add(row)
    await db.flush()
    log_action(db, user, "recovery_code.generate", f"uid:{uid} code_id:{row.id}",
               get_client_ip(request))
    await db.commit()
    return RecoveryCodeCreateOut(code=code, item=_out(row))


@router.get("/recovery-codes", response_model=list[RecoveryCodeOut])
async def list_recovery_codes(
    user: dict = _WRITE_DEP,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """本账号全部恢复码元数据（含已使用 / 已作废，前端分状态展示）。"""
    _reject_break_glass(user)
    rows = (await db.execute(
        select(UserRecoveryCode)
        .where(UserRecoveryCode.user_id == ctx_uid(user))
        .order_by(UserRecoveryCode.created_at.desc())
    )).scalars().all()
    return [_out(r) for r in rows]


@router.delete("/recovery-codes/{code_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_recovery_code(
    code_id: int,
    request: Request,
    user: dict = _WRITE_DEP,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """手动作废：仅本人可作废；已使用的码不可再作废（状态已终态）。"""
    _reject_break_glass(user)
    row = await db.get(UserRecoveryCode, code_id)
    if row is None or row.user_id != ctx_uid(user):
        raise HTTPException(status_code=404, detail="恢复码不存在")
    if row.used_at is not None:
        raise HTTPException(status_code=400, detail="该恢复码已使用，无需作废")
    if row.revoked:
        raise HTTPException(status_code=400, detail="该恢复码已作废")
    row.revoked = True
    row.revoked_at = _now()
    log_action(db, user, "recovery_code.revoke", f"uid:{row.user_id} code_id:{row.id}",
               get_client_ip(request))
    await db.commit()


# ---------- 找回端：忘记密码·恢复码重置密码 ----------
@router.post(
    "/forgot-password/recovery-reset",
    dependencies=[Depends(rate_limit("recovery-reset", limit=5, window_seconds=3600))],
)
async def reset_password_with_recovery_code(
    req: RecoveryResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """恢复码找回账号：一次性核销 + 重置密码 + 全部会话强制下线。

    防账号枚举：账号不存在与码无效对外完全一致（400 模糊提示），真实原因仅写审计。
    """
    client_ip = get_client_ip(request)
    fingerprint = (request.headers.get("x-browser-fingerprint") or "").strip()[:128] or None
    account = req.account.strip()
    target = (await db.execute(
        select(User).where(
            or_(User.username == account, User.email == account),
            User.is_deleted.is_(False),
        ).limit(1)
    )).scalar_one_or_none()

    code_row = None
    if target is not None and target.is_active:
        digest = _digest(req.recovery_code)
        code_row = (await db.execute(
            select(UserRecoveryCode).where(
                UserRecoveryCode.user_id == target.id,
                UserRecoveryCode.code_sha256 == digest,
                UserRecoveryCode.used_at.is_(None),
                UserRecoveryCode.revoked.is_(False),
            ).limit(1)
        )).scalar_one_or_none()

    if target is None or code_row is None:
        log_action(db, None, "recovery_code.use_failed",
                   f"account:{account[:32]}", client_ip)
        await db.commit()
        raise HTTPException(status_code=400, detail="恢复码无效或已失效")

    _require_strong_password(req.new_password, target.username, target.email)
    target.password_hash = hash_password(req.new_password)
    target.must_change_password = False
    target.password_changed_at = _now()
    # 一次性：找回成功瞬间核销（同事务，禁止复用）
    code_row.used_at = _now()
    # 全部会话强制下线
    await _revoke_user_sessions(db, target.id)
    log_action(db, target.id, "recovery_code.use", json.dumps({
        "code_id": code_row.id,
        "fingerprint": fingerprint,
        "sessions_revoked": "all",
    }, ensure_ascii=False), client_ip)
    log_action(db, target.id, "password_reset", json.dumps({
        "method": "recovery_code",
        "fingerprint": fingerprint,
    }, ensure_ascii=False), client_ip)
    await db.commit()
    return {"ok": True, "message": "密码已重置，请使用新密码登录"}
