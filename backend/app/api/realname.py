"""实名验证接口：用户提交申请 + 管理员审核（通过 / 拒绝）。

规则：
- 已登录用户（含未实名的管理员级账号）均可提交；待审核期间不可重复提交
- 审核通过 → User.realname_verified=True + verified_at，并用申请信息回写
  User.student_id / real_name / phone（以审核通过的实名信息为准）
- 拒绝 → 记录原因，用户可修改后重新提交
- 未实名管理员级账号被 require_role 拦截后台业务接口（本模块显式放行），
  但 super_admin 永远豁免（避免审核死锁）
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.security import Role, require_role
from app.db.models import AuditLog, RealnameRequest, RealnameStatus, User
from app.db.session import get_db
from app.schemas.realname import (
    RealnameReject,
    RealnameRequestOut,
    RealnameStatusOut,
    RealnameSubmit,
)
from app.utils.crud import apply_eq, apply_search, paginate

router = APIRouter(prefix="/api/realname", tags=["realname"])
admin_router = APIRouter(prefix="/api/admin/realname", tags=["realname-admin"])

# 凭证图片限制：≤5MB，仅图片类型（与学生头像一致）
EVIDENCE_MAX_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _log(db: AsyncSession, uid: int | None, action: str, detail: str | None, ip: str | None):
    db.add(AuditLog(user_id=uid, action=action, detail=detail, ip=ip))


async def _out(db: AsyncSession, r: RealnameRequest) -> dict:
    data = RealnameRequestOut.model_validate(r).model_dump(mode="json")
    user = await db.get(User, r.user_id)
    if user:
        data["username"] = user.username
        data["user_realname_verified"] = user.realname_verified
    return data


# ==================== 用户接口 ====================

@router.get("/status", response_model=RealnameStatusOut)
async def my_realname_status(
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """当前用户的实名状态 + 最近一次申请。"""
    u = await db.get(User, int(user["user_id"]))
    latest = (await db.execute(
        select(RealnameRequest).where(RealnameRequest.user_id == u.id)
        .order_by(RealnameRequest.submitted_at.desc(), RealnameRequest.id.desc())
    )).scalars().first()
    return RealnameStatusOut(
        verified=u.realname_verified,
        verified_at=u.realname_verified_at,
        latest=RealnameRequestOut.model_validate(latest).model_dump(mode="json") if latest else None,
    )


@router.post("/submit", response_model=RealnameRequestOut, status_code=201)
async def submit_realname(
    req: RealnameSubmit,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """提交实名申请；待审核期间不可重复提交；通过后无需再提交。"""
    uid = int(user["user_id"])
    u = await db.get(User, uid)
    if u.realname_verified:
        raise HTTPException(status_code=400, detail="账号已完成实名验证")
    pending = (await db.execute(
        select(RealnameRequest).where(
            RealnameRequest.user_id == uid,
            RealnameRequest.status == RealnameStatus.PENDING,
        )
    )).scalar_one_or_none()
    if pending:
        raise HTTPException(status_code=400, detail="已有待审核的实名申请，请耐心等待")

    r = RealnameRequest(
        user_id=uid,
        student_id=req.student_id.strip(),
        real_name=req.real_name.strip(),
        phone=f"{req.phone_cc}{req.phone_number}",
        evidence_url=req.evidence_url,
    )
    db.add(r)
    u.realname_submitted_at = _now()
    _log(db, uid, "realname.submit", None, get_client_ip(request))
    await db.commit()
    await db.refresh(r)
    return await _out(db, r)


@router.post("/evidence")
async def upload_evidence(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(require_role(Role.MEMBER, allow_unverified_realname=True)),
    db: AsyncSession = Depends(get_db),
):
    """上传实名凭证图片（学生证 / 校园卡照片）：≤5MB，仅 JPEG/PNG/WEBP。"""
    data = await file.read()
    if len(data) > EVIDENCE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="凭证图片不能超过 5MB")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="仅支持 JPEG / PNG / WEBP 图片")

    from pathlib import Path
    import secrets as _secrets
    from PIL import Image
    import io

    # 无损压缩优化（保持 PNG/WEBP 无损、JPEG quality=85 重编码一次降低体积）
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[file.content_type]
    out_dir = Path("uploads/realname")
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{_secrets.token_hex(12)}.{ext}"
    try:
        img = Image.open(io.BytesIO(data))
        buf = io.BytesIO()
        if file.content_type == "image/jpeg":
            img.save(buf, format="JPEG", quality=85, optimize=True)
        else:
            img.save(buf, format=ext.upper(), optimize=True)
        payload = buf.getvalue()
    except Exception:
        payload = data  # 解析失败时按原样存储（前端预览已限定图片类型）
    (out_dir / filename).write_bytes(payload)
    return {"url": f"/uploads/realname/{filename}"}


# ==================== 管理接口 ====================

@admin_router.get("")
async def list_requests(
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    q: str | None = None,
    user: dict = Depends(require_permission("realname", "view")),
    db: AsyncSession = Depends(get_db),
):
    """实名申请列表：状态筛选（pending/approved/rejected）+ 用户名/学号/姓名搜索。"""
    stmt = select(RealnameRequest).order_by(
        RealnameRequest.submitted_at.desc(), RealnameRequest.id.desc()
    )
    if status:
        try:
            stmt = apply_eq(stmt, RealnameRequest.status, RealnameStatus(status))
        except ValueError:
            raise HTTPException(status_code=400, detail="无效的状态筛选值")
    stmt = apply_search(stmt, [RealnameRequest.student_id, RealnameRequest.real_name], q)
    result = await paginate(db, stmt, page, min(page_size, 100), out_model=None)
    items = [await _out(db, r) for r in result["items"]]
    result["items"] = items
    return result


@admin_router.post("/{request_id}/approve", response_model=RealnameRequestOut)
async def approve_request(
    request_id: int,
    request: Request,
    user: dict = Depends(require_permission("realname", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """通过实名申请：标记账号已实名并回写学号 / 真实姓名 / 手机号。"""
    r = await db.get(RealnameRequest, request_id)
    if not r:
        raise HTTPException(status_code=404, detail="申请不存在")
    if r.status != RealnameStatus.PENDING:
        raise HTTPException(status_code=400, detail="该申请已处理")
    u = await db.get(User, r.user_id)
    if not u:
        raise HTTPException(status_code=404, detail="申请者账号不存在")
    r.status = RealnameStatus.APPROVED
    r.reviewed_at = _now()
    r.reviewed_by = int(user["user_id"])
    u.realname_verified = True
    u.realname_verified_at = r.reviewed_at
    u.student_id = r.student_id
    u.real_name = r.real_name
    u.phone = r.phone
    _log(db, int(user["user_id"]), "realname.approve", f"user:{u.username}", get_client_ip(request))
    await db.commit()
    await db.refresh(r)
    return await _out(db, r)


@admin_router.post("/{request_id}/reject", response_model=RealnameRequestOut)
async def reject_request(
    request_id: int,
    req: RealnameReject,
    request: Request,
    user: dict = Depends(require_permission("realname", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """拒绝实名申请（记录原因，用户可修改后重新提交）。"""
    r = await db.get(RealnameRequest, request_id)
    if not r:
        raise HTTPException(status_code=404, detail="申请不存在")
    if r.status != RealnameStatus.PENDING:
        raise HTTPException(status_code=400, detail="该申请已处理")
    r.status = RealnameStatus.REJECTED
    r.note = req.note
    r.reviewed_at = _now()
    r.reviewed_by = int(user["user_id"])
    _log(db, int(user["user_id"]), "realname.reject", f"request:{r.id}", get_client_ip(request))
    await db.commit()
    await db.refresh(r)
    return await _out(db, r)
