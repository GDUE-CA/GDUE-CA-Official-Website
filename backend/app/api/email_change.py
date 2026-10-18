"""更换绑定邮箱接口：三条路径 + 后台人工审核。

路径A（旧邮箱可用）：一次接口同时向旧邮箱 + 新邮箱各发一份 6 位验证码，
提交「旧码 + 新码 + 当前登录密码」三项全部通过才换绑；不强制下线（保留全部会话）。
路径B（旧邮箱失效）：用户主动进入；四项核验（当前密码/学号/手机号/真实姓名）
必须全部匹配数据库，任一错误统一模糊拒绝（防爆破：5 次/小时锁 1 小时）；
通过后仅验证新邮箱所有权即可换绑。
路径C（人工申请）：自助全部行不通的兜底；pending 期间全部自助入口禁用（后端强制），
管理员同意仅打一次性豁免标记（绝不直接改邮箱），最终换绑由用户本人确认提交；
豁免换绑成功瞬间同事务清除标记（一次性，禁止复用）。

Superadmin(Break-Glass) 约束：邮箱仅环境变量初始化或后台面板修改，
本文件全部用户侧端点对 BG 一律 403，禁止自助换绑与提交人工申请。

安全要点：
- 全部校验后端二次实现，绝不信任前端传来的校验结果；
- 每次成功换绑写审计日志（uid/旧邮箱/新邮箱/IP/浏览器指纹，trace_id 由中间件落库）；
- 验证码 KV 存 SHA-256（TTL 15 分钟），SMTP 未配置时仅打服务端日志（开发兜底）；
- 管理端点按 review.emails 模块权限保护（super_admin/admin view+manage）。
"""
import hashlib
import json
import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import _email_hash, _placeholder_email, _reject_break_glass
from app.core.audit import ctx_uid, log_action
from app.core.config import get_settings
from app.core.kv import get_kv
from app.core.mailer import is_configured as mailer_configured, send_email
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.rate_limit import rate_limit
from app.core.security import Role, require_role, verify_password
from app.core.user_message import push_user_message
from app.db.models import EmailChangeRequest, EmailChangeStatus, User
from app.db.session import get_db
from app.schemas.auth import (
    EmailChangeExemptConfirmRequest,
    EmailChangeLostOldConfirmRequest,
    EmailChangeLostOldSendCodeRequest,
    EmailChangeLostOldVerifyRequest,
    EmailChangeManualRequestRequest,
    EmailChangeNormalConfirmRequest,
    EmailChangeRejectRequest,
    EmailChangeRequestOut,
    EmailChangeSendCodesRequest,
    EmailChangeStatusOut,
)

router = APIRouter(prefix="/api/auth/email-change", tags=["auth"])

settings = get_settings()
logger = logging.getLogger("gdueca.email_change")

# 读基准：对齐 auth.py profile 端点（首次登录改密前可查看自身状态）
_READ_DEP = Depends(require_role(Role.MEMBER, allow_pending_password_change=True,
                                 allow_unverified_realname=True))
# 写基准：对齐 auth.py profile 更新端点
_WRITE_DEP = Depends(require_role(Role.MEMBER, allow_unverified_realname=True))

_CODE_TTL = settings.EMAIL_CHANGE_CODE_TTL_SECONDS          # 15 分钟（需求规定）
_MAX_ATTEMPTS = settings.EMAIL_CODE_MAX_ATTEMPTS            # 单码最大尝试次数
_RESEND_INTERVAL = settings.EMAIL_CODE_RESEND_INTERVAL_SECONDS  # 重发间隔
_FAIL_LIMIT = 5                                             # 路径B 核验失败次数上限
_FAIL_TTL = 3600                                            # 失败计数 / 锁定窗口（1 小时）


def _now() -> datetime:
    """数据库统一存 naive UTC。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _norm(email: str) -> str:
    return email.strip().lower()


def _fingerprint(request: Request) -> str | None:
    return (request.headers.get("x-browser-fingerprint") or "").strip()[:128] or None


def _audit(db: AsyncSession, ctx: dict, action: str, detail: dict, ip: str | None) -> None:
    """统一审计写入：detail JSON 含新旧邮箱/指纹，trace_id 由中间件列自动落库。"""
    log_action(db, ctx, action, json.dumps(detail, ensure_ascii=False), ip=ip)


def _json_detail(row: EmailChangeRequest, fields: tuple[str, ...]) -> dict:
    return {f: getattr(row, f) for f in fields}


async def _load_user(db: AsyncSession, uid: int) -> User:
    user = await db.get(User, uid)
    if user is None:
        raise HTTPException(status_code=404, detail="账号不存在")
    return user


async def _ensure_no_pending_lock(db: AsyncSession, user: User) -> None:
    """统一前置锁（防并发冲突）：待审核期间自助通道全禁；豁免标记待用走专用端点。"""
    pending = (await db.execute(
        select(EmailChangeRequest).where(
            EmailChangeRequest.user_id == user.id,
            EmailChangeRequest.status == EmailChangeStatus.PENDING,
        ).limit(1)
    )).scalar_one_or_none()
    if pending is not None:
        raise HTTPException(status_code=409, detail="已有待审核的更改绑定邮箱申请，审核完成前无法自助修改")
    if user.allow_manual_email_switch:
        raise HTTPException(status_code=409, detail="管理员已核准你的换绑申请，请使用豁免通道完成换绑")


async def _check_new_email(db: AsyncSession, user: User, new_email: str) -> None:
    """新邮箱基础校验：占位地址 / 与当前相同 / 已被其他账号占用。"""
    if _placeholder_email(new_email):
        raise HTTPException(status_code=400, detail="请输入有效的邮箱地址")
    if _norm(new_email) == _norm(user.email):
        raise HTTPException(status_code=400, detail="新邮箱不能与当前绑定邮箱相同")
    dup = (await db.execute(
        select(User).where(User.email == new_email)
    )).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(status_code=400, detail="邮箱已被使用")


def _gen_code() -> str:
    return f"{secrets.randbelow(1000000):06d}"


async def _mail_code(email: str, subject: str, code: str) -> bool:
    """发送验证码邮件；SMTP 未配置/失败时仅打服务端日志（开发兜底，绝不经响应回传）。"""
    body = (
        f"您正在更换 GDUE-CA 账号的绑定邮箱。\n\n验证码：{code}\n\n"
        f"{max(_CODE_TTL // 60, 1)} 分钟内有效，请勿泄露给他人。若非本人操作，请忽略本邮件。\n"
    )
    sent = await send_email(email, subject, body)
    if not sent:
        logger.warning(
            "更换绑定邮箱验证码未成功投递（SMTP未配置或失败，仅限开发环境排查）邮箱=%s 验证码=%s",
            email, code)
    return sent


async def _kv_incr_with_ttl(kv, key: str, ttl: int) -> int:
    """计数自增：键首次创建时带 TTL（incrby 不为新建键设过期）。"""
    if not await kv.exists(key):
        await kv.setex(key, ttl, "0")
    return await kv.incrby(key, 1)


# ---------- 端点 1：换绑状态（用户端板块渲染依据） ----------
@router.get("/status", response_model=EmailChangeStatusOut)
async def email_change_status(
    user: dict = _READ_DEP,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    _reject_break_glass(user)
    u = await _load_user(db, ctx_uid(user))
    pending = (await db.execute(
        select(EmailChangeRequest).where(
            EmailChangeRequest.user_id == u.id,
            EmailChangeRequest.status == EmailChangeStatus.PENDING,
        ).order_by(EmailChangeRequest.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    last_rejected = (await db.execute(
        select(EmailChangeRequest).where(
            EmailChangeRequest.user_id == u.id,
            EmailChangeRequest.status == EmailChangeStatus.REJECTED,
        ).order_by(EmailChangeRequest.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    approved_app = None
    if u.allow_manual_email_switch:
        approved_app = (await db.execute(
            select(EmailChangeRequest).where(
                EmailChangeRequest.user_id == u.id,
                EmailChangeRequest.status == EmailChangeStatus.APPROVED,
            ).order_by(EmailChangeRequest.reviewed_at.desc()).limit(1)
        )).scalar_one_or_none()
    return EmailChangeStatusOut(
        current_email=u.email,
        is_placeholder=_placeholder_email(u.email),
        allow_manual_email_switch=bool(u.allow_manual_email_switch),
        pending=_json_detail(pending, ("id", "new_email", "remark", "created_at")) if pending else None,
        approved_application=_json_detail(approved_app, ("id", "new_email", "remark", "created_at"))
        if approved_app else None,
        last_rejected=_json_detail(last_rejected, ("id", "new_email", "reject_reason", "created_at"))
        if last_rejected else None,
    )


# ---------- 路径A：旧邮箱可用（正常自助换绑） ----------
@router.post(
    "/normal/send-codes",
    dependencies=[Depends(rate_limit("emailchg-send", limit=5, window_seconds=3600))],
)
async def normal_send_codes(
    req: EmailChangeSendCodesRequest,
    request: Request,
    user: dict = _WRITE_DEP,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """一次接口同时向旧邮箱 + 新邮箱各发一份验证码（确认持有旧邮箱 + 控制新邮箱）。"""
    _reject_break_glass(user)
    u = await _load_user(db, ctx_uid(user))
    await _ensure_no_pending_lock(db, u)
    await _check_new_email(db, u, str(req.new_email))
    if _placeholder_email(u.email):
        raise HTTPException(
            status_code=400,
            detail="当前绑定邮箱无法接收邮件，请使用「原邮箱无法接收验证码」自助核验通道或提交人工申请")

    kv = get_kv()
    resend_key = f"emailchg:resend:{u.id}"
    if await kv.exists(resend_key):
        return {"ok": True, "message": "验证码发送间隔未到，请稍后查收"}
    await kv.setex(resend_key, _RESEND_INTERVAL, "1")

    uid = u.id
    old_code, new_code = _gen_code(), _gen_code()
    await kv.setex(f"emailchg:a:old:{uid}", _CODE_TTL, json.dumps(
        {"email": u.email, "code": hashlib.sha256(old_code.encode()).hexdigest()}))
    await kv.setex(f"emailchg:a:new:{uid}", _CODE_TTL, json.dumps(
        {"email": _norm(str(req.new_email)), "code": hashlib.sha256(new_code.encode()).hexdigest()}))
    await kv.setex(f"emailchg:a:att:old:{uid}", _CODE_TTL, "0")
    await kv.setex(f"emailchg:a:att:new:{uid}", _CODE_TTL, "0")

    old_sent = await _mail_code(u.email, "GDUE-CA 更换绑定邮箱验证码（原邮箱确认）", old_code)
    new_sent = await _mail_code(_norm(str(req.new_email)), "GDUE-CA 更换绑定邮箱验证码（新邮箱确认）", new_code)

    _audit(db, user, "email_change_send_codes", {
        "old_email": u.email, "new_email": _norm(str(req.new_email)),
        "old_sent": old_sent, "new_sent": new_sent, "smtp": mailer_configured(),
        "fingerprint": _fingerprint(request),
    }, get_client_ip(request))
    await db.commit()
    return {"ok": True, "message": "验证码已发送至原邮箱与新邮箱，请查收"}


@router.post(
    "/normal/confirm",
    dependencies=[Depends(rate_limit("emailchg-confirm", limit=10, window_seconds=3600))],
)
async def normal_confirm(
    req: EmailChangeNormalConfirmRequest,
    request: Request,
    user: dict = _WRITE_DEP,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """旧码 + 新码 + 当前登录密码三项全部通过才换绑；不撤销任何登录会话。"""
    _reject_break_glass(user)
    u = await _load_user(db, ctx_uid(user))
    await _ensure_no_pending_lock(db, u)

    kv = get_kv()
    uid = u.id
    old_key, new_key = f"emailchg:a:old:{uid}", f"emailchg:a:new:{uid}"
    old_raw = await kv.get(old_key)
    new_raw = await kv.get(new_key)
    if not old_raw or not new_raw:
        raise HTTPException(status_code=400, detail="验证码无效或已过期，请重新发送")

    old_att = await _kv_incr_with_ttl(kv, f"emailchg:a:att:old:{uid}", _CODE_TTL)
    new_att = await _kv_incr_with_ttl(kv, f"emailchg:a:att:new:{uid}", _CODE_TTL)
    if old_att > _MAX_ATTEMPTS or new_att > _MAX_ATTEMPTS:
        await kv.delete(old_key, new_key,
                        f"emailchg:a:att:old:{uid}", f"emailchg:a:att:new:{uid}")
        raise HTTPException(status_code=400, detail="验证码无效或已过期，请重新发送")

    # ① 当前登录密码（二次身份确认）→ ② 旧邮箱码 → ③ 新邮箱码
    if not verify_password(req.current_password, u.password_hash):
        raise HTTPException(status_code=400, detail="当前密码不正确")
    old_data, new_data = json.loads(old_raw), json.loads(new_raw)
    if hashlib.sha256(req.old_code.encode()).hexdigest() != old_data["code"]:
        raise HTTPException(status_code=400, detail="原邮箱验证码无效或已过期")
    if hashlib.sha256(req.new_code.encode()).hexdigest() != new_data["code"]:
        raise HTTPException(status_code=400, detail="新邮箱验证码无效或已过期")

    new_email = new_data["email"]  # 以发码时登记的新邮箱为准（防参数篡改）
    dup = (await db.execute(
        select(User).where(User.email == new_email)
    )).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(status_code=400, detail="邮箱已被使用，请重新发起更换")

    old_email = u.email
    u.email = new_email
    await kv.delete(old_key, new_key, f"emailchg:a:att:old:{uid}",
                    f"emailchg:a:att:new:{uid}", f"emailchg:resend:{uid}")
    _audit(db, user, "email_change_normal", {
        "old_email": old_email, "new_email": new_email,
        "fingerprint": _fingerprint(request),
    }, get_client_ip(request))
    await db.commit()
    return {"ok": True, "message": "绑定邮箱已更换", "new_email": new_email}


# ---------- 路径B：旧邮箱失效（四项自助身份核验） ----------
@router.post(
    "/lost-old/verify",
    dependencies=[Depends(rate_limit("emailchg-verify", limit=5, window_seconds=3600))],
)
async def lost_old_verify(
    req: EmailChangeLostOldVerifyRequest,
    request: Request,
    user: dict = _WRITE_DEP,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """四项核验必须全部匹配数据库记录；任一不匹配统一模糊拒绝（不暴露哪个字段错）。"""
    _reject_break_glass(user)
    u = await _load_user(db, ctx_uid(user))
    await _ensure_no_pending_lock(db, u)

    kv = get_kv()
    lock_key, fail_key = f"emailchg:b:lock:{u.id}", f"emailchg:b:fail:{u.id}"
    if await kv.exists(lock_key):
        raise HTTPException(status_code=403, detail="核验尝试过于频繁，请一小时后再试")

    mismatch = []
    if not verify_password(req.current_password, u.password_hash):
        mismatch.append("current_password")
    if req.student_id.strip() != (u.student_id or ""):
        mismatch.append("student_id")
    if req.phone.strip() != (u.phone or ""):
        mismatch.append("phone")
    if req.real_name.strip() != (u.real_name or ""):
        mismatch.append("real_name")

    if mismatch:
        fails = await _kv_incr_with_ttl(kv, fail_key, _FAIL_TTL)
        if fails >= _FAIL_LIMIT:
            await kv.setex(lock_key, _FAIL_TTL, "1")
            await kv.delete(fail_key)
        _audit(db, user, "email_change_lost_old_verify", {
            "old_email": u.email, "result": "failed", "mismatch": mismatch,
            "fail_count": fails, "fingerprint": _fingerprint(request),
        }, get_client_ip(request))
        await db.commit()
        raise HTTPException(status_code=403, detail="身份核验未通过")

    await kv.delete(fail_key)
    await kv.setex(f"emailchg:b:pass:{u.id}", _CODE_TTL, json.dumps({"verified": True}))
    _audit(db, user, "email_change_lost_old_verify", {
        "old_email": u.email, "result": "passed", "fingerprint": _fingerprint(request),
    }, get_client_ip(request))
    await db.commit()
    return {"ok": True, "message": "身份核验通过，请继续验证新邮箱"}


@router.post(
    "/lost-old/send-code",
    dependencies=[Depends(rate_limit("emailchg-send", limit=5, window_seconds=3600))],
)
async def lost_old_send_code(
    req: EmailChangeLostOldSendCodeRequest,
    request: Request,
    user: dict = _WRITE_DEP,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """核验通过后仅向新邮箱发码（统一模糊前置：无通行令牌一律按核验未通过处理）。"""
    _reject_break_glass(user)
    u = await _load_user(db, ctx_uid(user))
    await _ensure_no_pending_lock(db, u)

    kv = get_kv()
    if not await kv.exists(f"emailchg:b:pass:{u.id}"):
        raise HTTPException(status_code=403, detail="身份核验未通过")
    if await kv.exists(f"emailchg:b:lock:{u.id}"):
        raise HTTPException(status_code=403, detail="核验尝试过于频繁，请一小时后再试")
    await _check_new_email(db, u, str(req.new_email))

    new_email = _norm(str(req.new_email))
    resend_key = f"emailchg:resend:{u.id}"
    if await kv.exists(resend_key):
        return {"ok": True, "message": "验证码发送间隔未到，请稍后查收"}
    await kv.setex(resend_key, _RESEND_INTERVAL, "1")

    code = _gen_code()
    await kv.setex(f"emailchg:b:new:{u.id}", _CODE_TTL, json.dumps(
        {"email": new_email, "code": hashlib.sha256(code.encode()).hexdigest()}))
    await kv.setex(f"emailchg:b:att:{u.id}", _CODE_TTL, "0")
    sent = await _mail_code(new_email, "GDUE-CA 更换绑定邮箱验证码（新邮箱确认）", code)

    _audit(db, user, "email_change_lost_old_send_code", {
        "old_email": u.email, "new_email": new_email,
        "sent": sent, "smtp": mailer_configured(), "fingerprint": _fingerprint(request),
    }, get_client_ip(request))
    await db.commit()
    return {"ok": True, "message": "验证码已发送至新邮箱，请查收"}


@router.post(
    "/lost-old/confirm",
    dependencies=[Depends(rate_limit("emailchg-confirm", limit=10, window_seconds=3600))],
)
async def lost_old_confirm(
    req: EmailChangeLostOldConfirmRequest,
    request: Request,
    user: dict = _WRITE_DEP,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """新邮箱验证码通过即换绑；通行令牌一次性消费；保留全部登录会话。"""
    _reject_break_glass(user)
    u = await _load_user(db, ctx_uid(user))
    await _ensure_no_pending_lock(db, u)

    kv = get_kv()
    pass_key, code_key, att_key = (
        f"emailchg:b:pass:{u.id}", f"emailchg:b:new:{u.id}", f"emailchg:b:att:{u.id}")
    if not await kv.exists(pass_key):
        raise HTTPException(status_code=403, detail="身份核验未通过")
    raw = await kv.get(code_key)
    if not raw:
        raise HTTPException(status_code=400, detail="验证码无效或已过期，请重新发送")

    attempts = await _kv_incr_with_ttl(kv, att_key, _CODE_TTL)
    if attempts > _MAX_ATTEMPTS:
        await kv.delete(code_key, att_key)
        raise HTTPException(status_code=400, detail="验证码无效或已过期，请重新发送")
    data = json.loads(raw)
    if hashlib.sha256(req.code.encode()).hexdigest() != data["code"]:
        raise HTTPException(status_code=400, detail="验证码无效或已过期")

    new_email = data["email"]  # 以发码时登记的新邮箱为准（防参数篡改）
    dup = (await db.execute(
        select(User).where(User.email == new_email)
    )).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(status_code=400, detail="邮箱已被使用，请重新发起更换")

    old_email = u.email
    u.email = new_email
    await kv.delete(pass_key, code_key, att_key, f"emailchg:b:fail:{u.id}",
                    f"emailchg:b:lock:{u.id}", f"emailchg:resend:{u.id}")
    _audit(db, user, "email_change_lost_old", {
        "old_email": old_email, "new_email": new_email,
        "fingerprint": _fingerprint(request),
    }, get_client_ip(request))
    await db.commit()
    return {"ok": True, "message": "绑定邮箱已更换", "new_email": new_email}


# ---------- 路径C：人工申请（用户端提交） ----------
@router.post(
    "/manual-request",
    dependencies=[Depends(rate_limit("emailchg-manual", limit=3, window_seconds=3600))],
)
async def submit_manual_request(
    req: EmailChangeManualRequestRequest,
    request: Request,
    user: dict = _WRITE_DEP,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """提交更改绑定邮箱人工申请（pending 期间自助入口全部禁用，由本前置锁强制）。"""
    _reject_break_glass(user)
    u = await _load_user(db, ctx_uid(user))
    await _ensure_no_pending_lock(db, u)
    await _check_new_email(db, u, str(req.new_email))

    row = EmailChangeRequest(
        user_id=u.id,
        old_email=u.email,
        new_email=_norm(str(req.new_email)),
        remark=(str(req.remark).strip() or None) if req.remark else None,
        status=EmailChangeStatus.PENDING,
        submit_ip=get_client_ip(request),
        fingerprint=_fingerprint(request),
    )
    db.add(row)
    await db.flush()
    _audit(db, user, "email_change_manual_submit", {
        "old_email": u.email, "new_email": row.new_email, "request_id": row.id,
        "fingerprint": row.fingerprint,
    }, get_client_ip(request))
    await db.commit()
    return {"ok": True, "message": "申请已提交，等待管理员审核",
            "request_id": row.id, "status": row.status.value}


# ---------- 后台审核（review.emails 权限） ----------
@router.get("/requests", response_model=list[EmailChangeRequestOut])
async def list_email_change_requests(
    status_filter: EmailChangeStatus | None = None,
    user: dict = Depends(require_permission("review.emails", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    stmt = (
        select(EmailChangeRequest, User.username)
        .join(User, EmailChangeRequest.user_id == User.id)
        .order_by(EmailChangeRequest.created_at.desc())
        .limit(200)
    )
    if status_filter is not None:
        stmt = stmt.where(EmailChangeRequest.status == status_filter)
    rows = (await db.execute(stmt)).all()
    out = []
    for row, username in rows:
        out.append(EmailChangeRequestOut.model_validate({**row.__dict__, "username": username}))
    return out


@router.post("/requests/{request_id}/approve")
async def approve_email_change_request(
    request_id: int,
    request: Request,
    user: dict = Depends(require_permission("review.emails", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """同意：仅打一次性豁免标记，绝不直接改邮箱；最终换绑由用户本人确认提交。"""
    row = await db.get(EmailChangeRequest, request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="申请不存在")
    if row.status != EmailChangeStatus.PENDING:
        raise HTTPException(status_code=409, detail="该申请已被处理")
    target = await db.get(User, row.user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="申请对应账号不存在")

    row.status = EmailChangeStatus.APPROVED
    row.reviewed_by = ctx_uid(user)
    row.reviewed_at = _now()
    # 同事务打一次性标记：用户端完成换绑的瞬间立即清除（一次性，禁止复用）
    target.allow_manual_email_switch = True
    # 站内私信通知申请人（同事务）
    await push_user_message(
        db, row.user_id,
        kind="email_change",
        title="更改绑定邮箱申请已审核通过",
        content="您的更改邮箱人工申请已审核通过，请前往账号设置-更换绑定邮箱完成操作。",
        link="/setting/security/email",
    )
    _audit(db, user, "email_change_manual_approve", {
        "old_email": row.old_email, "new_email": row.new_email,
        "request_id": row.id, "target_uid": row.user_id,
        "operator_uid": ctx_uid(user), "fingerprint": _fingerprint(request),
    }, get_client_ip(request))
    await db.commit()
    return {"ok": True, "message": "已同意申请，等待用户完成换绑"}


@router.post("/requests/{request_id}/reject")
async def reject_email_change_request(
    request_id: int,
    req: EmailChangeRejectRequest,
    request: Request,
    user: dict = Depends(require_permission("review.emails", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """驳回：理由必填非空；用户端展示理由并解除自助禁用。"""
    reason = str(req.reason).strip()
    if not reason:
        raise HTTPException(status_code=400, detail="驳回理由不能为空")
    row = await db.get(EmailChangeRequest, request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="申请不存在")
    if row.status != EmailChangeStatus.PENDING:
        raise HTTPException(status_code=409, detail="该申请已被处理")

    row.status = EmailChangeStatus.REJECTED
    row.reject_reason = reason
    row.reviewed_by = ctx_uid(user)
    row.reviewed_at = _now()
    # 站内私信通知申请人（同事务，含驳回理由）
    await push_user_message(
        db, row.user_id,
        kind="email_change",
        title="更改绑定邮箱申请已被驳回",
        content=f"您的更改邮箱人工申请已被驳回。驳回理由：{reason}",
        link="/setting/security/email",
    )
    _audit(db, user, "email_change_manual_reject", {
        "old_email": row.old_email, "new_email": row.new_email,
        "request_id": row.id, "target_uid": row.user_id, "reason": reason,
        "operator_uid": ctx_uid(user), "fingerprint": _fingerprint(request),
    }, get_client_ip(request))
    await db.commit()
    return {"ok": True, "message": "已驳回申请"}


# ---------- 人工审核豁免模式（一次性标记换绑） ----------
@router.post(
    "/exempt/confirm",
    dependencies=[Depends(rate_limit("emailchg-exempt", limit=5, window_seconds=3600))],
)
async def exempt_confirm(
    req: EmailChangeExemptConfirmRequest,
    request: Request,
    user: dict = _WRITE_DEP,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """跳过全部身份校验：仅凭一次性豁免标记换绑；成功瞬间同事务清除标记。"""
    _reject_break_glass(user)
    u = await _load_user(db, ctx_uid(user))
    if not u.allow_manual_email_switch:
        raise HTTPException(status_code=403, detail="当前账号没有管理员核准的换绑许可")
    await _check_new_email(db, u, str(req.new_email))

    new_email = _norm(str(req.new_email))
    old_email = u.email
    u.email = new_email
    u.allow_manual_email_switch = False  # 一次性标记用完即毁（同事务，禁止二次复用）
    # 站内私信通知换绑成功（同事务）
    await push_user_message(
        db, u.id,
        kind="email_change",
        title="绑定邮箱更换成功",
        content=f"您的账号绑定邮箱已成功由 {old_email} 变更为 {new_email}。",
    )
    _audit(db, user, "email_change_manual_approved", {
        "old_email": old_email, "new_email": new_email,
        "fingerprint": _fingerprint(request),
    }, get_client_ip(request))
    await db.commit()
    return {"ok": True, "message": "绑定邮箱已更换", "new_email": new_email}
