"""系统基础数据 API（Module D-0）：学院 / 年级 / 专业 / 班级。

- 对外公开列表：仅返回启用（is_disabled=0）条目，按 sort_order, id 排序；前端表单下拉数据源。
- 后台管理：新增 / 编辑 / 拖拽排序 / 启用禁用；**不提供物理删除**（存在业务引用禁止删除，
  统一用 is_disabled 软禁用，历史数据保留）。
- 权限：后台走 settings 模块（后台 → 系统设置 → 学院/年级/专业/班级管理）。
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.security import get_optional_user
from app.db.models import SysClass, SysCollege, SysGrade, SysMajor
from app.db.session import get_db
from app.schemas.sys_data import (
    SysClassAdminOut,
    SysClassCreate,
    SysClassOut,
    SysClassUpdate,
    SysCollegeAdminOut,
    SysCollegeCreate,
    SysCollegeOut,
    SysCollegeUpdate,
    SysEnabledRequest,
    SysGradeAdminOut,
    SysGradeCreate,
    SysGradeOut,
    SysGradeUpdate,
    SysMajorAdminOut,
    SysMajorCreate,
    SysMajorOut,
    SysMajorUpdate,
    SysSortRequest,
)

public_router = APIRouter(prefix="/api/sys", tags=["sys-data-public"])
admin_router = APIRouter(prefix="/api/admin/sys", tags=["sys-data-admin"])


# ============================================================
# 公开列表（前端表单下拉数据源；仅启用条目）
# ============================================================
@public_router.get("/college/list", response_model=list[SysCollegeOut])
async def list_public_colleges(
    db: AsyncSession = Depends(get_db, scope="function"),
    _: dict | None = Depends(get_optional_user),
):
    """获取全部启用的学院。"""
    rows = (await db.execute(
        select(SysCollege)
        .where(SysCollege.is_disabled.is_(False))
        .order_by(SysCollege.sort_order, SysCollege.id)
    )).scalars().all()
    return rows


@public_router.get("/grade/list", response_model=list[SysGradeOut])
async def list_public_grades(
    db: AsyncSession = Depends(get_db, scope="function"),
    _: dict | None = Depends(get_optional_user),
):
    """获取全部启用的年级。"""
    rows = (await db.execute(
        select(SysGrade)
        .where(SysGrade.is_disabled.is_(False))
        .order_by(SysGrade.sort_order, SysGrade.id)
    )).scalars().all()
    return rows


@public_router.get("/major/list", response_model=list[SysMajorOut])
async def list_public_majors(
    college_id: int = Query(...),
    db: AsyncSession = Depends(get_db, scope="function"),
    _: dict | None = Depends(get_optional_user),
):
    """根据学院 ID 获取该学院下启用的专业。"""
    rows = (await db.execute(
        select(SysMajor)
        .where(
            SysMajor.college_id == college_id,
            SysMajor.is_disabled.is_(False),
        )
        .order_by(SysMajor.sort_order, SysMajor.id)
    )).scalars().all()
    return rows


@public_router.get("/class/list", response_model=list[SysClassOut])
async def list_public_classes(
    college_id: int = Query(...),
    grade_id: int = Query(...),
    major_id: int = Query(...),
    db: AsyncSession = Depends(get_db, scope="function"),
    _: dict | None = Depends(get_optional_user),
):
    """获取对应班级（学校身份验证页面使用；三条件联动过滤）。"""
    rows = (await db.execute(
        select(SysClass)
        .where(
            SysClass.college_id == college_id,
            SysClass.grade_id == grade_id,
            SysClass.major_id == major_id,
            SysClass.is_disabled.is_(False),
        )
        .order_by(SysClass.sort_order, SysClass.id)
    )).scalars().all()
    return rows


# ============================================================
# 后台管理共用辅助
# ============================================================
async def _log(db: AsyncSession, user: dict, action: str, target: str | None,
               request: Request):
    log_action(db, user, action, target=target, ip=get_client_ip(request))


async def _get_or_404(db: AsyncSession, model, item_id: int):
    row = await db.get(model, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="记录不存在")
    return row


async def _validate_major_college(db: AsyncSession, college_id: int):
    college = await db.get(SysCollege, college_id)
    if not college:
        raise HTTPException(status_code=400, detail="所属学院不存在")
    return college


# ---------- 学院 ----------
@admin_router.get("/college/list", response_model=list[SysCollegeAdminOut])
async def admin_list_colleges(
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "view")),
):
    """后台学院列表（含禁用条目）。"""
    rows = (await db.execute(
        select(SysCollege).order_by(SysCollege.sort_order, SysCollege.id)
    )).scalars().all()
    return rows


@admin_router.post("/college", response_model=SysCollegeAdminOut, status_code=201)
async def admin_create_college(
    req: SysCollegeCreate,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    row = SysCollege(**req.model_dump())
    db.add(row)
    await _log(db, user, "sysdata.college.create", None, request)
    await db.commit()
    await db.refresh(row)
    return row


@admin_router.put("/college/{item_id}", response_model=SysCollegeAdminOut)
async def admin_update_college(
    item_id: int,
    req: SysCollegeUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    row = await _get_or_404(db, SysCollege, item_id)
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await _log(db, user, "sysdata.college.update", f"college:{item_id}", request)
    await db.commit()
    await db.refresh(row)
    return row


@admin_router.patch("/college/{item_id}/enabled", response_model=SysCollegeAdminOut)
async def admin_toggle_college(
    item_id: int,
    req: SysEnabledRequest,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    row = await _get_or_404(db, SysCollege, item_id)
    row.is_disabled = req.is_disabled
    await _log(db, user, "sysdata.college.toggle", f"college:{item_id} disabled={req.is_disabled}", request)
    await db.commit()
    await db.refresh(row)
    return row


@admin_router.patch("/college/sort", response_model=list[SysCollegeAdminOut])
async def admin_sort_colleges(
    req: SysSortRequest,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    for i, rid in enumerate(req.ids):
        row = await db.get(SysCollege, rid)
        if row:
            row.sort_order = i
    await _log(db, user, "sysdata.college.sort", ",".join(map(str, req.ids)), request)
    await db.commit()
    rows = (await db.execute(
        select(SysCollege).order_by(SysCollege.sort_order, SysCollege.id)
    )).scalars().all()
    return rows


# ---------- 年级 ----------
@admin_router.get("/grade/list", response_model=list[SysGradeAdminOut])
async def admin_list_grades(
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "view")),
):
    rows = (await db.execute(
        select(SysGrade).order_by(SysGrade.sort_order, SysGrade.id)
    )).scalars().all()
    return rows


@admin_router.post("/grade", response_model=SysGradeAdminOut, status_code=201)
async def admin_create_grade(
    req: SysGradeCreate,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    row = SysGrade(**req.model_dump())
    db.add(row)
    await _log(db, user, "sysdata.grade.create", None, request)
    await db.commit()
    await db.refresh(row)
    return row


@admin_router.put("/grade/{item_id}", response_model=SysGradeAdminOut)
async def admin_update_grade(
    item_id: int,
    req: SysGradeUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    row = await _get_or_404(db, SysGrade, item_id)
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await _log(db, user, "sysdata.grade.update", f"grade:{item_id}", request)
    await db.commit()
    await db.refresh(row)
    return row


@admin_router.patch("/grade/{item_id}/enabled", response_model=SysGradeAdminOut)
async def admin_toggle_grade(
    item_id: int,
    req: SysEnabledRequest,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    row = await _get_or_404(db, SysGrade, item_id)
    row.is_disabled = req.is_disabled
    await _log(db, user, "sysdata.grade.toggle", f"grade:{item_id} disabled={req.is_disabled}", request)
    await db.commit()
    await db.refresh(row)
    return row


@admin_router.patch("/grade/sort", response_model=list[SysGradeAdminOut])
async def admin_sort_grades(
    req: SysSortRequest,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    for i, rid in enumerate(req.ids):
        row = await db.get(SysGrade, rid)
        if row:
            row.sort_order = i
    await _log(db, user, "sysdata.grade.sort", ",".join(map(str, req.ids)), request)
    await db.commit()
    rows = (await db.execute(
        select(SysGrade).order_by(SysGrade.sort_order, SysGrade.id)
    )).scalars().all()
    return rows


# ---------- 专业 ----------
@admin_router.get("/major/list", response_model=list[SysMajorAdminOut])
async def admin_list_majors(
    college_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "view")),
):
    stmt = select(SysMajor)
    if college_id is not None:
        stmt = stmt.where(SysMajor.college_id == college_id)
    rows = (await db.execute(
        stmt.order_by(SysMajor.sort_order, SysMajor.id)
    )).scalars().all()
    return rows


@admin_router.post("/major", response_model=SysMajorAdminOut, status_code=201)
async def admin_create_major(
    req: SysMajorCreate,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    await _validate_major_college(db, req.college_id)
    row = SysMajor(**req.model_dump())
    db.add(row)
    await _log(db, user, "sysdata.major.create", None, request)
    await db.commit()
    await db.refresh(row)
    return row


@admin_router.put("/major/{item_id}", response_model=SysMajorAdminOut)
async def admin_update_major(
    item_id: int,
    req: SysMajorUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    row = await _get_or_404(db, SysMajor, item_id)
    data = req.model_dump(exclude_unset=True)
    if "college_id" in data and data["college_id"] is not None:
        await _validate_major_college(db, data["college_id"])
    for k, v in data.items():
        setattr(row, k, v)
    await _log(db, user, "sysdata.major.update", f"major:{item_id}", request)
    await db.commit()
    await db.refresh(row)
    return row


@admin_router.patch("/major/{item_id}/enabled", response_model=SysMajorAdminOut)
async def admin_toggle_major(
    item_id: int,
    req: SysEnabledRequest,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    row = await _get_or_404(db, SysMajor, item_id)
    row.is_disabled = req.is_disabled
    await _log(db, user, "sysdata.major.toggle", f"major:{item_id} disabled={req.is_disabled}", request)
    await db.commit()
    await db.refresh(row)
    return row


@admin_router.patch("/major/sort", response_model=list[SysMajorAdminOut])
async def admin_sort_majors(
    req: SysSortRequest,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    for i, rid in enumerate(req.ids):
        row = await db.get(SysMajor, rid)
        if row:
            row.sort_order = i
    await _log(db, user, "sysdata.major.sort", ",".join(map(str, req.ids)), request)
    await db.commit()
    rows = (await db.execute(
        select(SysMajor).order_by(SysMajor.sort_order, SysMajor.id)
    )).scalars().all()
    return rows


# ---------- 班级 ----------
@admin_router.get("/class/list", response_model=list[SysClassAdminOut])
async def admin_list_classes(
    college_id: int | None = Query(default=None),
    grade_id: int | None = Query(default=None),
    major_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "view")),
):
    stmt = select(SysClass)
    if college_id is not None:
        stmt = stmt.where(SysClass.college_id == college_id)
    if grade_id is not None:
        stmt = stmt.where(SysClass.grade_id == grade_id)
    if major_id is not None:
        stmt = stmt.where(SysClass.major_id == major_id)
    rows = (await db.execute(
        stmt.order_by(SysClass.sort_order, SysClass.id)
    )).scalars().all()
    return rows


@admin_router.post("/class", response_model=SysClassAdminOut, status_code=201)
async def admin_create_class(
    req: SysClassCreate,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    row = SysClass(**req.model_dump())
    db.add(row)
    await _log(db, user, "sysdata.class.create", None, request)
    await db.commit()
    await db.refresh(row)
    return row


@admin_router.put("/class/{item_id}", response_model=SysClassAdminOut)
async def admin_update_class(
    item_id: int,
    req: SysClassUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    row = await _get_or_404(db, SysClass, item_id)
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await _log(db, user, "sysdata.class.update", f"class:{item_id}", request)
    await db.commit()
    await db.refresh(row)
    return row


@admin_router.patch("/class/{item_id}/enabled", response_model=SysClassAdminOut)
async def admin_toggle_class(
    item_id: int,
    req: SysEnabledRequest,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    row = await _get_or_404(db, SysClass, item_id)
    row.is_disabled = req.is_disabled
    await _log(db, user, "sysdata.class.toggle", f"class:{item_id} disabled={req.is_disabled}", request)
    await db.commit()
    await db.refresh(row)
    return row


@admin_router.patch("/class/sort", response_model=list[SysClassAdminOut])
async def admin_sort_classes(
    req: SysSortRequest,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: dict = Depends(require_permission("settings", "manage")),
):
    for i, rid in enumerate(req.ids):
        row = await db.get(SysClass, rid)
        if row:
            row.sort_order = i
    await _log(db, user, "sysdata.class.sort", ",".join(map(str, req.ids)), request)
    await db.commit()
    rows = (await db.execute(
        select(SysClass).order_by(SysClass.sort_order, SysClass.id)
    )).scalars().all()
    return rows
