"""V0.6.1 需求5：举报接口。

- 公开提交：POST /api/reports（匿名或登录均可；IP 维度限流 5 分钟 3 条；
  同举报人对同一资源存在 pending 记录时拒绝重复提交）；
- 管理端：GET /api/admin/reports（按类型/状态/时间筛选）、GET /{id}（详情 +
  被举报内容预览）、POST /{id}/review（通过/驳回 + 处罚动作）、通知开关读写。
  仅具备 review.reports 权限的管理员可访问，举报人信息不对被举报对象暴露。
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.rate_limit import rate_limit
from app.core.security import get_optional_user
from app.core.user_message import push_user_message
from app.db.models import (
    BlogPost,
    BlogPostStatus,
    Memo,
    Report,
    ReportStatus,
    ReportType,
    SystemSetting,
    User,
)
from app.db.session import get_db
from app.schemas.report import (
    ReportCreate,
    ReportListOut,
    ReportNotifySetting,
    ReportOut,
    ReportReporterOut,
    ReportReviewIn,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])
admin_router = APIRouter(prefix="/api/admin/reports", tags=["reports-admin"])

# 允许的处罚动作（按举报类型约束）
_USER_PENALTIES = {"warning", "hide_profile", "ban_temp"}
_CONTENT_PENALTIES = {"hide_content"}
_MAX_PREVIEW = 200


def _now() -> datetime:
    """当前 naive UTC（与 SQLite 存储一致）。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _get_settings(db: AsyncSession) -> SystemSetting:
    rec = await db.get(SystemSetting, 1)
    if not rec:
        rec = SystemSetting(id=1)
        db.add(rec)
        await db.flush()
    return rec


async def _validate_target(db: AsyncSession, rtype: ReportType, target_id: int):
    """校验被举报资源存在并返回 (预览文本, 被举报用户 id, 被举报用户名)。"""
    if rtype == ReportType.USER:
        u = await db.get(User, target_id)
        if not u or u.is_deleted:
            raise HTTPException(status_code=404, detail="被举报用户不存在")
        return (u.display_name or u.username), u.id, u.username
    if rtype == ReportType.BLOG:
        post = await db.get(BlogPost, target_id)
        if not post:
            raise HTTPException(status_code=404, detail="被举报博客不存在")
        return post.title, post.author_id, None
    memo = await db.get(Memo, target_id)
    if not memo:
        raise HTTPException(status_code=404, detail="被举报说说不存在")
    preview = (memo.content_md or "").strip()[:_MAX_PREVIEW]
    return preview, memo.author_id, None


def _viewer_uid(viewer_ctx: dict | None) -> int | None:
    """从可选认证上下文提取登录用户 ID；匿名 / BG → None。"""
    if not viewer_ctx or viewer_ctx.get("break_glass"):
        return None
    raw = viewer_ctx.get("user_id")
    return int(raw) if raw else None


# ---------- 公开提交 ----------
@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("report.submit", limit=3, window_seconds=300))],
)
async def submit_report(
    req: ReportCreate,
    request: Request,
    viewer_ctx: dict | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """提交举报。匿名与登录均可；同资源 pending 去重 + IP 限流防刷。"""
    uid = _viewer_uid(viewer_ctx)
    ip = get_client_ip(request)

    # 解析被举报资源 ID：user 类型可用 username（前台寻址），blog/post 用 id
    if req.report_type == ReportType.USER:
        if req.target_username:
            u = (await db.execute(select(User).where(
                User.username == req.target_username, User.is_deleted.is_(False)
            ))).scalar_one_or_none()
            if not u:
                raise HTTPException(status_code=404, detail="被举报用户不存在")
            target_id = u.id
        elif req.target_id:
            await _validate_target(db, req.report_type, req.target_id)
            target_id = req.target_id
        else:
            raise HTTPException(status_code=400, detail="缺少被举报对象")
    else:
        if req.target_id is None:
            raise HTTPException(status_code=400, detail="缺少被举报对象")
        await _validate_target(db, req.report_type, req.target_id)
        target_id = req.target_id

    # 重复提交拦截：同一举报人（登录）/ 同一 IP（匿名）对同一资源仅允许一条 pending
    cond = [
        Report.report_type == req.report_type,
        Report.target_id == target_id,
        Report.status == ReportStatus.PENDING,
    ]
    cond.append(Report.reporter_user_id == uid if uid else Report.reporter_ip == ip)
    dup = (await db.execute(select(Report.id).where(*cond).limit(1))).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(status_code=400, detail="该资源已存在待审核举报，请勿重复提交")

    rep = Report(
        report_type=req.report_type,
        target_id=target_id,
        reporter_user_id=uid,
        reporter_ip=ip,
        reason=req.reason,
        status=ReportStatus.PENDING,
    )
    db.add(rep)
    await db.flush()
    log_action(db, uid, "report.submit", f"{req.report_type.value}:{target_id}", ip)
    await db.commit()
    return {"ok": True, "id": rep.id}


# ---------- 管理端：通知开关（静态路由需在 /{report_id} 之前注册） ----------
@admin_router.get("/notify-setting", response_model=ReportNotifySetting)
async def get_notify_setting(
    user: dict = Depends(require_permission("review.reports", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    rec = await _get_settings(db)
    return ReportNotifySetting(notify_enabled=rec.report_notify_enabled)


@admin_router.put("/notify-setting", response_model=ReportNotifySetting)
async def update_notify_setting(
    body: ReportNotifySetting,
    request: Request,
    user: dict = Depends(require_permission("review.reports", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    rec = await _get_settings(db)
    rec.report_notify_enabled = body.notify_enabled
    log_action(db, user, "report.notify_setting",
               f"enabled={body.notify_enabled}", get_client_ip(request))
    await db.commit()
    return ReportNotifySetting(notify_enabled=rec.report_notify_enabled)


# ---------- 管理端：列表 ----------
async def _resolve_labels(db: AsyncSession, reports: list[Report]) -> dict[int, tuple[str | None, str | None]]:
    """批量解析被举报资源预览文本与对象用户名（按类型分组 IN 查询，避免 N+1）。"""
    out: dict[int, tuple[str | None, str | None]] = {}
    user_ids = [r.target_id for r in reports if r.report_type == ReportType.USER]
    blog_ids = [r.target_id for r in reports if r.report_type == ReportType.BLOG]
    memo_ids = [r.target_id for r in reports if r.report_type == ReportType.POST]

    users: dict[int, User] = {}
    if user_ids:
        for u in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all():
            users[u.id] = u
    blogs: dict[int, BlogPost] = {}
    if blog_ids:
        for b in (await db.execute(select(BlogPost).where(BlogPost.id.in_(blog_ids)))).scalars().all():
            blogs[b.id] = b
    memos: dict[int, Memo] = {}
    if memo_ids:
        for m in (await db.execute(select(Memo).where(Memo.id.in_(memo_ids)))).scalars().all():
            memos[m.id] = m

    for r in reports:
        if r.report_type == ReportType.USER:
            u = users.get(r.target_id)
            out[r.id] = ((u.display_name or u.username) if u else None, u.username if u else None)
        elif r.report_type == ReportType.BLOG:
            b = blogs.get(r.target_id)
            out[r.id] = (b.title if b else None, None)
        else:
            m = memos.get(r.target_id)
            out[r.id] = (((m.content_md or "").strip()[:_MAX_PREVIEW]) if m else None, None)
    return out


async def _build_out(db: AsyncSession, reports: list[Report]) -> list[ReportOut]:
    labels = await _resolve_labels(db, reports)
    reporter_ids = [r.reporter_user_id for r in reports if r.reporter_user_id]
    reporters: dict[int, User] = {}
    if reporter_ids:
        for u in (await db.execute(select(User).where(User.id.in_(reporter_ids)))).scalars().all():
            reporters[u.id] = u
    items: list[ReportOut] = []
    for r in reports:
        label, target_username = labels.get(r.id, (None, None))
        ru = reporters.get(r.reporter_user_id) if r.reporter_user_id else None
        items.append(ReportOut(
            id=r.id,
            report_type=r.report_type,
            target_id=r.target_id,
            target_label=label,
            target_username=target_username,
            reporter=ReportReporterOut(
                user_id=ru.id, username=ru.username, display_name=ru.display_name
            ) if ru else None,
            reporter_ip=r.reporter_ip,
            reason=r.reason,
            status=r.status,
            admin_comment=r.admin_comment,
            penalty=r.penalty,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at,
        ))
    return items


@admin_router.get("", response_model=ReportListOut)
async def list_reports(
    report_type: ReportType | None = None,
    report_status: ReportStatus | None = Query(default=None, alias="status"),
    start: datetime | None = None,
    end: datetime | None = None,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    user: dict = Depends(require_permission("review.reports", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """举报列表（管理端）：按类型 / 状态 / 提交时间区间筛选。"""
    cond = []
    if report_type is not None:
        cond.append(Report.report_type == report_type)
    if report_status is not None:
        cond.append(Report.status == report_status)
    if start is not None:
        cond.append(Report.created_at >= start.replace(tzinfo=None))
    if end is not None:
        cond.append(Report.created_at <= end.replace(tzinfo=None))

    total = int((await db.execute(
        select(func.count()).select_from(Report).where(*cond)
    )).scalar_one())
    stmt = (
        select(Report).where(*cond)
        .order_by(Report.created_at.desc())
        .offset((page - 1) * per_page).limit(per_page)
    )
    reports = list((await db.execute(stmt)).scalars().all())
    return ReportListOut(items=await _build_out(db, reports), total=total)


@admin_router.get("/{report_id}", response_model=ReportOut)
async def get_report(
    report_id: int,
    user: dict = Depends(require_permission("review.reports", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """举报详情：含被举报原始内容预览 + 举报理由。"""
    rep = await db.get(Report, report_id)
    if not rep:
        raise HTTPException(status_code=404, detail="举报记录不存在")
    items = await _build_out(db, [rep])
    return items[0]


@admin_router.post("/{report_id}/review")
async def review_report(
    report_id: int,
    body: ReportReviewIn,
    request: Request,
    user: dict = Depends(require_permission("review.reports", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """审核举报：驳回 / 通过（可执行处罚动作），并可站内信通知相关方。"""
    rep = await db.get(Report, report_id)
    if not rep:
        raise HTTPException(status_code=404, detail="举报记录不存在")
    if rep.status != ReportStatus.PENDING:
        raise HTTPException(status_code=400, detail="该举报已审核完成")

    settings = await _get_settings(db)
    notify = settings.report_notify_enabled
    ip = get_client_ip(request)

    if body.status == "rejected":
        rep.status = ReportStatus.REJECTED
        rep.admin_comment = body.admin_comment
        rep.reviewed_at = _now()
        rep.reviewed_by = user.get("user_id") if not user.get("break_glass") else None
        if notify and rep.reporter_user_id:
            await push_user_message(
                db, rep.reporter_user_id,
                title="举报处理结果",
                content="你提交的举报经审核未予通过。",
                kind="report",
            )
        log_action(db, user, "report.reject", f"report:{report_id}", ip)
        await db.commit()
        return {"ok": True, "status": rep.status.value}

    # ----- 通过：校验处罚动作并执行 -----
    penalty = body.penalty
    if rep.report_type == ReportType.USER:
        if penalty is None or penalty not in _USER_PENALTIES:
            raise HTTPException(status_code=400, detail="用户类举报需选择有效处罚动作")
    else:
        if penalty is None or penalty not in _CONTENT_PENALTIES:
            raise HTTPException(status_code=400, detail="内容类举报需选择「隐藏内容」处罚")

    reported_uid: int | None = None
    if rep.report_type == ReportType.USER:
        target = await db.get(User, rep.target_id)
        if not target or target.is_deleted:
            raise HTTPException(status_code=404, detail="被举报用户不存在")
        reported_uid = target.id
        if penalty == "hide_profile":
            target.profile_hidden = True
        elif penalty == "ban_temp":
            days = body.ban_days or 7
            target.ban_until = _now() + timedelta(days=days)
    elif rep.report_type == ReportType.BLOG:
        post = await db.get(BlogPost, rep.target_id)
        if not post:
            raise HTTPException(status_code=404, detail="被举报博客不存在")
        reported_uid = post.author_id
        post.status = BlogPostStatus.ARCHIVED
    else:
        memo = await db.get(Memo, rep.target_id)
        if not memo:
            raise HTTPException(status_code=404, detail="被举报说说不存在")
        reported_uid = memo.author_id
        memo.admin_removed = True
        memo.admin_removed_reason = body.admin_comment or "举报审核通过"
        memo.admin_removed_at = _now()
        memo.admin_removed_by = user.get("user_id") if not user.get("break_glass") else None

    rep.status = ReportStatus.APPROVED
    rep.penalty = penalty
    rep.admin_comment = body.admin_comment
    rep.reviewed_at = _now()
    rep.reviewed_by = user.get("user_id") if not user.get("break_glass") else None

    if notify:
        if rep.reporter_user_id:
            await push_user_message(
                db, rep.reporter_user_id,
                title="举报处理结果",
                content="你提交的举报经审核已通过，感谢你的反馈。",
                kind="report",
            )
        if reported_uid:
            await push_user_message(
                db, reported_uid,
                title="账号处罚通知",
                content="你的账号 / 内容因违反社区规范被处理，如有疑问请联系管理员。",
                kind="report",
            )
    log_action(db, user, "report.approve", f"report:{report_id} penalty:{penalty}", ip)
    await db.commit()
    return {"ok": True, "status": rep.status.value}
