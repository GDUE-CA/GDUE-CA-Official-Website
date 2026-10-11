"""全站共享标签池 API（新壳：`ok()` 包装；与项目 dual 模式约定一致）。

标签池与 Memo / Document / Activity 共享；本期内 Memo 已实装，Document/Activity 后续接入。
设计要点：
- 公开 GET /api/tags：返回未删除的标签，按关联 memo 数倒序，便于发现活跃标签
- 公开 GET /api/tags/{slug}：返回标签详情
- 公开 GET /api/tags/{slug}/memos：该标签下的最新 Memo 列表（跨模块聚合后续扩展）
- 标签懒创建由 memos API 内部调用（写入时统一懒创建），不暴露单独的公开创建接口
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bizcode import BizCode
from app.core.exceptions import BizException
from app.core.responses import ok
from app.core.security import get_optional_user
from app.db.models import Memo, MemoFavorite, MemoLike, MemoTag, Tag
from app.db.session import get_db
from app.schemas.memo import MemoAuthorBrief
from app.schemas.tag import TagOut, TagWithCount
from app.utils.crud import apply_search
from app.utils.memo import excerpt_of, first_image_attachment

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("")
async def list_tags(
    q: str | None = Query(default=None, max_length=64, description="按 name 模糊搜索"),
    scope: str | None = Query(
        default=None,
        description="按 scope 过滤（memo/document/activity）",
    ),
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """全站共享标签列表：仅返回未删除；按关联 memo 数倒序；匿名可访问。

    关联数为 LEFT JOIN memo_tag_links 的 COUNT；scope 过滤走 JSON contains。
    """
    stmt = (
        select(
            Tag,
            func.count(MemoTag.memo_id).label("memo_count"),
        )
        .select_from(Tag)
        .outerjoin(MemoTag, MemoTag.tag_id == Tag.id)
        .outerjoin(
            Memo,
            (Memo.id == MemoTag.memo_id) & (Memo.deleted_at.is_(None))
            & (Memo.admin_removed.is_(False)),
        )
        .where(Tag.deleted_at.is_(None))
        .group_by(Tag.id)
    )
    if q:
        stmt = apply_search(stmt, [Tag.name], q)
    if scope:
        stmt = stmt.where(Tag.scopes.contains([scope]))
    stmt = stmt.order_by(func.count(MemoTag.memo_id).desc(), Tag.id.asc())
    rows = (await db.execute(stmt.limit(limit))).all()

    items = [
        TagWithCount(
            id=t.id, name=t.name, slug=t.slug, scopes=t.scopes,
            created_at=t.created_at, memo_count=int(cnt or 0),
        ).model_dump(mode="json")
        for t, cnt in rows
    ]
    return ok(data=items)


@router.get("/{slug}")
async def get_tag_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    """单标签详情；按 slug 查找。"""
    t = (await db.execute(
        select(Tag).where(Tag.slug == slug, Tag.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not t:
        raise BizException(BizCode.NOT_FOUND, "标签不存在")
    return ok(data=TagOut.model_validate(t).model_dump(mode="json"))


@router.get("/{slug}/memos")
async def list_memos_by_tag(
    slug: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    user: dict | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """指定标签下的 Memo 时间线：仅返回公开可见 + 已登录用户可见 member_only + 自己可见 private。

    已下架（admin_removed）/ 已软删除的 Memos 不出现在公开列表。
    """
    t = (await db.execute(
        select(Tag).where(Tag.slug == slug, Tag.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not t:
        raise BizException(BizCode.NOT_FOUND, "标签不存在")

    uid = int(user["user_id"]) if user else None

    # 可见性过滤：public 全体可见；member_only 已登录可见；private 仅自己可见
    vis = [Memo.visibility == "public"]
    if uid is not None:
        vis.append(Memo.visibility == "member_only")
        vis.append((Memo.author_id == uid) & (Memo.visibility == "private"))

    stmt = (
        select(Memo)
        .join(MemoTag, MemoTag.memo_id == Memo.id)
        .where(
            MemoTag.tag_id == t.id,
            Memo.deleted_at.is_(None),
            Memo.archived.is_(False),
            Memo.admin_removed.is_(False),
            or_(*vis),
        )
        .order_by(Memo.created_at.desc())
    )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    rows = (await db.execute(
        stmt.offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    # 互动状态批量查
    liked_ids: set[int] = set()
    fav_ids: set[int] = set()
    if uid is not None and rows:
        mid_list = [m.id for m in rows]
        liked_ids = set((await db.execute(
            select(MemoLike.memo_id).where(
                MemoLike.user_id == uid, MemoLike.memo_id.in_(mid_list)
            )
        )).scalars().all())
        fav_ids = set((await db.execute(
            select(MemoFavorite.memo_id).where(
                MemoFavorite.user_id == uid, MemoFavorite.memo_id.in_(mid_list)
            )
        )).scalars().all())

    items: list[dict] = []
    for memo in rows:
        has_img, first_img = await first_image_attachment(db, memo.id)
        items.append({
            "id": memo.id,
            "excerpt": excerpt_of(memo.content_md),
            "visibility": memo.visibility.value,
            "archived": memo.archived,
            "like_count": memo.like_count,
            "favorite_count": memo.favorite_count,
            "comment_count": memo.comment_count,
            "has_image": has_img,
            "first_image_url": first_img,
            "author": (MemoAuthorBrief(
                id=memo.author.id,
                username=memo.author.username,
                avatar_url=memo.author.avatar_url,
            ).model_dump(mode="json") if memo.author else None),
            "tags": [{
                "id": tg.id, "name": tg.name, "slug": tg.slug,
                "scopes": tg.scopes, "created_at": tg.created_at,
            } for tg in memo.tags],
            "liked_by_me": memo.id in liked_ids,
            "favorited_by_me": memo.id in fav_ids,
            "created_at": memo.created_at,
            "updated_at": memo.updated_at,
        })

    return ok(data={"total": total, "items": items, "page": page, "page_size": page_size})