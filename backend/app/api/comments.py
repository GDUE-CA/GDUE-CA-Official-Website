"""评论系统接口：公开列表/发表 + 管理列表/屏蔽/取消屏蔽/物理删除/全局开关。

- 双布尔软删除：is_deleted（用户自删）+ is_hidden（管理员屏蔽），两者独立；
- 管理员可执行物理 DELETE（确认后不可逆）；
- 完整 submit_ip 仅后台返回，公开接口只暴露属地（location_zh/en，国家/省份粒度）；
- 双开关：SystemSetting.comments_enabled 全局开关 + blog_posts.allow_comments 文章级开关；
- 评论专用限流：每 IP 每分钟最多 5 条（内存滑动窗口，全局限流之外的防刷兜底）。
"""
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.ip_intel import resolve_location_full
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.security import get_optional_user
from app.db.models import (
    AuditLog,
    BlogPost,
    BlogPostStatus,
    Comment,
    SystemSetting,
    User,
)
from app.db.session import get_db
from app.schemas.comments import (
    CommentAdminOut,
    CommentCreate,
    CommentPublic,
    CommentSettingsOut,
    CommentSettingsUpdate,
)
from app.utils.crud import apply_search, paginate
from app.utils.device import device_category

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


def _log(db: AsyncSession, ctx_or_uid, action: str, target: str | None, ip: str | None):
    """统一审计写入：ctx_or_uid 支持 ctx dict（自动区分 Break-Glass）/ int / None。"""
    log_action(db, ctx_or_uid, action, target=target, ip=ip)


def _status_label(c: Comment) -> str:
    """计算状态标签 key（前端 i18n 渲染）。"""
    if c.is_deleted and c.is_hidden:
        return "user_deleted_and_admin_hidden"
    if c.is_deleted:
        return "user_deleted"
    if c.is_hidden:
        return "admin_hidden"
    return "normal"


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
    """后台评论输出：含状态标签 + 所属文章标题。"""
    out = CommentAdminOut.model_validate(c).model_dump(mode="json")
    out["status_label"] = _status_label(c)
    post = await db.get(BlogPost, c.post_id)
    out["post_title"] = post.title if post else None
    return out


# ==================== 公开接口 ====================

@public_router.get("/{post_id}/comments", response_model=dict)
async def list_public_comments(
    post_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """公开评论列表：仅 is_deleted=false AND is_hidden=false，按时间正序；allowed 表示当前是否可提交。"""
    post = await _published_post_or_404(db, post_id)
    allowed = await _comments_allowed(db, post)
    stmt = select(Comment).where(
        Comment.post_id == post_id,
        Comment.is_deleted.is_(False),
        Comment.is_hidden.is_(False),
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
    db: AsyncSession = Depends(get_db, scope="function"),
    viewer: dict | None = Depends(get_optional_user),
):
    """发表评论：双开关关闭时 403；内容为纯文本，前端转义渲染。

    登录用户（非 Break-Glass）关联账号：昵称取账号显示名（忽略表单昵称，防冒名），
    公开展示头像与主页链接；匿名访客沿用表单昵称。
    """
    post = await _published_post_or_404(db, post_id)
    if not await _comments_allowed(db, post):
        raise HTTPException(status_code=403, detail="评论功能已关闭")
    ip = get_client_ip(request)
    _check_comment_rate(ip)
    zh, en = await resolve_location_full(ip)
    author: User | None = None
    if viewer and not viewer.get("break_glass") and viewer.get("user_id"):
        author = await db.get(User, int(viewer["user_id"]))
    c = Comment(
        post_id=post_id,
        user_id=author.id if author else None,
        author_name=(author.display_name or author.username)[:64] if author else req.author_name,
        device=device_category(request.headers.get("user-agent")),
        content=req.content,
        submit_ip=ip,
        location_zh=zh,
        location_en=en,
        is_deleted=False,
        is_hidden=False,
    )
    db.add(c)
    # 同步冗余计数：BlogPost.comment_count（含已删除+已屏蔽的总行数）
    post.comment_count = (post.comment_count or 0) + 1
    await db.commit()
    await db.refresh(c)
    return c


# ==================== 管理接口 ====================

@admin_router.get("/settings", response_model=CommentSettingsOut)
async def admin_get_comment_settings(
    user: dict = Depends(require_permission("comments", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """评论全局开关读取。"""
    s = await db.get(SystemSetting, 1)
    return CommentSettingsOut(comments_enabled=bool(s and s.comments_enabled))


@admin_router.put("/settings", response_model=CommentSettingsOut)
async def admin_update_comment_settings(
    req: CommentSettingsUpdate,
    request: Request,
    user: dict = Depends(require_permission("comments", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """评论全局开关联动所有文章（文章级开关叠加生效）。"""
    s = await db.get(SystemSetting, 1)
    if not s:
        s = SystemSetting(id=1)
        db.add(s)
    s.comments_enabled = req.comments_enabled
    _log(db, user, "comment.settings",
         f"comments_enabled={req.comments_enabled}", get_client_ip(request))
    await db.commit()
    return CommentSettingsOut(comments_enabled=s.comments_enabled)


@admin_router.get("", response_model=dict)
async def admin_list_comments(
    is_deleted: bool | None = Query(default=None),
    is_hidden: bool | None = Query(default=None),
    post_id: int | None = Query(default=None),
    q: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(require_permission("comments", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """后台评论列表：全部记录（含用户删/管理员屏蔽）+ 完整 IP + 属地 + 文章标题 + 状态标签。"""
    stmt = select(Comment)
    if is_deleted is not None:
        stmt = stmt.where(Comment.is_deleted.is_(is_deleted))
    if is_hidden is not None:
        stmt = stmt.where(Comment.is_hidden.is_(is_hidden))
    if post_id:
        stmt = stmt.where(Comment.post_id == post_id)
    stmt = apply_search(stmt, [Comment.author_name, Comment.content], q)
    stmt = stmt.order_by(Comment.created_at.desc())
    result = await paginate(db, stmt, page, page_size, out_model=CommentAdminOut)
    # 回填状态标签 + 所属文章标题
    ids = {it["post_id"] for it in result["items"]}
    titles: dict[int, str] = {}
    if ids:
        rows = (await db.execute(
            select(BlogPost.id, BlogPost.title).where(BlogPost.id.in_(ids))
        )).all()
        titles = {r[0]: r[1] for r in rows}
    for it in result["items"]:
        it["status_label"] = _status_label_from_dict(it)
        it["post_title"] = titles.get(it["post_id"])
    return result


def _status_label_from_dict(it: dict) -> str:
    """从 dict 计算 status_label（用于 paginate 后的批量回填）。"""
    d = it.get("is_deleted", False)
    h = it.get("is_hidden", False)
    if d and h:
        return "user_deleted_and_admin_hidden"
    if d:
        return "user_deleted"
    if h:
        return "admin_hidden"
    return "normal"


@admin_router.post("/{comment_id}/hide", response_model=dict)
async def admin_hide_comment(
    comment_id: int,
    request: Request,
    user: dict = Depends(require_permission("comments", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """管理员屏蔽：is_hidden=true（软删除，后台留存）。"""
    c = await db.get(Comment, comment_id)
    if not c:
        raise HTTPException(status_code=404, detail="评论不存在")
    if c.is_hidden:
        raise HTTPException(status_code=400, detail="该评论已被管理员屏蔽")
    c.is_hidden = True
    _log(db, user, "comment.hide", f"comment:{c.id}", get_client_ip(request))
    await db.commit()
    await db.refresh(c)
    return await _admin_out(db, c)


@admin_router.post("/{comment_id}/unhide", response_model=dict)
async def admin_unhide_comment(
    comment_id: int,
    request: Request,
    user: dict = Depends(require_permission("comments", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """取消管理员屏蔽：is_hidden=false（不影响用户自删标记 is_deleted）。"""
    c = await db.get(Comment, comment_id)
    if not c:
        raise HTTPException(status_code=404, detail="评论不存在")
    if not c.is_hidden:
        raise HTTPException(status_code=400, detail="该评论未被管理员屏蔽")
    c.is_hidden = False
    _log(db, user, "comment.unhide", f"comment:{c.id}", get_client_ip(request))
    await db.commit()
    await db.refresh(c)
    return await _admin_out(db, c)


@admin_router.delete("/{comment_id}", response_model=dict)
async def admin_delete_comment(
    comment_id: int,
    request: Request,
    user: dict = Depends(require_permission("comments", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """管理员物理删除：确认后 DELETE 数据库行（不可逆）。"""
    c = await db.get(Comment, comment_id)
    if not c:
        raise HTTPException(status_code=404, detail="评论不存在")
    post_id = c.post_id
    # 审计日志在物理删除前写入（保留记录）
    _log(db, user, "comment.delete", f"comment:{c.id}", get_client_ip(request))
    await db.delete(c)
    # 同步冗余计数：BlogPost.comment_count 减 1（不低于 0）
    post = await db.get(BlogPost, post_id)
    if post:
        post.comment_count = max(0, (post.comment_count or 0) - 1)
    await db.commit()
    return {"deleted": True, "comment_id": comment_id}
