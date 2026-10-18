"""博客 CMS 接口：文章 + 标签 + 内嵌图片上传。

公开接口：仅返回已发布文章（定时到点惰性转 published），支持标签筛选与分页；
正文返回原始 Markdown + 经 nh3 消毒的预渲染 HTML。
管理接口：文章完整 CRUD（草稿/发布/定时/下架）、标签 CRUD、图片上传
（仅无损压缩至原体积 80% 以内，禁止有损重压），权限模块 blog / blog_tags。
"""
import io
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import nh3
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from markdown_it import MarkdownIt
from PIL import Image
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ctx_uid, log_action
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.security import get_optional_user
from app.db.models import (
    AuditLog,
    BlogPost,
    BlogPostStatus,
    BlogPostTag,
    BlogTag,
    MediaCategory,
    MediaFile,
)
from app.db.session import get_db
from app.schemas.blog import (
    BlogMetricOut,
    BlogPostBriefOut,
    BlogPostCreate,
    BlogPostOut,
    BlogPostUpdate,
    BlogTagCreate,
    BlogTagOut,
    BlogTagUpdate,
    BlogUploadOut,
)
from app.utils.crud import apply_eq, apply_search, paginate
from app.utils.translator import translate_obj_fields

# 公开接口（无鉴权）
public_router = APIRouter(prefix="/api/blog", tags=["blog-public"])
# 管理接口（需 blog / blog_tags 权限）
admin_router = APIRouter(prefix="/api/admin/blog", tags=["blog-admin"])

BLOG_IMAGE_DIR = Path("uploads/blog")
BLOG_IMAGE_MAX_SIZE = 5 * 1024 * 1024  # 5MB 上传上限

# Markdown → HTML（commonmark + GFM 表格/删除线），原始 HTML 经 nh3 消毒后再输出
_md = MarkdownIt().enable(["table", "strikethrough"])

# nh3 白名单：博客渲染所需的安全标签 / 属性（其余一律剔除）
_NH3_TAGS = {
    "a", "abbr", "b", "blockquote", "br", "caption", "code", "del", "div",
    "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr",
    "i", "img", "ins", "kbd", "li", "mark", "ol", "p", "pre", "q", "s",
    "span", "strong", "sub", "sup", "table", "tbody", "td", "th", "thead",
    "tr", "u", "ul",
}
_NH3_ATTRS = {
    "a": {"href", "title", "target"},
    "abbr": {"title"},
    "code": {"class"},
    "div": {"class"},
    "img": {"src", "alt", "title", "width", "height", "loading"},
    "pre": {"class"},
    "span": {"class"},
    "td": {"align"},
    "th": {"align"},
}


def _log(db: AsyncSession, ctx_or_uid, action: str, target: str | None, ip: str | None):
    """统一审计写入：ctx_or_uid 支持 ctx dict（自动区分 Break-Glass）/ int / None。"""
    log_action(db, ctx_or_uid, action, target=target, ip=ip)


def _render_html(md_text: str) -> str:
    """Markdown 渲染 + nh3 消毒（仅允许安全标签/属性，剔除脚本与事件属性）。"""
    return nh3.clean(
        _md.render(md_text),
        tags=_NH3_TAGS,
        attributes=_NH3_ATTRS,
        url_schemes={"http", "https", "mailto"},
    )


def _naive_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _auto_publish_scheduled(db: AsyncSession) -> None:
    """惰性定时发布：scheduled_at ≤ now 的定时文章转为已发布。

    在公开/管理列表与详情读取时调用，到点后首次访问即生效，无需后台进程。
    """
    now = _naive_utc_now()
    rows = (await db.execute(
        select(BlogPost).where(
            BlogPost.status == BlogPostStatus.SCHEDULED,
            BlogPost.scheduled_at.is_not(None),
            BlogPost.scheduled_at <= now,
        )
    )).scalars().all()
    if not rows:
        return
    for p in rows:
        p.status = BlogPostStatus.PUBLISHED
        p.published_at = now
    await db.commit()


async def _load_tags_or_400(db: AsyncSession, tag_ids: list[int]) -> list[BlogTag]:
    """按 ID 集合加载标签，不存在时 400。"""
    if not tag_ids:
        return []
    tags = (await db.execute(
        select(BlogTag).where(BlogTag.id.in_(tag_ids))
    )).scalars().all()
    if len(tags) != len(set(tag_ids)):
        raise HTTPException(status_code=400, detail="包含不存在的标签")
    return list(tags)


def _check_status_transition(new_status: str, scheduled_at: datetime | None) -> BlogPostStatus:
    """发布/定时状态校验：定时发布必须提供晚于当前的时间。"""
    st = BlogPostStatus(new_status)
    if st == BlogPostStatus.SCHEDULED:
        if scheduled_at is None:
            raise HTTPException(status_code=400, detail="定时发布必须填写定时发布时间")
        if scheduled_at <= _naive_utc_now():
            raise HTTPException(status_code=400, detail="定时发布时间必须晚于当前时间")
    return st


async def _ensure_slug_unique(db: AsyncSession, slug: str, exclude_id: int | None = None) -> None:
    stmt = select(BlogPost).where(BlogPost.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(BlogPost.id != exclude_id)
    exists = (await db.execute(stmt)).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=400, detail="slug 已被其他文章使用")


# ==================== 公开接口 ====================

async def _published_post_by_slug_or_404(db: AsyncSession, slug: str) -> BlogPost:
    """按 slug 取已发布文章；草稿/归档一律 404（不暴露存在性）。"""
    await _auto_publish_scheduled(db)
    p = (await db.execute(
        select(BlogPost).where(BlogPost.slug == slug)
    )).scalar_one_or_none()
    if not p or p.status != BlogPostStatus.PUBLISHED:
        raise HTTPException(status_code=404, detail="文章不存在")
    return p


def _metric_out(p: BlogPost) -> dict:
    """统一返回 4 项计数（避免重复 model_dump）。"""
    return {
        "like_count": p.like_count or 0,
        "comment_count": p.comment_count or 0,
        "share_count": p.share_count or 0,
        "favourite_count": p.favourite_count or 0,
    }


@public_router.get("/tags", response_model=list[BlogTagOut])
async def list_public_tags(
    lang: str | None = Query(default=None, max_length=16, description="显示语言；传入时标签名自动翻译"),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """公开标签列表（前端按标签筛选文章）。"""
    await _auto_publish_scheduled(db)
    result = await db.execute(select(BlogTag).order_by(BlogTag.id.asc()))
    outs = [BlogTagOut.model_validate(t) for t in result.scalars().all()]
    if lang:
        await translate_obj_fields(db, outs, ("name",), lang)
    return outs


@public_router.get("", response_model=dict)
async def list_public_posts(
    tag: str | None = Query(default=None, max_length=128, description="标签 slug"),
    q: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    lang: str | None = Query(default=None, max_length=16, description="显示语言；传入时标题/摘要自动翻译（缓存加速，失败回退原文）"),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """公开已发布文章列表：published_at 降序，支持标签筛选 + 标题/摘要搜索。

    正文为 Markdown 长文，不做机器翻译（避免破坏代码块/格式），仅翻译标题与摘要。
    """
    await _auto_publish_scheduled(db)
    stmt = select(BlogPost).where(BlogPost.status == BlogPostStatus.PUBLISHED)
    if tag:
        stmt = stmt.join(BlogPostTag, BlogPostTag.post_id == BlogPost.id).join(
            BlogTag, BlogTag.id == BlogPostTag.tag_id
        ).where(BlogTag.slug == tag)
    stmt = apply_search(stmt, [BlogPost.title, BlogPost.excerpt], q)
    stmt = stmt.order_by(BlogPost.published_at.desc())
    data = await paginate(db, stmt, page, page_size, out_model=BlogPostBriefOut)
    if lang and data.get("items"):
        await translate_obj_fields(db, data["items"], ("title", "excerpt"), lang)
    return data


@public_router.get("/{slug}", response_model=BlogPostOut)
async def get_public_post(
    slug: str,
    lang: str | None = Query(default=None, max_length=16, description="显示语言；传入时标题/摘要自动翻译"),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """公开单篇文章（含消毒 HTML）；非已发布状态一律 404。

    正文为 Markdown 长文，不做机器翻译（避免破坏代码块/格式），仅翻译标题与摘要。
    """
    p = await _published_post_by_slug_or_404(db, slug)
    # 翻译 Out 副本而非 ORM 实体，避免译文随 get_db 统一 commit 污染源数据
    out_obj = BlogPostOut.model_validate(p)
    if lang:
        await translate_obj_fields(db, [out_obj], ("title", "excerpt"), lang)
    out = out_obj.model_dump(mode="json")
    out["content_html"] = _render_html(p.content_md)
    return out


# ---------- 博客指标：点赞 / 分享 / 收藏（冗余计数器，仅计数不存身份） ----------

@public_router.post("/{slug}/share", response_model=BlogMetricOut)
async def share_post(
    slug: str,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """分享计数：无鉴权，每次调用 share_count += 1。

    仅记录触发次数（复制链接 / 唤起系统分享弹窗均调用此接口）；
    不存储分享者身份隐私。
    """
    p = await _published_post_by_slug_or_404(db, slug)
    p.share_count = (p.share_count or 0) + 1
    await db.commit()
    await db.refresh(p)
    return _metric_out(p)


@public_router.post("/{slug}/like", response_model=BlogMetricOut)
async def like_post(
    slug: str,
    user: dict | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """点赞：需登录，like_count += 1。"""
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    p = await _published_post_by_slug_or_404(db, slug)
    p.like_count = (p.like_count or 0) + 1
    await db.commit()
    await db.refresh(p)
    return _metric_out(p)


@public_router.post("/{slug}/unlike", response_model=BlogMetricOut)
async def unlike_post(
    slug: str,
    user: dict | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """取消点赞：需登录，like_count = max(0, -1)。"""
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    p = await _published_post_by_slug_or_404(db, slug)
    p.like_count = max(0, (p.like_count or 0) - 1)
    await db.commit()
    await db.refresh(p)
    return _metric_out(p)


@public_router.post("/{slug}/favourite", response_model=BlogMetricOut)
async def favourite_post(
    slug: str,
    user: dict | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """收藏：需登录，favourite_count += 1。"""
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    p = await _published_post_by_slug_or_404(db, slug)
    p.favourite_count = (p.favourite_count or 0) + 1
    await db.commit()
    await db.refresh(p)
    return _metric_out(p)


@public_router.post("/{slug}/unfavourite", response_model=BlogMetricOut)
async def unfavourite_post(
    slug: str,
    user: dict | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """取消收藏：需登录，favourite_count = max(0, -1)。"""
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    p = await _published_post_by_slug_or_404(db, slug)
    p.favourite_count = max(0, (p.favourite_count or 0) - 1)
    await db.commit()
    await db.refresh(p)
    return _metric_out(p)


# ==================== 管理：文章 ====================

@admin_router.get("", response_model=dict)
async def admin_list_posts(
    status: Literal["draft", "published", "scheduled", "archived"] | None = Query(default=None),
    tag: str | None = Query(default=None, max_length=128),
    q: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(require_permission("blog", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    await _auto_publish_scheduled(db)
    stmt = select(BlogPost)
    if status:
        stmt = apply_eq(stmt, BlogPost.status, BlogPostStatus(status))
    if tag:
        stmt = stmt.join(BlogPostTag, BlogPostTag.post_id == BlogPost.id).join(
            BlogTag, BlogTag.id == BlogPostTag.tag_id
        ).where(BlogTag.slug == tag)
    stmt = apply_search(stmt, [BlogPost.title, BlogPost.excerpt], q)
    # 定时中的文章按 scheduled_at 升序便于观察；其余按更新时间降序
    stmt = stmt.order_by(BlogPost.updated_at.desc())
    return await paginate(db, stmt, page, page_size, out_model=BlogPostBriefOut)


@admin_router.get("/tags", response_model=list[BlogTagOut])
async def admin_list_tags(
    q: str | None = Query(default=None, max_length=64),
    user: dict = Depends(require_permission("blog_tags", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    stmt = select(BlogTag)
    stmt = apply_search(stmt, [BlogTag.name], q)
    stmt = stmt.order_by(BlogTag.id.asc())
    result = await db.execute(stmt)
    return result.scalars().all()


@admin_router.get("/{post_id}", response_model=BlogPostOut)
async def admin_get_post(
    post_id: int,
    user: dict = Depends(require_permission("blog", "view")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    p = await db.get(BlogPost, post_id)
    if not p:
        raise HTTPException(status_code=404, detail="文章不存在")
    out = BlogPostOut.model_validate(p).model_dump(mode="json")
    out["content_html"] = _render_html(p.content_md)
    return out


@admin_router.post("", response_model=BlogPostOut, status_code=status.HTTP_201_CREATED)
async def admin_create_post(
    req: BlogPostCreate,
    request: Request,
    user: dict = Depends(require_permission("blog", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    tags = await _load_tags_or_400(db, req.tag_ids)
    if req.slug:
        await _ensure_slug_unique(db, req.slug)

    p = BlogPost(
        title=req.title,
        slug=req.slug or uuid.uuid4().hex,   # 未指定 slug 时先占位，flush 后回填 post-{id}
        content_md=req.content_md,
        excerpt=req.excerpt,
        cover_url=req.cover_url,
        allow_comments=req.allow_comments,
        author_name=req.author_name,
        author_id=ctx_uid(user),
    )
    p.status = _check_status_transition(req.status, req.scheduled_at)
    p.scheduled_at = req.scheduled_at if p.status == BlogPostStatus.SCHEDULED else None
    if p.status == BlogPostStatus.PUBLISHED:
        p.published_at = _naive_utc_now()
    p.tags = tags

    db.add(p)
    await db.flush()
    if not req.slug:
        # 自动 slug = post-{自增 id}，天然唯一；不能用 _ensure_slug_unique
        # （autoflush 会把新值写库后命中自身）
        p.slug = f"post-{p.id}"
    _log(db, user, "blog.create", f"blog:{p.id}", get_client_ip(request))
    await db.commit()
    await db.refresh(p)
    out = BlogPostOut.model_validate(p).model_dump(mode="json")
    out["content_html"] = _render_html(p.content_md)
    return out


@admin_router.put("/{post_id}", response_model=BlogPostOut)
async def admin_update_post(
    post_id: int,
    req: BlogPostUpdate,
    request: Request,
    user: dict = Depends(require_permission("blog", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    p = await db.get(BlogPost, post_id)
    if not p:
        raise HTTPException(status_code=404, detail="文章不存在")

    data = req.model_dump(exclude_unset=True)

    # 标签绑定
    if "tag_ids" in data and data["tag_ids"] is not None:
        p.tags = await _load_tags_or_400(db, data.pop("tag_ids"))
    elif "tag_ids" in data:
        data.pop("tag_ids")

    # slug 变更校验
    if "slug" in data and data["slug"] and data["slug"] != p.slug:
        await _ensure_slug_unique(db, data["slug"], exclude_id=p.id)

    # 状态流转校验（用更新后的 scheduled_at 判断）
    new_status = data.get("status")
    if new_status:
        new_scheduled = data.get("scheduled_at", p.scheduled_at)
        st = _check_status_transition(new_status, new_scheduled)
        if st == BlogPostStatus.PUBLISHED and p.published_at is None:
            p.published_at = _naive_utc_now()
        if st == BlogPostStatus.SCHEDULED:
            p.scheduled_at = new_scheduled
        else:
            p.scheduled_at = None
        p.status = st
    elif "scheduled_at" in data and p.status == BlogPostStatus.SCHEDULED:
        _check_status_transition(p.status.value, data["scheduled_at"])
        p.scheduled_at = data["scheduled_at"]

    for k in ("title", "slug", "content_md", "excerpt", "cover_url", "allow_comments", "author_name"):
        if k in data:
            setattr(p, k, data[k])

    _log(db, user, "blog.update", f"blog:{p.id}", get_client_ip(request))
    await db.commit()
    await db.refresh(p)
    out = BlogPostOut.model_validate(p).model_dump(mode="json")
    out["content_html"] = _render_html(p.content_md)
    return out


@admin_router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_post(
    post_id: int,
    request: Request,
    user: dict = Depends(require_permission("blog", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    p = await db.get(BlogPost, post_id)
    if not p:
        raise HTTPException(status_code=404, detail="文章不存在")
    # 文章封面不属于共享文件（每次上传生成新文件名），直接随记录删除
    # 关联行清理交给 ORM secondary 级联（删除父对象时自动 DELETE blog_post_tags）；
    # 不可再显式 sa_delete——flush 时 ORM 会基于已加载的 collection 二次删除不存在的行，
    # 抛 StaleDataError
    _log(db, user, "blog.delete", f"blog:{p.id}", get_client_ip(request))
    await db.delete(p)
    await db.commit()


# ==================== 管理：标签（增删改） ====================

@admin_router.post("/tags", response_model=BlogTagOut, status_code=status.HTTP_201_CREATED)
async def admin_create_tag(
    req: BlogTagCreate,
    request: Request,
    user: dict = Depends(require_permission("blog_tags", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    exists = (await db.execute(
        select(BlogTag).where(BlogTag.name == req.name)
    )).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=400, detail="标签名称已存在")
    if req.slug:
        slug_exists = (await db.execute(
            select(BlogTag).where(BlogTag.slug == req.slug)
        )).scalar_one_or_none()
        if slug_exists:
            raise HTTPException(status_code=400, detail="标签 slug 已存在")

    t = BlogTag(name=req.name, slug=req.slug or uuid.uuid4().hex)
    db.add(t)
    await db.flush()
    if not req.slug:
        t.slug = f"tag-{t.id}"
    _log(db, user, "blog_tag.create", f"blog_tag:{t.id}",
         get_client_ip(request))
    await db.commit()
    await db.refresh(t)
    return t


@admin_router.put("/tags/{tag_id}", response_model=BlogTagOut)
async def admin_update_tag(
    tag_id: int,
    req: BlogTagUpdate,
    request: Request,
    user: dict = Depends(require_permission("blog_tags", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    t = await db.get(BlogTag, tag_id)
    if not t:
        raise HTTPException(status_code=404, detail="标签不存在")
    data = req.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != t.name:
        exists = (await db.execute(
            select(BlogTag).where(BlogTag.name == data["name"], BlogTag.id != tag_id)
        )).scalar_one_or_none()
        if exists:
            raise HTTPException(status_code=400, detail="标签名称已存在")
    if "slug" in data and data["slug"] and data["slug"] != t.slug:
        exists = (await db.execute(
            select(BlogTag).where(BlogTag.slug == data["slug"], BlogTag.id != tag_id)
        )).scalar_one_or_none()
        if exists:
            raise HTTPException(status_code=400, detail="标签 slug 已存在")
    for k in ("name", "slug"):
        if k in data:
            setattr(t, k, data[k])
    _log(db, user, "blog_tag.update", f"blog_tag:{t.id}",
         get_client_ip(request))
    await db.commit()
    await db.refresh(t)
    return t


@admin_router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_tag(
    tag_id: int,
    request: Request,
    user: dict = Depends(require_permission("blog_tags", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    t = await db.get(BlogTag, tag_id)
    if not t:
        raise HTTPException(status_code=404, detail="标签不存在")
    # 先清理文章-标签关联行（同上，secondary 不级联）
    await db.execute(sa_delete(BlogPostTag).where(BlogPostTag.tag_id == tag_id))
    _log(db, user, "blog_tag.delete", f"blog_tag:{t.id}",
         get_client_ip(request))
    await db.delete(t)
    await db.commit()


# ==================== 管理：图片上传（仅无损压缩） ====================

def _sniff_image(data: bytes) -> str | None:
    """按文件头魔数识别图片类型。"""
    if data.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "WEBP"
    return None


def _compress_lossless_80(data: bytes, fmt: str) -> tuple[bytes, str, str]:
    """博客内嵌图片：仅无损压缩（优化编码），目标 ≤ 原体积 80%。

    - JPEG：quality='keep' 保留原量化表，仅优化 Huffman 编码（像素不变）
    - PNG：optimize=True 无损重压缩
    - WEBP：lossless=True 无损编码
    无损压缩后仍 ≥ 原体积时保留原字节（宁可不少压，绝不有损）。
    返回 (输出字节, 扩展名, mime)。
    """
    img = Image.open(io.BytesIO(data))
    buf = io.BytesIO()
    if fmt == "JPEG":
        img.save(buf, format="JPEG", quality="keep", optimize=True)
        return buf.getvalue(), ".jpg", "image/jpeg"
    if fmt == "PNG":
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue(), ".png", "image/png"
    # WEBP
    img.save(buf, format="WEBP", lossless=True)
    return buf.getvalue(), ".webp", "image/webp"


@admin_router.post("/upload", response_model=BlogUploadOut)
async def admin_upload_blog_image(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(require_permission("blog", "manage")),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """博客内嵌图片/封面上传：jpg/png/webp，≤5MB，仅无损压缩至 ≤ 原体积 80%。"""
    data = await file.read(BLOG_IMAGE_MAX_SIZE + 1)
    if len(data) > BLOG_IMAGE_MAX_SIZE:
        raise HTTPException(status_code=400, detail="文件大小不能超过 5MB")
    fmt = _sniff_image(data)
    if not fmt:
        raise HTTPException(status_code=400, detail="仅支持 JPG/PNG/WEBP 格式")

    try:
        compressed, ext, mime = _compress_lossless_80(data, fmt)
    except Exception:
        raise HTTPException(status_code=400, detail="图片文件已损坏或无法解析")
    # 目标 ≤ 原体积 80%：达不到且压缩无效时退回原字节（禁止有损重压）
    if len(compressed) >= len(data):
        compressed = data
    elif len(compressed) > int(len(data) * 0.8):
        # 无损优化收益不足 20% 时同样保留原文件，避免无意义的重编码
        compressed = data

    filename = f"blog_{uuid.uuid4().hex}{ext}"
    BLOG_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    (BLOG_IMAGE_DIR / filename).write_bytes(compressed)
    url = f"/uploads/blog/{filename}"

    db.add(MediaFile(
        filename=filename,
        original_name=file.filename,
        mime=mime,
        size=len(compressed),
        storage_path=f"uploads/blog/{filename}",
        uploader_id=ctx_uid(user),
        category=MediaCategory.BLOG,
    ))
    _log(db, user, "blog.upload", filename, get_client_ip(request))
    await db.commit()
    return BlogUploadOut(url=url, size=len(compressed), original_size=len(data))
