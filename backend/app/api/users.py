"""用户个人主页公开接口（/api/users/{username}/*）。

任何访客（含未登录）可查看他人个人主页：
- 地区字段（country/region/country_code/locality_text）100% 永久公开（硬性约束）；
- bio/gender/birthday 受 profile_privacy JSON 控制（默认 public）；
  gender='hidden' 时即使 privacy=public 也不展示（用户显式选择「不显示」）；
- 仅返回 public 可见性 Memo（不含 member_only/private）；
- 仅返回 status=published 的博客（草稿/定时/归档不暴露）。
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    BlogPost,
    BlogPostStatus,
    Memo,
    MemoVisibility,
    User,
)
from app.db.session import get_db
from app.schemas.blog import BlogPostBriefOut
from app.schemas.memo import MemoBriefOut
from app.schemas.users import UserProfileOut
from app.utils.crud import paginate

router = APIRouter(prefix="/api/users", tags=["users-public"])


def _privacy_allows(user: User, field: str) -> bool:
    """profile_privacy.<field> 是否允许公开；默认 public。"""
    p = (user.profile_privacy or {}) if user else {}
    return p.get(field, "public") != "private"


async def _load_user_or_404(db: AsyncSession, username: str) -> User:
    """按 username 加载未软删用户；不存在 / 已软删 → 404。"""
    u = (await db.execute(
        select(User).where(User.username == username, User.is_deleted.is_(False))
    )).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    return u


def _public_profile(u: User) -> dict:
    """构建公开个人主页信息（隐私过滤 + 地区永久公开）。"""
    profile = {
        "id": u.id,
        "username": u.username,
        "display_name": u.display_name or u.username,
        "avatar_url": u.avatar_url,
        "created_at": u.created_at,
        # 地区字段永久公开（硬性约束）
        "country": u.country,
        "region": u.region,
        "locality": u.locality,
        "country_code": u.country_code,
        "subdiv1_code": u.subdiv1_code,
        "subdiv2_code": u.subdiv2_code,
        "locality_text": u.locality_text,
    }
    # bio：privacy=public 才展示
    if _privacy_allows(u, "bio"):
        profile["bio"] = u.bio
    else:
        profile["bio"] = None
    # gender：privacy=public 且 gender != 'hidden' 才展示
    if _privacy_allows(u, "gender") and u.gender and u.gender != "hidden":
        profile["gender"] = u.gender
    else:
        profile["gender"] = None
    # birthday：privacy=public 才展示
    if _privacy_allows(u, "birthday"):
        profile["birthday"] = u.birthday
    else:
        profile["birthday"] = None
    return profile


@router.get("/{username}/profile", response_model=UserProfileOut)
async def get_user_profile(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    """用户个人主页基本信息（隐私过滤后）。"""
    u = await _load_user_or_404(db, username)
    return _public_profile(u)


@router.get("/{username}/memos", response_model=dict)
async def list_user_memos(
    username: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """用户个人主页公开 Memo 列表：仅 visibility=public 且未归档/未下架/未软删。"""
    u = await _load_user_or_404(db, username)
    stmt = select(Memo).where(
        Memo.author_id == u.id,
        Memo.visibility == MemoVisibility.PUBLIC,
        Memo.archived.is_(False),
        Memo.admin_removed.is_(False),
        Memo.deleted_at.is_(None),
    ).order_by(Memo.created_at.desc())
    return await paginate(db, stmt, page, page_size, out_model=MemoBriefOut)


@router.get("/{username}/blog", response_model=dict)
async def list_user_blog(
    username: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """用户个人主页公开博客列表：仅 status=published。"""
    u = await _load_user_or_404(db, username)
    stmt = select(BlogPost).where(
        BlogPost.author_id == u.id,
        BlogPost.status == BlogPostStatus.PUBLISHED,
    ).order_by(BlogPost.published_at.desc())
    return await paginate(db, stmt, page, page_size, out_model=BlogPostBriefOut)
