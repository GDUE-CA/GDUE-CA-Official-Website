"""评论系统接口：公开列表/发表 + 管理列表/下架/恢复/全局开关。

- 软删除：评论任何状态都不物理删除（仅文章删除时随父级联清理）；
- 完整 submit_ip 仅后台返回，公开接口只暴露属地（location_zh/en，国家/省份粒度）；
- 双开关：SystemSetting.comments_enabled 全局开关 + blog_posts.allow_comments 文章级开关；
- 评论专用限流：每 IP 每分钟最多 5 条（内存滑动窗口，全局限流之外的防刷兜底）。
"""
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ip_location import resolve_location
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.db.models import (
    AuditLog,
    BlogPost,
    BlogPostStatus,
    Comment,
    CommentStatus,
    SystemSetting,
)
from app.db.session import get_db
from app.schemas.comments import (
    CommentAdminOut,
    CommentCreate,
    CommentPublic,
    CommentSettingsOut,
    CommentSettingsUpdate,
)
from app.utils.crud import apply_eq, apply_search, paginate

# 公开接口（无鉴权，挂在 /api/blog 下）
public_router = APIRouter(prefix="/api/blog", tags=["comments-public"])
# 管理接口（需 comments 权限）
admin_router = APIRouter(prefix="/api/admin/comments", tags=["comments-admin"])

# ---------- 评论专用限流（每 IP 每分钟最多 5 条） ----------
_COMMENT_RATE_LIMIT = 5
_COMMENT_RATE_WINDOW = 60.0
_comment_rate: dict[str, deque[float]] = defaultdict(deque)


def _check_comment_rate(ip: str | None) -> None:
    """评论提交防刷：内存滑动窗口，重启即清零；超限 429。"""
    if not ip:
        return
    now = time.monotonic()
    # 键数量兜底清理，防长期运行内存膨胀
    if len(_comment_rate) > 10000:
        stale = [k for k, v in _comment_rate.items()
                 if not v or now - v[-1] > _COMMENT_RATE_WINDOW]
        for k in stale:
            _comment_rate.pop(k, None)
    dq = _comment_rate[ip]
    while dq and now - dq[0] > _COMMENT_RATE_WINDOW:
        dq.popleft()
    if len(dq) >= _COMMENT_RATE_LIMIT:
        raise HTTPException(status_code=429, detail="评论提交过于频繁，请稍后再试")
    dq.append(now)


def _naive_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _log(db: AsyncSession, uid: int, action: str, target: str | None, ip: str | None):
    db.add(AuditLog(user_id=uid, action=action, target=target, ip=ip))


async def _comments_allowed(db: AsyncSession, post: BlogPost) -> bool:
    """双开关判定：全局 comments_enabled + 文章级 allow_comments。"""
    s = await db.get(SystemSetting, 1)
    return bool(s and s.comments_enabled and post.allow_comments)


async def _published_post_or_404(db: AsyncSession, post_id: int) -> BlogPost:
    """评论只挂在已发布文章上；其余一律 404（不暴露草稿存在性）。"""
    p = await db.get(BlogPost, post_id)
    if not p or p.status != BlogPostStatus.PUBLISHED:
        raise HTTPException(status_code=404, detail="文章不存在")
    return p


async def _admin_out(db: AsyncSession, c: Comment) -> dict:
    """后台评论输出：附带所属文章标题。"""
    out = CommentAdminOut.model_validate(c).model_dump(mode="json")
    post = await db.get(BlogPost, c.post_id)
    out["post_title"] = post.title if post else None
    return out


# ==================== 公开接口 ====================

@public_router.get("/{post_id}/comments", response_model=dict)
async def list_public_comments(
    post_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """公开评论列表：仅 visible，按时间正序（对话式）；allowed 表示当前是否可提交。"""
    post = await _published_post_or_404(db, post_id)
    allowed = await _comments_allowed(db, post)
    stmt = select(Comment).where(
        Comment.post_id == post_id,
        Comment.status == CommentStatus.VISIBLE,
    ).order_by(Comment.created_at.asc(), Comment.id.asc())
    result = await paginate(db, stmt, page, page_size, out_model=CommentPublic)
    result["allowed"] = allowed
    return result


@public_router.post(
    "/{post_id}/comments",
    response_model=CommentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_public_comment(
    post_id: int,
    req: CommentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """访客发表评论：双开关关闭时 403；内容为纯文本，前端转义渲染。"""
    post = await _published_post_or_404(db, post_id)
    if not await _comments_allowed(db, post):
        raise HTTPException(status_code=403, detail="评论功能已关闭")
    ip = get_client_ip(request)
    _check_comment_rate(ip)
    zh, en = resolve_location(ip)
    c = Comment(
        post_id=post_id,
        author_name=req.author_name,
        content=req.content,
        submit_ip=ip,
        location_zh=zh,
        location_en=en,
        status=CommentStatus.VISIBLE,
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


# ==================== 管理接口 ====================

@admin_router.get("/settings", response_model=CommentSettingsOut)
async def admin_get_comment_settings(
    user: dict = Depends(require_permission("comments", "view")),
    db: AsyncSession = Depends(get_db),
):
    """评论全局开关读取。"""
    s = await db.get(SystemSetting, 1)
    return CommentSettingsOut(comments_enabled=bool(s and s.comments_enabled))


@admin_router.put("/settings", response_model=CommentSettingsOut)
async def admin_update_comment_settings(
    req: CommentSettingsUpdate,
    request: Request,
    user: dict = Depends(require_permission("comments", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """评论全局开关联动所有文章（文章级开关叠加生效）。"""
    s = await db.get(SystemSetting, 1)
    if not s:
        s = SystemSetting(id=1)
        db.add(s)
    s.comments_enabled = req.comments_enabled
    _log(db, int(user["user_id"]), "comment.settings",
         f"comments_enabled={req.comments_enabled}", get_client_ip(request))
    await db.commit()
    return CommentSettingsOut(comments_enabled=s.comments_enabled)


@admin_router.get("", response_model=dict)
async def admin_list_comments(
    status_filter: Literal["visible", "user_deleted", "admin_removed"] | None = Query(
        default=None, alias="status"
    ),
    post_id: int | None = Query(default=None),
    q: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(require_permission("comments", "view")),
    db: AsyncSession = Depends(get_db),
):
    """后台评论列表：全部状态 + 完整 IP + 属地 + 文章标题；软删除永不出库。"""
    stmt = select(Comment)
    if status_filter:
        stmt = apply_eq(stmt, Comment.status, CommentStatus(status_filter))
    if post_id:
        stmt = stmt.where(Comment.post_id == post_id)
    stmt = apply_search(stmt, [Comment.author_name, Comment.content], q)
    stmt = stmt.order_by(Comment.created_at.desc())
    result = await paginate(db, stmt, page, page_size, out_model=CommentAdminOut)
    # 回填所属文章标题（一批查询，避免 N+1）
    ids = {it["post_id"] for it in result["items"]}
    if ids:
        rows = (await db.execute(
            select(BlogPost.id, BlogPost.title).where(BlogPost.id.in_(ids))
        )).all()
        titles = {r[0]: r[1] for r in rows}
        for it in result["items"]:
            it["post_title"] = titles.get(it["post_id"])
    return result


@admin_router.post("/{comment_id}/remove", response_model=dict)
async def admin_remove_comment(
    comment_id: int,
    request: Request,
    user: dict = Depends(require_permission("comments", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """管理员下架：status=admin_removed，软删除不物理删除。"""
    c = await db.get(Comment, comment_id)
    if not c:
        raise HTTPException(status_code=404, detail="评论不存在")
    if c.status == CommentStatus.ADMIN_REMOVED:
        raise HTTPException(status_code=400, detail="该评论已是下架状态")
    c.status = CommentStatus.ADMIN_REMOVED
    c.deleted_at = _naive_utc_now()
    _log(db, int(user["user_id"]), "comment.remove", f"comment:{c.id}",
         get_client_ip(request))
    await db.commit()
    await db.refresh(c)
    return await _admin_out(db, c)


@admin_router.post("/{comment_id}/restore", response_model=dict)
async def admin_restore_comment(
    comment_id: int,
    request: Request,
    user: dict = Depends(require_permission("comments", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """恢复展示：status 回到 visible，清空 deleted_at。"""
    c = await db.get(Comment, comment_id)
    if not c:
        raise HTTPException(status_code=404, detail="评论不存在")
    if c.status == CommentStatus.VISIBLE:
        raise HTTPException(status_code=400, detail="该评论已是展示状态")
    c.status = CommentStatus.VISIBLE
    c.deleted_at = None
    _log(db, int(user["user_id"]), "comment.restore", f"comment:{c.id}",
         get_client_ip(request))
    await db.commit()
    await db.refresh(c)
    return await _admin_out(db, c)
