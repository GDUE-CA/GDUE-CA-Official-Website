"""项目展示 CMS 接口（新壳：ok() / BizException）。

公开接口：仅返回已发布项目（列表按 year 降序 + id 升序，与原 markdown 排序语义一致），
lang 传入时标题/短描述自动翻译（正文 Markdown 长文不做机器翻译）。
管理接口：项目完整 CRUD（草稿/发布/下架），权限模块 projects。
"""
import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.bizcode import BizCode
from app.core.exceptions import BizException
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.responses import ok
from app.db.models import AuditLog, Project, ProjectStatus
from app.db.session import get_db
from app.schemas.project import ProjectBriefOut, ProjectCreate, ProjectOut, ProjectUpdate
from app.utils.crud import apply_search, paginate
from app.utils.translator import translate_obj_fields

# 公开接口（无鉴权）
public_router = APIRouter(prefix="/api/projects", tags=["projects-public"])
# 管理接口（需 projects 权限）
admin_router = APIRouter(prefix="/api/admin/projects", tags=["projects-admin"])

_SLUG_RESERVED_PREFIX = "project-"


def _log(db: AsyncSession, ctx_or_uid, action: str, target: str | None, ip: str | None):
    """统一审计写入：ctx_or_uid 支持 ctx dict（自动区分 Break-Glass）/ int / None。"""
    log_action(db, ctx_or_uid, action, target=target, ip=ip)


async def _ensure_slug_unique(db, slug: str, exclude_id: int | None = None) -> None:
    stmt = select(Project).where(Project.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(Project.id != exclude_id)
    exists = (await db.execute(stmt)).scalar_one_or_none()
    if exists:
        raise BizException(BizCode.CONFLICT, reason="slug 已被其他项目使用")


async def _get_or_404(db, project_id: int) -> Project:
    p = await db.get(Project, project_id)
    if not p:
        raise BizException(BizCode.NOT_FOUND, reason="项目不存在")
    return p


# ==================== 公开接口 ====================

@public_router.get("")
async def list_public_projects(
    tech: str | None = Query(default=None, max_length=64, description="按技术栈筛选"),
    year: int | None = Query(default=None, ge=1900, le=3000, description="按年份筛选"),
    q: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    lang: str | None = Query(default=None, max_length=16, description="显示语言；传入时标题/短描述自动翻译（失败回退原文）"),
    db = Depends(get_db, scope="function"),
):
    """公开已发布项目列表：year 降序 + id 升序；技术栈/年份筛选 + 搜索。"""
    stmt = select(Project).where(Project.status == ProjectStatus.PUBLISHED)
    if tech:
        # tech_stack 为 JSON 数组：contains 命中数组元素
        stmt = stmt.where(Project.tech_stack.contains([tech]))
    if year is not None:
        stmt = stmt.where(Project.year == year)
    stmt = apply_search(stmt, [Project.title, Project.description], q)
    stmt = stmt.order_by(Project.year.desc(), Project.id.asc())
    data = await paginate(db, stmt, page, page_size)
    # Out 副本上做翻译（禁止传 ORM 实体，避免译文随统一 commit 污染源数据），再序列化
    outs = [ProjectBriefOut.model_validate(r) for r in data["items"]]
    if lang:
        await translate_obj_fields(db, outs, ("title", "description"), lang)
    data["items"] = [o.model_dump(mode="json") for o in outs]
    return ok(data=data)


@public_router.get("/{slug}")
async def get_public_project(
    slug: str,
    lang: str | None = Query(default=None, max_length=16),
    db = Depends(get_db, scope="function"),
):
    """公开单个项目（含原始 Markdown 正文）；非已发布状态一律 404。"""
    p = (await db.execute(
        select(Project).where(Project.slug == slug)
    )).scalar_one_or_none()
    if not p or p.status != ProjectStatus.PUBLISHED:
        raise BizException(BizCode.NOT_FOUND, reason="项目不存在")
    out_obj = ProjectOut.model_validate(p)
    if lang:
        await translate_obj_fields(db, [out_obj], ("title", "description"), lang)
    return ok(data=out_obj.model_dump(mode="json"))


# ==================== 管理接口 ====================

@admin_router.get("")
async def admin_list_projects(
    status: str | None = Query(default=None, description="draft/published/archived"),
    q: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(require_permission("projects", "view")),
    db = Depends(get_db, scope="function"),
):
    stmt = select(Project)
    if status:
        try:
            stmt = stmt.where(Project.status == ProjectStatus(status))
        except ValueError:
            raise BizException(BizCode.VALIDATION_FAILED, reason="未知状态筛选值")
    stmt = apply_search(stmt, [Project.title, Project.description], q)
    stmt = stmt.order_by(Project.updated_at.desc())
    data = await paginate(db, stmt, page, page_size, out_model=ProjectBriefOut)
    return ok(data=data)


@admin_router.get("/{project_id}")
async def admin_get_project(
    project_id: int,
    user: dict = Depends(require_permission("projects", "view")),
    db = Depends(get_db, scope="function"),
):
    p = await _get_or_404(db, project_id)
    return ok(data=ProjectOut.model_validate(p).model_dump(mode="json"))


@admin_router.post("")
async def admin_create_project(
    req: ProjectCreate,
    request: Request,
    user: dict = Depends(require_permission("projects", "manage")),
    db = Depends(get_db, scope="function"),
):
    if req.slug:
        await _ensure_slug_unique(db, req.slug)
    p = Project(
        title=req.title,
        slug=req.slug or uuid.uuid4().hex,   # 未指定 slug 时先占位，flush 后回填 project-{id}
        description=req.description,
        tech_stack=req.tech_stack,
        github_url=req.github_url,
        demo_url=req.demo_url,
        screenshots=req.screenshots,
        year=req.year,
        leader=req.leader,
        content_md=req.content_md,
        created_by=ctx_uid(user),
    )
    p.status = ProjectStatus(req.status)
    db.add(p)
    await db.flush()
    if not req.slug:
        # 自动 slug = project-{自增 id}，天然唯一；不能用 _ensure_slug_unique
        # （autoflush 会把新值写库后命中自身）
        p.slug = f"{_SLUG_RESERVED_PREFIX}{p.id}"
    _log(db, user, "project.create", f"project:{p.id}", get_client_ip(request))
    await db.commit()
    await db.refresh(p)
    return ok(data=ProjectOut.model_validate(p).model_dump(mode="json"))


@admin_router.put("/{project_id}")
async def admin_update_project(
    project_id: int,
    req: ProjectUpdate,
    request: Request,
    user: dict = Depends(require_permission("projects", "manage")),
    db = Depends(get_db, scope="function"),
):
    p = await _get_or_404(db, project_id)
    data = req.model_dump(exclude_unset=True)

    if "slug" in data and data["slug"] and data["slug"] != p.slug:
        await _ensure_slug_unique(db, data["slug"], exclude_id=p.id)
    if "status" in data and data["status"]:
        p.status = ProjectStatus(data["status"])
        data.pop("status")

    for k in ("title", "slug", "description", "tech_stack", "github_url",
              "demo_url", "screenshots", "year", "leader", "content_md"):
        if k in data:
            setattr(p, k, data[k])

    _log(db, user, "project.update", f"project:{p.id}", get_client_ip(request))
    await db.commit()
    await db.refresh(p)
    return ok(data=ProjectOut.model_validate(p).model_dump(mode="json"))


@admin_router.delete("/{project_id}")
async def admin_delete_project(
    project_id: int,
    request: Request,
    user: dict = Depends(require_permission("projects", "manage")),
    db = Depends(get_db, scope="function"),
):
    p = await _get_or_404(db, project_id)
    _log(db, user, "project.delete", f"project:{p.id}", get_client_ip(request))
    await db.delete(p)
    await db.commit()
    return ok(data=None)
