"""Memo 碎片笔记 API：公开时间线 + 个人中心 + 作者 CRUD + 后台管理 + 分享 + 版本 + 上传。

全部接口走 `ok()` 包装（与项目 dual 模式约定一致）。

路由分组（与后端 main.py 路由注册一一对应）：
- public_router   → /api/memos         （匿名 + 登录通用接口）
- user_router     → /api/me/memos       （个人中心：我的全部 / 归档 / 点赞 / 收藏）
- author_router   → /api/memos          （作者侧：创建 / 编辑 / 软删除 / 归档 / 点赞 / 收藏 / 版本 / 回滚 / 上传 / 分享）
- admin_router    → /api/admin/memos    （后台：全量浏览 / 下架 / 恢复 / 全局搜索，写 audit_logs）

核心设计：
- 标签输入仅接受 tag_names 字符串数组；后端懒创建，已存在的 scope 追加 MEMO
- 编辑正文时自动产生 MemoVersion（version_no+1）；仅可见性 / 标签变更不计版本
- 公开时间线过滤：public 全体可见；member_only 已登录可见；private 仅自己可见
- 归档 ≠ 删除：archived 仅控制时间线展示；删除走全局 deleted_at 基线
- 公开分享：仅 public memo 可生成 share_slug；匿名按 slug 访问；定期轮换可选
- 后台下架：admin_removed=true，独立于 deleted_at；下架可恢复（恢复后状态回到 archived/正常）
"""
from __future__ import annotations

import re
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import (
    APIRouter, Depends, Query, Request, UploadFile, File,
)
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bizcode import BizCode
from app.core.exceptions import BizException
from app.core.middleware import get_client_ip
from app.core.permissions import require_permission
from app.core.responses import ok
from app.core.security import get_optional_user, require_role, Role
from app.db.models import (
    Memo, MemoAttachment, MemoFavorite, MemoLike, MemoTag, MemoVersion,
    User,
)
from app.db.session import get_db
from app.schemas.memo import (
    MemoAttachmentOut, MemoCreate, MemoCreateOut, MemoInteractionOut,
    MemoRollback, MemoShareOut, MemoUpdate,
)
from app.utils.memo import (
    check_memo_rate, compress_lossless_80, create_memo_attachment,
    excerpt_of, first_image_attachment, log_memo, naive_utc_now,
    next_version_no, record_media_file, render_html, sniff_image, upsert_tags,
)

# ---------- 路由分组 ----------
public_router = APIRouter(prefix="/api/memos", tags=["memos-public"])
user_router = APIRouter(prefix="/api/me/memos", tags=["memos-user"])
author_router = APIRouter(prefix="/api/memos", tags=["memos-author"])
admin_router = APIRouter(prefix="/api/admin/memos", tags=["memos-admin"])

MEMO_IMAGE_DIR = Path("uploads/memos")
MEMO_IMAGE_MAX_SIZE = 5 * 1024 * 1024  # 5MB


# ---------- 通用输出辅助 ----------
def _vis_filter(uid: int | None):
    """可见性过滤：public 全体；member_only 已登录；private 仅自己。"""
    clauses = [Memo.visibility == "public"]
    if uid is not None:
        clauses.append(Memo.visibility == "member_only")
        clauses.append(and_(Memo.author_id == uid, Memo.visibility == "private"))
    return or_(*clauses)


def _author_dict(user: User | None) -> dict | None:
    if not user:
        return None
    return {
        "id": user.id,
        "username": user.username,
        "avatar_url": user.avatar_url,
    }


def _tag_dicts(memo: Memo) -> list[dict]:
    return [{
        "id": tg.id, "name": tg.name, "slug": tg.slug,
        "scopes": tg.scopes, "created_at": tg.created_at,
    } for tg in memo.tags]


def _memo_brief_dict(memo: Memo, liked_ids: set[int], fav_ids: set[int],
                     first_img: str | None, has_img: bool) -> dict:
    return {
        "id": memo.id,
        "excerpt": excerpt_of(memo.content_md),
        "visibility": memo.visibility.value,
        "archived": memo.archived,
        "like_count": memo.like_count,
        "favorite_count": memo.favorite_count,
        "comment_count": memo.comment_count,
        "has_image": has_img,
        "first_image_url": first_img,
        "author": _author_dict(memo.author),
        "tags": _tag_dicts(memo),
        "liked_by_me": memo.id in liked_ids,
        "favorited_by_me": memo.id in fav_ids,
        "created_at": memo.created_at,
        "updated_at": memo.updated_at,
    }


async def _fill_attachment_rows(db: AsyncSession, memo_ids: list[int]) -> dict[int, list[MemoAttachment]]:
    """批量取附件；返回 memo_id → 附件列表。"""
    if not memo_ids:
        return {}
    rows = (await db.execute(
        select(MemoAttachment).where(
            MemoAttachment.memo_id.in_(memo_ids),
            MemoAttachment.deleted_at.is_(None),
        ).order_by(MemoAttachment.id.asc())
    )).scalars().all()
    out: dict[int, list[MemoAttachment]] = {mid: [] for mid in memo_ids}
    for a in rows:
        out[a.memo_id].append(a)
    return out


async def _liked_fav_ids(db: AsyncSession, uid: int, memo_ids: list[int]) -> tuple[set[int], set[int]]:
    liked = set((await db.execute(
        select(MemoLike.memo_id).where(
            MemoLike.user_id == uid, MemoLike.memo_id.in_(memo_ids)
        )
    )).scalars().all())
    fav = set((await db.execute(
        select(MemoFavorite.memo_id).where(
            MemoFavorite.user_id == uid, MemoFavorite.memo_id.in_(memo_ids)
        )
    )).scalars().all())
    return liked, fav


def _memo_out_dict(memo: Memo, liked: bool, fav: bool, attachments: list[MemoAttachment]) -> dict:
    return {
        "id": memo.id,
        "content_md": memo.content_md,
        "content_html": memo.content_html or render_html(memo.content_md),
        "archived": memo.archived,
        "visibility": memo.visibility.value,
        "share_slug": memo.share_slug,
        "like_count": memo.like_count,
        "favorite_count": memo.favorite_count,
        "comment_count": memo.comment_count,
        "author": _author_dict(memo.author),
        "tags": _tag_dicts(memo),
        "attachments": [MemoAttachmentOut.model_validate(a).model_dump(mode="json") for a in attachments],
        "liked_by_me": liked,
        "favorited_by_me": fav,
        "admin_removed": memo.admin_removed,
        "created_at": memo.created_at,
        "updated_at": memo.updated_at,
    }


def _version_brief_dict(v: MemoVersion, editor: User | None) -> dict:
    return {
        "id": v.id,
        "memo_id": v.memo_id,
        "version_no": v.version_no,
        "edit_note": v.edit_note,
        "editor": _author_dict(editor),
        "visibility": v.visibility.value,
        "created_at": v.created_at,
    }


def _version_out_dict(v: MemoVersion, editor: User | None) -> dict:
    d = _version_brief_dict(v, editor)
    d["content_md"] = v.content_md
    return d


# ==================== 公开接口 ====================

@public_router.get("/shared/{share_slug}")
async def get_shared_memo(
    share_slug: str,
    db: AsyncSession = Depends(get_db),
):
    """按 share_slug 匿名访问公开 Memo：仅 visibility=public 且未下架 / 未删除。"""
    m = (await db.execute(
        select(Memo).where(
            Memo.share_slug == share_slug,
            Memo.visibility == "public",
            Memo.deleted_at.is_(None),
            Memo.admin_removed.is_(False),
        )
    )).scalar_one_or_none()
    if not m:
        raise BizException(BizCode.NOT_FOUND, data={"detail": "分享链接不存在或已失效"})
    attachments = (await db.execute(
        select(MemoAttachment).where(
            MemoAttachment.memo_id == m.id, MemoAttachment.deleted_at.is_(None)
        ).order_by(MemoAttachment.id.asc())
    )).scalars().all()
    return ok(data=_memo_out_dict(m, liked=False, fav=False, attachments=attachments))


@public_router.get("/timeline")
async def public_timeline(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    q: str | None = Query(default=None, max_length=64, description="标题/正文模糊搜索"),
    visibility: str = Query(
        default="all",
        description="public=仅公开；member_only=限定成员可见；all=公开+已登录可见",
    ),
    has_image: bool | None = Query(default=None, description="筛选是否带图片附件"),
    user: dict | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """公开时间线（倒序）；支持按档/搜索/是否带图过滤；当前用户视角过滤可见性。

    已归档 / 已删除 / 已下架不展示。
    """
    uid = int(user["user_id"]) if user else None

    stmt = select(Memo).where(
        Memo.deleted_at.is_(None),
        Memo.archived.is_(False),
        Memo.admin_removed.is_(False),
    )

    # 可见性筛选
    if visibility == "public":
        stmt = stmt.where(Memo.visibility == "public")
    elif visibility == "member_only":
        if uid is None:
            # 匿名访问要求 login 的档时，给空列表（不暴露列表）
            return ok(data={"total": 0, "items": [], "page": page, "page_size": page_size})
        stmt = stmt.where(Memo.visibility == "member_only")
    else:  # all
        stmt = stmt.where(_vis_filter(uid))

    if q:
        like = f"%{q}%"
        stmt = stmt.where(Memo.content_md.ilike(like))

    stmt = stmt.order_by(Memo.created_at.desc())

    # has_image=true：只取带图 Memo（先 ID 子查询再过滤，避免 N+1）
    if has_image is True:
        memo_ids_with_img = (await db.execute(
            select(MemoAttachment.memo_id).where(
                MemoAttachment.deleted_at.is_(None),
                MemoAttachment.kind == "image",
            ).distinct()
        )).scalars().all()
        stmt = stmt.where(Memo.id.in_(memo_ids_with_img))

    count_stmt = select(func_count := Memo.id).select_from(stmt.subquery())
    # 上面写法不优雅，改回使用 sqlalchemy.func.count
    from sqlalchemy import func
    total = (await db.execute(
        select(func.count()).select_from(stmt.subquery())
    )).scalar_one()

    rows = (await db.execute(
        stmt.offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    if uid is not None and rows:
        liked_ids, fav_ids = await _liked_fav_ids(db, uid, [m.id for m in rows])
    else:
        liked_ids, fav_ids = set(), set()

    att_map = await _fill_attachment_rows(db, [m.id for m in rows])

    items = []
    for m in rows:
        atts = att_map.get(m.id, [])
        first_img = next((a.url for a in atts if a.kind == "image"), None)
        has_img = first_img is not None
        if has_image is False and has_img:
            continue
        items.append(_memo_brief_dict(m, liked_ids, fav_ids, first_img, has_img))

    return ok(data={"total": total, "items": items, "page": page, "page_size": page_size})


@public_router.get("/calendar/{date}")
async def public_memos_by_date(
    date: str,
    user: dict | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """日历选择器：按指定日期（YYYY-MM-DD，UTC）取全部可见 Memo。

    跨午夜（UTC）：start = 当天 00:00:00 UTC，end = +1 天 00:00:00 UTC。
    """
    try:
        d = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise BizException(BizCode.VALIDATION_FAILED, data={"detail": "日期格式必须为 YYYY-MM-DD"})
    start_naive = d.replace(tzinfo=None)
    from datetime import timedelta
    end_naive = start_naive + timedelta(days=1)

    uid = int(user["user_id"]) if user else None
    stmt = select(Memo).where(
        Memo.created_at >= start_naive,
        Memo.created_at < end_naive,
        Memo.deleted_at.is_(None),
        Memo.archived.is_(False),
        Memo.admin_removed.is_(False),
        _vis_filter(uid),
    ).order_by(Memo.created_at.asc())

    rows = (await db.execute(stmt)).scalars().all()

    if uid is not None and rows:
        liked_ids, fav_ids = await _liked_fav_ids(db, uid, [m.id for m in rows])
    else:
        liked_ids, fav_ids = set(), set()
    att_map = await _fill_attachment_rows(db, [m.id for m in rows])

    items = []
    for m in rows:
        atts = att_map.get(m.id, [])
        first_img = next((a.url for a in atts if a.kind == "image"), None)
        items.append(_memo_brief_dict(m, liked_ids, fav_ids, first_img, first_img is not None))
    return ok(data={"date": date, "total": len(items), "items": items})


@public_router.get("/search")
async def public_search(
    q: str = Query(min_length=1, max_length=64, description="搜索关键词（必填）"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    user: dict | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """全文检索：当前阶段 SQL LIKE 占位，命中片段直接返回（前端按需高亮）。

    未来接 Meilisearch 时仅替换本函数实现；接口契约保持不变。
    """
    from sqlalchemy import func
    uid = int(user["user_id"]) if user else None
    like = f"%{q}%"

    stmt = select(Memo).where(
        Memo.deleted_at.is_(None),
        Memo.archived.is_(False),
        Memo.admin_removed.is_(False),
        Memo.content_md.ilike(like),
        _vis_filter(uid),
    ).order_by(Memo.created_at.desc())

    total = (await db.execute(
        select(func.count()).select_from(stmt.subquery())
    )).scalar_one()

    rows = (await db.execute(
        stmt.offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    if uid is not None and rows:
        liked_ids, fav_ids = await _liked_fav_ids(db, uid, [m.id for m in rows])
    else:
        liked_ids, fav_ids = set(), set()
    att_map = await _fill_attachment_rows(db, [m.id for m in rows])

    items = []
    for m in rows:
        atts = att_map.get(m.id, [])
        first_img = next((a.url for a in atts if a.kind == "image"), None)
        text = m.content_md or ""
        idx = text.lower().find(q.lower())
        if idx == -1:
            snippet = text[:200]
        else:
            s = max(0, idx - 80)
            e = min(len(text), idx + 120)
            snippet = (text[s:e] + "…") if e < len(text) else text[s:e]
        items.append({
            "memo": _memo_brief_dict(m, liked_ids, fav_ids, first_img, first_img is not None),
            "snippet": snippet,
            "matched_keywords": [q],
        })

    return ok(data={"total": total, "items": items, "page": page, "page_size": page_size})


# ==================== 个人中心：/api/me/memos ====================

@user_router.get("")
async def my_memos(
    archived: bool | None = Query(default=None, description="true=仅归档，false=仅未归档"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """我的全部 Memo（含 private / member_only / public，已归档可选过滤）。"""
    from sqlalchemy import func
    uid = int(user["user_id"])
    stmt = select(Memo).where(
        Memo.author_id == uid,
        Memo.deleted_at.is_(None),
    )
    if archived is not None:
        stmt = stmt.where(Memo.archived == archived)
    stmt = stmt.order_by(Memo.created_at.desc())

    total = (await db.execute(
        select(func.count()).select_from(stmt.subquery())
    )).scalar_one()
    rows = (await db.execute(
        stmt.offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    liked_ids, fav_ids = await _liked_fav_ids(db, uid, [m.id for m in rows])
    att_map = await _fill_attachment_rows(db, [m.id for m in rows])
    items = []
    for m in rows:
        atts = att_map.get(m.id, [])
        first_img = next((a.url for a in atts if a.kind == "image"), None)
        items.append(_memo_brief_dict(m, liked_ids, fav_ids, first_img, first_img is not None))
    return ok(data={"total": total, "items": items, "page": page, "page_size": page_size})


@user_router.get("/liked")
async def my_liked_memos(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """我点赞的全部 Memo（仍遵守可见性过滤）。"""
    from sqlalchemy import func
    uid = int(user["user_id"])
    stmt = (
        select(Memo)
        .join(MemoLike, MemoLike.memo_id == Memo.id)
        .where(MemoLike.user_id == uid, Memo.deleted_at.is_(None),
               _vis_filter(uid))
        .order_by(MemoLike.created_at.desc())
    )
    total = (await db.execute(
        select(func.count()).select_from(stmt.subquery())
    )).scalar_one()
    rows = (await db.execute(
        stmt.offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    liked_ids = {m.id for m in rows}
    _, fav_ids = await _liked_fav_ids(db, uid, [m.id for m in rows])
    att_map = await _fill_attachment_rows(db, [m.id for m in rows])
    items = []
    for m in rows:
        atts = att_map.get(m.id, [])
        first_img = next((a.url for a in atts if a.kind == "image"), None)
        items.append(_memo_brief_dict(m, liked_ids, fav_ids, first_img, first_img is not None))
    return ok(data={"total": total, "items": items, "page": page, "page_size": page_size})


@user_router.get("/favorites")
async def my_favorite_memos(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """我收藏的全部 Memo。"""
    from sqlalchemy import func
    uid = int(user["user_id"])
    stmt = (
        select(Memo)
        .join(MemoFavorite, MemoFavorite.memo_id == Memo.id)
        .where(MemoFavorite.user_id == uid, Memo.deleted_at.is_(None),
               _vis_filter(uid))
        .order_by(MemoFavorite.created_at.desc())
    )
    total = (await db.execute(
        select(func.count()).select_from(stmt.subquery())
    )).scalar_one()
    rows = (await db.execute(
        stmt.offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    liked_ids, _ = await _liked_fav_ids(db, uid, [m.id for m in rows])
    fav_ids = {m.id for m in rows}
    att_map = await _fill_attachment_rows(db, [m.id for m in rows])
    items = []
    for m in rows:
        atts = att_map.get(m.id, [])
        first_img = next((a.url for a in atts if a.kind == "image"), None)
        items.append(_memo_brief_dict(m, liked_ids, fav_ids, first_img, first_img is not None))
    return ok(data={"total": total, "items": items, "page": page, "page_size": page_size})


# ==================== 作者侧：创建 / 编辑 / 删除 / 归档 / 点赞 / 收藏 / 版本 / 分享 / 上传 ====================

@author_router.post("")
async def create_memo(
    req: MemoCreate,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """创建 Memo：自动写入版本 1；标签懒创建；防灌水限流（每分钟 10 条）。"""
    uid = int(user["user_id"])
    retry_after = check_memo_rate(get_client_ip(request))
    if retry_after is not None:
        raise BizException(
            BizCode.RATE_LIMITED,
            params={"retry_after": str(retry_after)},
            data={"retry_after": retry_after, "detail": f"创建过于频繁，请在 {retry_after} 秒后重试"},
            http_status=429,
        )

    all_tags, new_tag_names = await upsert_tags(db, req.tag_names)

    m = Memo(
        content_md=req.content_md,
        content_html=render_html(req.content_md),
        visibility=req.visibility,
        author_id=uid,
        tenant_id=1,
    )
    db.add(m)
    await db.flush()

    if all_tags:
        for t in all_tags:
            db.add(MemoTag(memo_id=m.id, tag_id=t.id))

    for url in req.attachment_urls:
        await create_memo_attachment(
            db, m, url=url, original_name=None, mime="image/jpeg",
            size=0, kind="image" if url.lower().endswith(
                (".png", ".jpg", ".jpeg", ".webp", ".gif")) else "file",
        )

    db.add(MemoVersion(
        memo_id=m.id,
        version_no=1,
        content_md=m.content_md,
        visibility=m.visibility,
        editor_id=uid,
        edit_note="首版",
        tenant_id=1,
    ))

    log_memo(db, uid, "memo.create", f"memo:{m.id}", get_client_ip(request),
             f"visibility={req.visibility} tags={len(all_tags)}")
    await db.commit()
    await db.refresh(m)
    return ok(data=MemoCreateOut(id=m.id, version_no=1, new_tags=new_tag_names).model_dump(mode="json"))


async def _load_memo_or_404(
    db: AsyncSession, memo_id: int,
    *, include_deleted: bool = False, require_owner: int | None = None,
) -> Memo:
    """加载 Memo：默认排除已软删除；require_owner 指定作者 id 时校验归属。"""
    stmt = select(Memo).where(Memo.id == memo_id)
    if not include_deleted:
        stmt = stmt.where(Memo.deleted_at.is_(None))
    m = (await db.execute(stmt)).scalar_one_or_none()
    if not m:
        raise BizException(BizCode.NOT_FOUND, data={"detail": "Memo 不存在"})
    if require_owner is not None and m.author_id != require_owner:
        raise BizException(BizCode.FORBIDDEN, data={"detail": "仅作者本人可操作此 Memo"})
    return m


@author_router.patch("/{memo_id}")
async def update_memo(
    memo_id: int,
    req: MemoUpdate,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """编辑 Memo：content_md 变化 → 自动写新版本；可见性 / 标签 / 附件变更不计版本。"""
    uid = int(user["user_id"])
    m = await _load_memo_or_404(db, memo_id, require_owner=uid)

    new_version_no = None
    if req.content_md is not None and req.content_md != m.content_md:
        new_version_no = await next_version_no(db, m.id)
        db.add(MemoVersion(
            memo_id=m.id,
            version_no=new_version_no,
            content_md=req.content_md,
            visibility=m.visibility,
            editor_id=uid,
            edit_note=(req.edit_note or "").strip() or None,
            tenant_id=1,
        ))
        m.content_md = req.content_md
        m.content_html = render_html(req.content_md)

    if req.visibility is not None:
        m.visibility = req.visibility

    if req.tag_names is not None:
        all_tags, _ = await upsert_tags(db, req.tag_names)
        m.tags = all_tags

    if req.attachment_urls is not None:
        for url in req.attachment_urls:
            await create_memo_attachment(
                db, m, url=url, original_name=None, mime="image/jpeg",
                size=0, kind="image" if url.lower().endswith(
                    (".png", ".jpg", ".jpeg", ".webp", ".gif")) else "file",
            )

    m.updated_at = naive_utc_now()
    log_memo(db, uid, "memo.update", f"memo:{m.id}", get_client_ip(request),
             f"version_no={new_version_no}" if new_version_no else "metadata-only")
    await db.commit()
    await db.refresh(m)

    attachments = (await db.execute(
        select(MemoAttachment).where(
            MemoAttachment.memo_id == m.id, MemoAttachment.deleted_at.is_(None)
        ).order_by(MemoAttachment.id.asc())
    )).scalars().all()
    return ok(data=_memo_out_dict(m, liked=True, fav=True, attachments=attachments))


@author_router.delete("/{memo_id}")
async def delete_memo(
    memo_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """软删除：写入 deleted_at（基线）；版本快照保留，关联数据随父级联清理（依赖 ORM cascade）。"""
    uid = int(user["user_id"])
    m = await _load_memo_or_404(db, memo_id, require_owner=uid)
    m.deleted_at = naive_utc_now()
    log_memo(db, uid, "memo.delete", f"memo:{m.id}", get_client_ip(request))
    await db.commit()
    return ok(data=None)


@author_router.post("/{memo_id}/archive")
async def archive_memo(
    memo_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """归档：archived=true；不在主时间线展示；归档页专门浏览；归档≠删除。"""
    uid = int(user["user_id"])
    m = await _load_memo_or_404(db, memo_id, require_owner=uid)
    m.archived = True
    m.updated_at = naive_utc_now()
    log_memo(db, uid, "memo.archive", f"memo:{m.id}", get_client_ip(request))
    await db.commit()
    await db.refresh(m)
    attachments = (await db.execute(
        select(MemoAttachment).where(
            MemoAttachment.memo_id == m.id, MemoAttachment.deleted_at.is_(None)
        )
    )).scalars().all()
    return ok(data=_memo_out_dict(m, liked=True, fav=True, attachments=attachments))


@author_router.post("/{memo_id}/unarchive")
async def unarchive_memo(
    memo_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """取消归档。"""
    uid = int(user["user_id"])
    m = await _load_memo_or_404(db, memo_id, require_owner=uid)
    m.archived = False
    m.updated_at = naive_utc_now()
    log_memo(db, uid, "memo.unarchive", f"memo:{m.id}", get_client_ip(request))
    await db.commit()
    await db.refresh(m)
    attachments = (await db.execute(
        select(MemoAttachment).where(
            MemoAttachment.memo_id == m.id, MemoAttachment.deleted_at.is_(None)
        )
    )).scalars().all()
    return ok(data=_memo_out_dict(m, liked=True, fav=True, attachments=attachments))


# ---------- 互动：点赞 / 收藏 ----------
@author_router.post("/{memo_id}/like")
async def toggle_like(
    memo_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """点赞 / 取消点赞（toggle）：命中即取消；未命中即新增。"""
    uid = int(user["user_id"])
    m = await _load_memo_or_404(db, memo_id)
    if m.visibility == "private" and m.author_id != uid:
        raise BizException(BizCode.FORBIDDEN, data={"detail": "无权点赞此 Memo"})

    existing = (await db.execute(
        select(MemoLike).where(
            MemoLike.memo_id == memo_id, MemoLike.user_id == uid
        )
    )).scalar_one_or_none()
    liked = False
    if existing:
        await db.delete(existing)
        m.like_count = max(0, m.like_count - 1)
    else:
        db.add(MemoLike(memo_id=memo_id, user_id=uid))
        m.like_count += 1
        liked = True

    fav_exists = (await db.execute(
        select(MemoFavorite).where(
            MemoFavorite.memo_id == memo_id, MemoFavorite.user_id == uid
        )
    )).scalar_one_or_none()
    favorited = fav_exists is not None

    log_memo(db, uid, "memo.like", f"memo:{memo_id}", get_client_ip(request),
             f"liked={liked}")
    await db.commit()
    return ok(data=MemoInteractionOut(
        liked=liked, favorited=favorited,
        like_count=m.like_count, favorite_count=m.favorite_count,
    ).model_dump(mode="json"))


@author_router.post("/{memo_id}/favorite")
async def toggle_favorite(
    memo_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """收藏 / 取消收藏（toggle）。"""
    uid = int(user["user_id"])
    m = await _load_memo_or_404(db, memo_id)
    if m.visibility == "private" and m.author_id != uid:
        raise BizException(BizCode.FORBIDDEN, data={"detail": "无权收藏此 Memo"})

    existing = (await db.execute(
        select(MemoFavorite).where(
            MemoFavorite.memo_id == memo_id, MemoFavorite.user_id == uid
        )
    )).scalar_one_or_none()
    favorited = False
    if existing:
        await db.delete(existing)
        m.favorite_count = max(0, m.favorite_count - 1)
    else:
        db.add(MemoFavorite(memo_id=memo_id, user_id=uid))
        m.favorite_count += 1
        favorited = True

    like_exists = (await db.execute(
        select(MemoLike).where(
            MemoLike.memo_id == memo_id, MemoLike.user_id == uid
        )
    )).scalar_one_or_none()
    liked = like_exists is not None

    log_memo(db, uid, "memo.favorite", f"memo:{memo_id}", get_client_ip(request),
             f"favorited={favorited}")
    await db.commit()
    return ok(data=MemoInteractionOut(
        liked=liked, favorited=favorited,
        like_count=m.like_count, favorite_count=m.favorite_count,
    ).model_dump(mode="json"))


# ---------- 版本：列表 / 查看 / 回滚 ----------
@author_router.get("/{memo_id}/versions")
async def list_memo_versions(
    memo_id: int,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """作者本人浏览 Memo 历史版本（不含正文，列表用）。"""
    uid = int(user["user_id"])
    m = await _load_memo_or_404(db, memo_id, require_owner=uid)
    rows = (await db.execute(
        select(MemoVersion).where(
            MemoVersion.memo_id == m.id, MemoVersion.deleted_at.is_(None)
        ).order_by(MemoVersion.version_no.desc())
    )).scalars().all()
    out = []
    for v in rows:
        editor = await db.get(User, v.editor_id) if v.editor_id else None
        out.append(_version_brief_dict(v, editor))
    return ok(data=out)


@author_router.get("/{memo_id}/versions/{version_no}")
async def get_memo_version(
    memo_id: int,
    version_no: int,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """查看指定版本号（含原文 content_md）。"""
    uid = int(user["user_id"])
    await _load_memo_or_404(db, memo_id, require_owner=uid)
    v = (await db.execute(
        select(MemoVersion).where(
            MemoVersion.memo_id == memo_id,
            MemoVersion.version_no == version_no,
            MemoVersion.deleted_at.is_(None),
        )
    )).scalar_one_or_none()
    if not v:
        raise BizException(BizCode.NOT_FOUND, data={"detail": "版本不存在"})
    editor = await db.get(User, v.editor_id) if v.editor_id else None
    return ok(data=_version_out_dict(v, editor))


@author_router.post("/{memo_id}/rollback")
async def rollback_memo(
    memo_id: int,
    req: MemoRollback,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """回滚到指定版本：生成新版本（内容 = 旧版本），保留完整历史链。"""
    uid = int(user["user_id"])
    m = await _load_memo_or_404(db, memo_id, require_owner=uid)
    v = (await db.execute(
        select(MemoVersion).where(
            MemoVersion.memo_id == memo_id,
            MemoVersion.version_no == req.target_version_no,
            MemoVersion.deleted_at.is_(None),
        )
    )).scalar_one_or_none()
    if not v:
        raise BizException(BizCode.NOT_FOUND, data={"detail": "目标版本不存在"})

    new_no = await next_version_no(db, m.id)
    db.add(MemoVersion(
        memo_id=m.id,
        version_no=new_no,
        content_md=v.content_md,
        visibility=m.visibility,
        editor_id=uid,
        edit_note=f"回滚到 v{req.target_version_no}：{req.edit_note.strip()[:200]}",
        tenant_id=1,
    ))
    m.content_md = v.content_md
    m.content_html = render_html(v.content_md)
    m.updated_at = naive_utc_now()
    log_memo(db, uid, "memo.rollback", f"memo:{m.id}", get_client_ip(request),
             f"to v{req.target_version_no}")
    await db.commit()
    await db.refresh(m)
    attachments = (await db.execute(
        select(MemoAttachment).where(
            MemoAttachment.memo_id == m.id, MemoAttachment.deleted_at.is_(None)
        )
    )).scalars().all()
    return ok(data=_memo_out_dict(m, liked=True, fav=True, attachments=attachments))


# ---------- 附件上传（仅图片，按 blog.py 同样规则） ----------
@author_router.post("/{memo_id}/upload")
async def upload_memo_attachment(
    memo_id: int,
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """Memo 附件上传：jpg/png/webp ≤5MB，仅无损压缩至 ≤ 原体积 80%。

    上传文件落到 uploads/memos/，并在 media_files 同步写记录。
    """
    uid = int(user["user_id"])
    m = await _load_memo_or_404(db, memo_id, require_owner=uid)
    data = await file.read(MEMO_IMAGE_MAX_SIZE + 1)
    if len(data) > MEMO_IMAGE_MAX_SIZE:
        raise BizException(
            BizCode.PAYLOAD_TOO_LARGE,
            data={"max_bytes": MEMO_IMAGE_MAX_SIZE, "detail": "文件大小不能超过 5MB"},
        )
    fmt = sniff_image(data)
    if not fmt:
        raise BizException(BizCode.VALIDATION_FAILED, data={"detail": "仅支持 JPG/PNG/WEBP 格式"})

    try:
        compressed, ext, mime = compress_lossless_80(data, fmt)
    except Exception:
        raise BizException(BizCode.VALIDATION_FAILED, data={"detail": "图片文件已损坏或无法解析"})
    if len(compressed) >= len(data) or len(compressed) > int(len(data) * 0.8):
        compressed = data

    MEMO_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"memo_{uuid.uuid4().hex}{ext}"
    (MEMO_IMAGE_DIR / filename).write_bytes(compressed)
    url = f"/uploads/memos/{filename}"

    att = await create_memo_attachment(
        db, m, url=url, original_name=file.filename, mime=mime,
        size=len(compressed), kind="image",
    )
    await record_media_file(
        db, filename=filename, original_name=file.filename, mime=mime,
        size=len(compressed), storage_path=f"uploads/memos/{filename}",
        uploader_id=uid,
    )
    log_memo(db, uid, "memo.upload", f"memo:{m.id}", get_client_ip(request), filename)
    await db.commit()
    await db.refresh(att)
    return ok(data=MemoAttachmentOut.model_validate(att).model_dump(mode="json"))


# ---------- 公开分享：生成 / 撤销 ----------
@author_router.post("/{memo_id}/share")
async def create_share_link(
    memo_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """生成 / 轮换公开分享 slug：仅 visibility=public 允许（member_only 不可匿名访问）。"""
    uid = int(user["user_id"])
    m = await _load_memo_or_404(db, memo_id, require_owner=uid)
    if m.visibility != "public":
        raise BizException(BizCode.VALIDATION_FAILED, data={"detail": "仅公开 Memo 可生成分享链接"})

    if not m.share_slug:
        for _ in range(5):
            candidate = secrets.token_urlsafe(12)
            exists = (await db.execute(
                select(Memo.id).where(Memo.share_slug == candidate)
            )).scalar_one_or_none()
            if not exists:
                m.share_slug = candidate
                break
        if not m.share_slug:
            raise BizException(BizCode.INTERNAL_ERROR, data={"detail": "生成分享链接失败，请重试"})

    m.updated_at = naive_utc_now()
    log_memo(db, uid, "memo.share.create", f"memo:{m.id}", get_client_ip(request))
    await db.commit()
    origin = str(request.base_url).rstrip("/")
    return ok(data=MemoShareOut(
        share_slug=m.share_slug,
        share_url=f"{origin}/api/memos/shared/{m.share_slug}",
        visibility=m.visibility.value,
    ).model_dump(mode="json"))


@author_router.delete("/{memo_id}/share")
async def revoke_share_link(
    memo_id: int,
    request: Request,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """撤销公开分享链接。"""
    uid = int(user["user_id"])
    m = await _load_memo_or_404(db, memo_id, require_owner=uid)
    if not m.share_slug:
        raise BizException(BizCode.NOT_FOUND, data={"detail": "暂无分享链接"})
    m.share_slug = None
    log_memo(db, uid, "memo.share.revoke", f"memo:{m.id}", get_client_ip(request))
    await db.commit()
    return ok(data=None)


# ---------- 公开读取单条（可见性范围内） ----------
@public_router.get("/{memo_id}")
async def get_memo(
    memo_id: int,
    user: dict | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """按 id 读取 Memo：可见性范围内可见。"""
    m = await _load_memo_or_404(db, memo_id)
    uid = int(user["user_id"]) if user else None
    if m.visibility == "public":
        pass
    elif m.visibility == "member_only":
        if uid is None:
            raise BizException(BizCode.NOT_FOUND, data={"detail": "Memo 不存在"})
    else:  # private
        if uid is None or m.author_id != uid:
            raise BizException(BizCode.NOT_FOUND, data={"detail": "Memo 不存在"})
    if m.admin_removed and (uid is None or uid != m.author_id):
        raise BizException(BizCode.NOT_FOUND, data={"detail": "Memo 不存在"})

    attachments = (await db.execute(
        select(MemoAttachment).where(
            MemoAttachment.memo_id == m.id, MemoAttachment.deleted_at.is_(None)
        ).order_by(MemoAttachment.id.asc())
    )).scalars().all()
    liked, fav = False, False
    if uid is not None:
        liked = (await db.execute(
            select(MemoLike.id).where(
                MemoLike.memo_id == m.id, MemoLike.user_id == uid
            )
        )).scalar_one_or_none() is not None
        fav = (await db.execute(
            select(MemoFavorite.id).where(
                MemoFavorite.memo_id == m.id, MemoFavorite.user_id == uid
            )
        )).scalar_one_or_none() is not None
    return ok(data=_memo_out_dict(m, liked=liked, fav=fav, attachments=attachments))


# ==================== 后台管理 ====================

@admin_router.get("")
async def admin_list_memos(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    author: str | None = Query(default=None, max_length=64, description="按作者用户名搜索"),
    q: str | None = Query(default=None, max_length=64),
    visibility: str = Query(default="all"),
    admin_removed: bool | None = Query(default=None),
    archived: bool | None = Query(default=None),
    user: dict = Depends(require_permission("memo", "view")),
    db: AsyncSession = Depends(get_db),
):
    """后台全量浏览：含已下架 / 已软删除；按作者 / 关键词 / 可见性 / 状态过滤。"""
    from sqlalchemy import func
    stmt = select(Memo)
    if admin_removed is not None:
        stmt = stmt.where(Memo.admin_removed == admin_removed)
    if archived is not None:
        stmt = stmt.where(Memo.archived == archived)
    if visibility != "all":
        stmt = stmt.where(Memo.visibility == visibility)
    if q:
        stmt = stmt.where(Memo.content_md.ilike(f"%{q}%"))
    if author:
        author_user = (await db.execute(
            select(User).where(User.username.ilike(f"%{author}%"))
        )).scalars().all()
        if not author_user:
            return ok(data={"total": 0, "items": [], "page": page, "page_size": page_size})
        stmt = stmt.where(Memo.author_id.in_([u.id for u in author_user]))
    stmt = stmt.order_by(Memo.created_at.desc())

    total = (await db.execute(
        select(func.count()).select_from(stmt.subquery())
    )).scalar_one()
    rows = (await db.execute(
        stmt.offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    items = []
    for m in rows:
        atts = (await db.execute(
            select(MemoAttachment).where(
                MemoAttachment.memo_id == m.id, MemoAttachment.deleted_at.is_(None)
            )
        )).scalars().all()
        first_img = next((a.url for a in atts if a.kind == "image"), None)
        items.append(_memo_brief_dict(m, set(), set(), first_img, first_img is not None))
    return ok(data={"total": total, "items": items, "page": page, "page_size": page_size})


@admin_router.get("/{memo_id}")
async def admin_get_memo(
    memo_id: int,
    user: dict = Depends(require_permission("memo", "view")),
    db: AsyncSession = Depends(get_db),
):
    """后台查看单条 Memo（含已下架 / 已删除）。"""
    m = (await db.execute(
        select(Memo).where(Memo.id == memo_id)
    )).scalar_one_or_none()
    if not m:
        raise BizException(BizCode.NOT_FOUND, data={"detail": "Memo 不存在"})
    attachments = (await db.execute(
        select(MemoAttachment).where(
            MemoAttachment.memo_id == m.id, MemoAttachment.deleted_at.is_(None)
        ).order_by(MemoAttachment.id.asc())
    )).scalars().all()
    return ok(data=_memo_out_dict(m, liked=False, fav=False, attachments=attachments))


@admin_router.post("/{memo_id}/remove")
async def admin_remove_memo(
    memo_id: int,
    request: Request,
    user: dict = Depends(require_permission("memo", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """后台下架：admin_removed=true；公开时间线 / 详情页不再可见；作者本人可继续编辑。

    操作写入 audit_logs；可由恢复接口回到正常状态。
    """
    m = (await db.execute(
        select(Memo).where(Memo.id == memo_id)
    )).scalar_one_or_none()
    if not m:
        raise BizException(BizCode.NOT_FOUND, data={"detail": "Memo 不存在"})
    if m.admin_removed:
        raise BizException(BizCode.CONFLICT, data={"detail": "该 Memo 已是下架状态"})
    m.admin_removed = True
    m.admin_removed_at = naive_utc_now()
    m.admin_removed_by = int(user["user_id"])
    log_memo(db, int(user["user_id"]), "memo.admin.remove", f"memo:{m.id}",
             get_client_ip(request))
    await db.commit()
    await db.refresh(m)
    attachments = (await db.execute(
        select(MemoAttachment).where(
            MemoAttachment.memo_id == m.id, MemoAttachment.deleted_at.is_(None)
        )
    )).scalars().all()
    return ok(data=_memo_out_dict(m, liked=False, fav=False, attachments=attachments))


@admin_router.post("/{memo_id}/restore")
async def admin_restore_memo(
    memo_id: int,
    request: Request,
    user: dict = Depends(require_permission("memo", "manage")),
    db: AsyncSession = Depends(get_db),
):
    """后台恢复：清除 admin_removed，回到正常展示状态。"""
    m = (await db.execute(
        select(Memo).where(Memo.id == memo_id)
    )).scalar_one_or_none()
    if not m:
        raise BizException(BizCode.NOT_FOUND, data={"detail": "Memo 不存在"})
    if not m.admin_removed:
        raise BizException(BizCode.CONFLICT, data={"detail": "该 Memo 不在下架状态"})
    m.admin_removed = False
    m.admin_removed_at = None
    m.admin_removed_by = None
    m.admin_removed_reason = None
    log_memo(db, int(user["user_id"]), "memo.admin.restore", f"memo:{m.id}",
             get_client_ip(request))
    await db.commit()
    await db.refresh(m)
    attachments = (await db.execute(
        select(MemoAttachment).where(
            MemoAttachment.memo_id == m.id, MemoAttachment.deleted_at.is_(None)
        )
    )).scalars().all()
    return ok(data=_memo_out_dict(m, liked=False, fav=False, attachments=attachments))


# ==================== 预留接口（暂不实现 UI） ====================
# RSS / WebDAV / Memos 备份导入：底层接口骨架留待后续实装。
# 当前阶段：直接返回 501 Not Implemented，便于前端 / 客户端探测接口已注册但功能未上线。

@public_router.get("/feed.xml", include_in_schema=False)
async def rss_skeleton():
    """RSS 输出接口骨架（保留路径，预留内容协商）。"""
    raise BizException(BizCode.MAINTENANCE, data={"detail": "RSS 暂未实装，后续迭代上线"})


@public_router.get("/webdav/", include_in_schema=False)
async def webdav_skeleton():
    """WebDAV 同步接口骨架。"""
    raise BizException(BizCode.MAINTENANCE, data={"detail": "WebDAV 暂未实装，后续迭代上线"})


@author_router.post("/import", include_in_schema=False)
async def memos_import_skeleton():
    """Memos 备份导入接口骨架。"""
    raise BizException(BizCode.MAINTENANCE, data={"detail": "Memos 备份导入暂未实装，后续迭代上线"})