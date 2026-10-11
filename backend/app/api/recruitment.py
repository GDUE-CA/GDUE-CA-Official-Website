"""招新信息 CMS + 社团报名数据查询/导出接口。

招新报名数据复用 Registration(registration_type=CLUB)，本模块只管理招新信息内容
与报名数据的查询/导出，不在招新信息中冗余存储报名数据。
"""
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.db.models import AuditLog, RecruitmentInfo, Registration, RegistrationStatus, RegistrationType
from app.db.session import get_db
from app.schemas.recruitment import RecruitmentInfoCreate, RecruitmentInfoOut, RecruitmentInfoUpdate
from app.schemas.register import RegistrationOut
from app.utils.crud import apply_eq, apply_search, paginate
from app.utils.export import to_csv, to_xlsx

# 公开接口
public_router = APIRouter(prefix="/api/recruitment", tags=["recruitment-public"])
# 管理接口
admin_router = APIRouter(prefix="/api/admin/recruitment", tags=["recruitment-admin"])


def _log(db: AsyncSession, uid: int, action: str, target: str | None, ip: str | None):
    db.add(AuditLog(user_id=uid, action=action, target=target, ip=ip))


def _is_in_effect(r: RecruitmentInfo, now: datetime) -> bool:
    if r.start_at is not None and now < r.start_at:
        return False
    if r.end_at is not None and now > r.end_at:
        return False
    return True


# ---------- 公开：招新信息列表 ----------
@public_router.get("", response_model=list[RecruitmentInfoOut])
async def list_public_recruitment(
    db: AsyncSession = Depends(get_db),
):
    """公开：仅返回已启用 + 时间生效中的招新信息。"""
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    stmt = select(RecruitmentInfo).where(RecruitmentInfo.enabled.is_(True))
    stmt = stmt.where(
        ((RecruitmentInfo.start_at.is_(None)) | (RecruitmentInfo.start_at <= now_naive))
        & ((RecruitmentInfo.end_at.is_(None)) | (RecruitmentInfo.end_at >= now_naive))
    )
    stmt = stmt.order_by(RecruitmentInfo.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


# ---------- 管理：招新信息分页列表 ----------
@admin_router.get("/infos", response_model=dict)
async def admin_list_recruitment_infos(
    enabled: bool | None = Query(default=None),
    q: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(require_permission("recruitment", "view")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(RecruitmentInfo)
    if enabled is not None:
        stmt = apply_eq(stmt, RecruitmentInfo.enabled, enabled)
    stmt = apply_search(stmt, [RecruitmentInfo.title, RecruitmentInfo.target_dept], q)
    stmt = stmt.order_by(RecruitmentInfo.created_at.desc())
    return await paginate(db, stmt, page, page_size, out_model=RecruitmentInfoOut)


# ---------- 管理：招新信息单条 ----------
@admin_router.get("/infos/{rid}", response_model=RecruitmentInfoOut)
async def admin_get_recruitment_info(
    rid: int,
    user: dict = Depends(require_permission("recruitment", "view")),
    db: AsyncSession = Depends(get_db),
):
    r = await db.get(RecruitmentInfo, rid)
    if not r:
        raise HTTPException(status_code=404, detail="招新信息不存在")
    return r


# ---------- 管理：招新信息创建 ----------
@admin_router.post("/infos", response_model=RecruitmentInfoOut, status_code=status.HTTP_201_CREATED)
async def admin_create_recruitment_info(
    req: RecruitmentInfoCreate,
    request: Request,
    user: dict = Depends(require_permission("recruitment", "manage")),
    db: AsyncSession = Depends(get_db),
):
    if req.start_at and req.end_at and req.start_at >= req.end_at:
        raise HTTPException(status_code=400, detail="开始时间必须早于结束时间")
    r = RecruitmentInfo(**req.model_dump())
    db.add(r)
    _log(db, int(user["user_id"]), "recruitment.create", None, get_client_ip(request))
    await db.commit()
    await db.refresh(r)
    return r


# ---------- 管理：招新信息更新 ----------
@admin_router.put("/infos/{rid}", response_model=RecruitmentInfoOut)
async def admin_update_recruitment_info(
    rid: int,
    req: RecruitmentInfoUpdate,
    request: Request,
    user: dict = Depends(require_permission("recruitment", "manage")),
    db: AsyncSession = Depends(get_db),
):
    r = await db.get(RecruitmentInfo, rid)
    if not r:
        raise HTTPException(status_code=404, detail="招新信息不存在")
    data = req.model_dump(exclude_unset=True)
    new_start = data.get("start_at", r.start_at)
    new_end = data.get("end_at", r.end_at)
    if new_start and new_end and new_start >= new_end:
        raise HTTPException(status_code=400, detail="开始时间必须早于结束时间")
    for k, v in data.items():
        setattr(r, k, v)
    _log(db, int(user["user_id"]), "recruitment.update", f"recruitment:{rid}", get_client_ip(request))
    await db.commit()
    await db.refresh(r)
    return r


# ---------- 管理：招新信息删除 ----------
@admin_router.delete("/infos/{rid}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_recruitment_info(
    rid: int,
    request: Request,
    user: dict = Depends(require_permission("recruitment", "manage")),
    db: AsyncSession = Depends(get_db),
):
    r = await db.get(RecruitmentInfo, rid)
    if not r:
        raise HTTPException(status_code=404, detail="招新信息不存在")
    await db.delete(r)
    _log(db, int(user["user_id"]), "recruitment.delete", f"recruitment:{rid}", get_client_ip(request))
    await db.commit()


# ---------- 管理：社团报名数据列表（复用 Registration, registration_type=CLUB） ----------
@admin_router.get("/registrations", response_model=dict)
async def admin_list_club_registrations(
    status_filter: Literal["pending", "approved", "rejected", "checked_in"] | None = Query(default=None),
    position: str | None = Query(default=None, max_length=64),
    q: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(require_permission("recruitment", "view")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Registration).where(Registration.registration_type == RegistrationType.CLUB)
    if status_filter:
        stmt = apply_eq(stmt, Registration.status, RegistrationStatus(status_filter))
    if position:
        stmt = stmt.where(Registration.position == position)
    stmt = apply_search(stmt, [Registration.name, Registration.student_id, Registration.college], q)
    stmt = stmt.order_by(Registration.submitted_at.desc())
    return await paginate(db, stmt, page, page_size, out_model=RegistrationOut)


# ---------- 管理：社团报名数据导出 CSV/XLSX ----------
@admin_router.get("/registrations/export")
async def admin_export_club_registrations(
    format: Literal["csv", "xlsx"] = Query(default="csv"),
    status_filter: Literal["pending", "approved", "rejected", "checked_in"] | None = Query(default=None),
    position: str | None = Query(default=None, max_length=64),
    q: str | None = Query(default=None, max_length=64),
    user: dict = Depends(require_permission("recruitment", "view")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Registration).where(Registration.registration_type == RegistrationType.CLUB)
    if status_filter:
        stmt = stmt.where(Registration.status == RegistrationStatus(status_filter))
    if position:
        stmt = stmt.where(Registration.position == position)
    if q:
        from sqlalchemy import or_
        pattern = f"%{q}%"
        stmt = stmt.where(or_(
            Registration.name.ilike(pattern, escape="\\"),
            Registration.student_id.ilike(pattern, escape="\\"),
            Registration.college.ilike(pattern, escape="\\"),
        ))
    stmt = stmt.order_by(Registration.submitted_at.desc())
    rows = (await db.execute(stmt)).scalars().all()

    headers = [
        ("姓名", "name"),
        ("学号", "student_id"),
        ("学院", "college"),
        ("专业", "major"),
        ("区号", "phone_cc"),
        ("手机号", "phone_number"),
        ("邮箱", "email"),
        ("意向部门", "position"),
        ("状态", "status"),
        ("备注", "remark"),
        ("提交时间", "submitted_at"),
        ("提交IP", "submit_ip"),
    ]
    if format == "xlsx":
        data = to_xlsx(rows, headers, text_columns={"student_id", "phone_number"},
                       sheet_title="社团报名记录")
        return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": 'attachment; filename="club_registrations.xlsx"'})
    data = to_csv(rows, headers, free_text_keys={"name", "college", "major", "email", "remark"})
    return Response(content=data, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="club_registrations.csv"'})
