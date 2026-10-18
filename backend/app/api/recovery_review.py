"""忘记密码·人工审核找回账号 API（V0.5.8 §5.2 分支路由 + §5.3/§5.4 双表单工单）。

公开端点：
- POST /api/auth/forgot-password/identify       账号识别（分支路由 + 脱敏邮箱回显）
- POST /api/auth/forgot-password/manual-review  提交人工审核工单（校内 / 社会外部）

管理端点（复用 review.resets 模块权限，审核中心统一展示）：
- GET  /api/auth/password-recovery-reviews             工单列表（身份证脱敏）
- POST /api/auth/password-recovery-reviews/{id}/approve  通过（发恢复码 / 绑定联系邮箱）
- POST /api/auth/password-recovery-reviews/{id}/reject   驳回（理由邮件通知）

安全要点：
- 身份证号 Fernet 加密入库（app.core.crypto），后台仅脱敏展示，绝不输出明文；
- 曾经旧密码仅瞬时哈希比对存布尔结果，绝不入库；
- 审核通过发放的一次性恢复码复用 V0.5.8 §4 恢复码体系（用户走恢复码通道自助重置，
  管理员全程不接触用户新密码）；结果邮件通知联系邮箱（SMTP 未配置仅记服务端日志）；
- 提交 / 通过 / 驳回全部写审计日志。
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import _placeholder_email
from app.api.recovery_codes import _digest, _gen_code
from app.core.audit import ctx_uid, log_action
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.mailer import send_email
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.rate_limit import rate_limit
from app.core.responses import ok
from app.core.security import verify_password
from app.db.models import (
    PasswordResetRequest,
    PasswordResetStatus,
    User,
    UserRecoveryCode,
    UserSecurityQuestion,
)
from app.db.session import get_db
from app.schemas.auth import (
    ForgotIdentifyRequest,
    ManualReviewApproveRequest,
    ManualReviewOut,
    ManualReviewRejectRequest,
    ManualReviewRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger("gdueca.recovery_review")


def _now() -> datetime:
    """数据库统一存 naive UTC。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _mask_email(email: str) -> str | None:
    """脱敏邮箱回显（ab***@example.com）；占位邮箱不视为可收信邮箱返回 None。"""
    if not email or _placeholder_email(email):
        return None
    local, _, domain = email.partition("@")
    head = local[:2] if len(local) >= 2 else local[:1]
    return f"{head}***@{domain}"


def _mask_id_card(plain: str) -> str:
    """身份证脱敏：保留前 4 后 4，其余 *（1101**********1234）。"""
    if len(plain) <= 8:
        return "****"
    return f"{plain[:4]}{'*' * (len(plain) - 8)}{plain[-4:]}"


async def _resolve_user(db: AsyncSession, account: str) -> User | None:
    """按用户名或绑定邮箱定位账号（未软删）。"""
    return (await db.execute(
        select(User).where(
            or_(User.username == account, User.email == account),
            User.is_deleted.is_(False),
        ).limit(1)
    )).scalar_one_or_none()


# ---------- 公开：账号识别（分支路由） ----------
@router.post(
    "/forgot-password/identify",
    dependencies=[Depends(rate_limit("forgot-identify", limit=10, window_seconds=60))],
)
async def forgot_identify(
    req: ForgotIdentifyRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """识别账号并返回分支路由所需信息。

    用于忘记密码向导：分支1（记得用户名）/ 分支2（只记得绑定邮箱）进入后，
    前端据此展示「邮箱验证码 / 安全问题 / 恢复码」可选验证方式与脱敏邮箱。
    """
    account = req.account.strip()
    user = await _resolve_user(db, account)
    exists = bool(user and user.is_active)
    email_masked = _mask_email(user.email) if exists else None
    has_sq = False
    if exists:
        cnt = (await db.execute(
            select(UserSecurityQuestion.id)
            .where(UserSecurityQuestion.user_id == user.id).limit(3)
        )).scalars().all()
        has_sq = len(cnt) >= 3
    return ok({
        "exists": exists,
        "email_masked": email_masked,
        "has_security_questions": has_sq,
    })


# ---------- 公开：提交人工审核工单 ----------
@router.post(
    "/forgot-password/manual-review",
    dependencies=[Depends(rate_limit("forgot-manual", limit=3, window_seconds=3600))],
)
async def submit_manual_review(
    req: ManualReviewRequest,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """提交人工审核找回账号工单（校内 / 社会外部双表单，分支3 强制入口）。"""
    client_ip = get_client_ip(request)
    contact = str(req.contact_email).strip()
    hint = (req.account_hint or "").strip() or None

    matched = await _resolve_user(db, hint) if hint else None
    # 曾经旧密码：仅瞬时哈希比对存布尔结果，明文绝不入库
    old_matched: bool | None = None
    if req.old_password and matched is not None:
        old_matched = verify_password(req.old_password, matched.password_hash)

    row = PasswordResetRequest(
        contact_email=contact,
        username_hint=hint,
        reason="人工审核找回账号",  # 兼容旧列 NOT NULL；双表单无 reason 字段
        kind=req.kind,
        real_name=req.real_name.strip(),
        student_id=(req.student_id or "").strip() or None,
        id_card_enc=encrypt_secret(req.id_card.strip()) if req.id_card else None,
        college=(req.college or "").strip() or None,
        major=(req.major or "").strip() or None,
        class_name=(req.class_name or "").strip() or None,
        register_time_hint=(req.register_time_hint or "").strip() or None,
        old_password_matched=old_matched,
        matched_user_id=matched.id if matched else None,
        submit_ip=client_ip,
    )
    db.add(row)
    await db.flush()
    log_action(db, None, "recovery_review.submit",
               f"ticket:{row.id} kind:{req.kind} matched:{matched.id if matched else '-'}",
               client_ip)
    await db.commit()
    return {"ok": True, "message": "申请已提交，管理员审核结果将通过邮件通知您",
            "request_id": row.id}


# ---------- 管理端：工单列表 / 通过 / 驳回 ----------
def _out(row: PasswordResetRequest, matched_username: str | None) -> ManualReviewOut:
    masked = None
    if row.id_card_enc:
        plain = decrypt_secret(row.id_card_enc)
        masked = _mask_id_card(plain) if plain else "****"
    return ManualReviewOut(
        id=row.id,
        kind=row.kind,
        contact_email=row.contact_email,
        username_hint=row.username_hint,
        real_name=row.real_name,
        student_id=row.student_id,
        id_card_masked=masked,
        college=row.college,
        major=row.major,
        class_name=row.class_name,
        register_time_hint=row.register_time_hint,
        old_password_matched=row.old_password_matched,
        matched_user_id=row.matched_user_id,
        matched_username=matched_username,
        status=row.status,
        admin_note=row.admin_note,
        handled_action=row.handled_action,
        handled_by=row.handled_by,
        handled_at=row.handled_at,
        submit_ip=row.submit_ip,
        created_at=row.created_at,
    )


@router.get("/password-recovery-reviews", response_model=list[ManualReviewOut])
async def list_recovery_reviews(
    status_filter: PasswordResetStatus | None = None,
    kind: str | None = None,
    user: dict = Depends(require_permission("review.resets", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """人工审核工单列表（含 legacy 工单；身份证仅脱敏输出）。"""
    stmt = (
        select(PasswordResetRequest, User.username)
        .outerjoin(User, PasswordResetRequest.matched_user_id == User.id)
        .order_by(PasswordResetRequest.created_at.desc())
        .limit(200)
    )
    if status_filter is not None:
        stmt = stmt.where(PasswordResetRequest.status == status_filter)
    if kind:
        stmt = stmt.where(PasswordResetRequest.kind == kind)
    rows = (await db.execute(stmt)).all()
    return [_out(row, username) for row, username in rows]


async def _notify(email: str, subject: str, body: str) -> bool:
    """结果邮件通知；SMTP 未配置/失败仅记服务端日志（开发兜底含恢复码时打日志）。"""
    sent = await send_email(email, subject, body)
    if not sent:
        logger.warning("审核结果邮件未成功投递（SMTP未配置或失败，仅限开发环境排查）"
                       "邮箱=%s 主题=%s 正文=%s", email, subject, body.replace("\n", " | "))
    return sent


@router.post("/password-recovery-reviews/{ticket_id}/approve")
async def approve_recovery_review(
    ticket_id: int,
    req: ManualReviewApproveRequest,
    request: Request,
    user: dict = Depends(require_permission("review.resets", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """审核通过：按动作执行（同事务），结果邮件通知联系邮箱。

    - send_recovery_code：为匹配账号生成一次性恢复码并邮寄给用户，
      用户走「忘记密码·恢复码通道」自助重置（管理员不接触新密码）；
    - bind_contact_email：将联系邮箱绑定为账号新邮箱（占用校验）。
    """
    row = await db.get(PasswordResetRequest, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="工单不存在")
    if row.status != PasswordResetStatus.PENDING.value:
        raise HTTPException(status_code=409, detail="该工单已被处理")
    target = await db.get(User, row.matched_user_id) if row.matched_user_id else None
    if target is None or target.is_deleted:
        raise HTTPException(status_code=400, detail="未匹配到有效账号，无法执行通过动作")

    if req.action == "send_recovery_code":
        code = _gen_code()
        db.add(UserRecoveryCode(user_id=target.id, code_sha256=_digest(code)))
        await _notify(
            row.contact_email,
            "GDUE-CA 账号找回审核已通过",
            "您的账号找回申请已审核通过。\n\n"
            f"一次性安全恢复码：{code}\n\n"
            "请前往忘记密码页面选择「使用安全恢复码找回账号」，输入账号与该恢复码重置密码。"
            "恢复码仅可使用一次，请妥善保管，请勿泄露给他人。\n",
        )
    else:  # bind_contact_email
        new_email = row.contact_email.strip().lower()
        if _placeholder_email(new_email):
            raise HTTPException(status_code=400, detail="联系邮箱不可用")
        dup = (await db.execute(
            select(User).where(User.email == new_email, User.id != target.id)
        )).scalar_one_or_none()
        if dup is not None:
            raise HTTPException(status_code=400, detail="联系邮箱已被其他账号占用")
        old_email = target.email
        target.email = new_email
        await _notify(
            new_email,
            "GDUE-CA 账号找回审核已通过",
            "您的账号找回申请已审核通过。\n\n"
            f"账号绑定邮箱已由 {old_email} 变更为本邮箱，"
            "您现在可以使用「忘记密码·邮箱验证码」重置密码。\n",
        )

    row.status = PasswordResetStatus.HANDLED.value
    row.handled_action = req.action
    row.admin_note = req.admin_note
    row.handled_by = ctx_uid(user)
    row.handled_at = _now()
    log_action(db, user, "recovery_review.approve",
               f"ticket:{row.id} action:{req.action} target:{target.id}",
               get_client_ip(request))
    await db.commit()
    return {"ok": True, "message": "已通过审核并通知用户"}


@router.post("/password-recovery-reviews/{ticket_id}/reject")
async def reject_recovery_review(
    ticket_id: int,
    req: ManualReviewRejectRequest,
    request: Request,
    user: dict = Depends(require_permission("review.resets", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """驳回：理由必填，邮件通知联系邮箱。"""
    reason = req.reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail="驳回理由不能为空")
    row = await db.get(PasswordResetRequest, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="工单不存在")
    if row.status != PasswordResetStatus.PENDING.value:
        raise HTTPException(status_code=409, detail="该工单已被处理")

    row.status = PasswordResetStatus.REJECTED.value
    row.admin_note = reason
    row.handled_by = ctx_uid(user)
    row.handled_at = _now()
    await _notify(
        row.contact_email,
        "GDUE-CA 账号找回申请已被驳回",
        f"很遗憾，您的账号找回申请未通过审核。\n\n驳回理由：{reason}\n\n"
        "如有疑问可重新整理证明材料后再次提交申请。\n",
    )
    log_action(db, user, "recovery_review.reject",
               f"ticket:{row.id} reason:{reason[:64]}", get_client_ip(request))
    await db.commit()
    return {"ok": True, "message": "已驳回并通知用户"}
