"""用户个人主页公开 API（无鉴权）。

任何访客（含未登录）可查看他人个人主页：
- 地区字段（country/region/country_code/locality_text）100% 永久公开（硬性约束）；
- bio/gender/birthday 受 profile_privacy JSON 控制（默认 public）；
  gender='hidden' 时即使 privacy=public 也不展示（用户显式选择「不显示」）；
- real_name 默认不公开：本人恒返回；非本人仅当 profile_privacy.real_name=="public" 返回；
- 个人主页说说 Tab 按访问者身份过滤可见性：
  本人 / 管理员 / Break-Glass → 全部可见性；在册社团成员 → public+member_only；
  其余（匿名 / 外部注册用户）→ 仅 public；
- 仅返回 status=published 的博客（草稿/定时/归档不暴露）；
- 用户徽章随 profile / memo author 输出（系统徽章动态计算 + 自定义徽章）。
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.badges import badges_for_user, is_club_member
from app.core.security import Role, get_optional_user, require_role
from app.db.models import (
    BlogPost,
    BlogPostStatus,
    Memo,
    MemoVisibility,
    SysClass,
    SysCollege,
    SysGrade,
    SysMajor,
    User,
    UserFollow,
)
from app.db.session import get_db
from app.api.memos import _fill_attachment_rows, _liked_fav_ids, _memo_brief_dict
from app.schemas.blog import BlogPostBriefOut
from app.schemas.users import UserProfileOut
from app.utils.crud import paginate

router = APIRouter(prefix="/api/users", tags=["users-public"])

# 个人主页说说：管理 tier（无条件全量可见）的角色集合
_FULL_ACCESS_ROLES = {Role.SUPER_ADMIN.value, Role.ADMIN.value}


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


def _is_self(viewer_ctx: dict | None, owner: User) -> bool:
    """访问者=本人（BG 会话无 user_id，恒非本人）。"""
    return bool(viewer_ctx) and viewer_ctx.get("user_id") == str(owner.id)


async def _school_info(db: AsyncSession, u: User) -> dict | None:
    """学校信息块（通过外键联表查询展示学院/专业文本；未验证恒为 None）。

    输出条件由调用方判定（本人 或 隐私开关开启）；此处只负责联表组装。
    """
    if not u.identity_school_verified:
        return None
    info: dict = {"student_id": u.student_id}
    college = major = grade = cls = None
    if u.college_id:
        college = await db.get(SysCollege, u.college_id)
    if u.major_id:
        major = await db.get(SysMajor, u.major_id)
    if u.grade_id:
        grade = await db.get(SysGrade, u.grade_id)
    if u.class_id:
        cls = await db.get(SysClass, u.class_id)
    info.update({
        "college_id": u.college_id,
        "major_id": u.major_id,
        "grade_id": u.grade_id,
        "class_id": u.class_id,
        "college_name": college.college_name if college else None,
        "major_name": major.major_name if major else None,
        "grade_year": grade.grade_year if grade else None,
        "class_display_name": cls.display_name if cls else None,
    })
    return info


def _public_profile(u: User, viewer_ctx: dict | None, badges: list[dict],
                    school_info: dict | None = None) -> dict:
    """构建公开个人主页信息（隐私过滤 + 地区永久公开 + real_name/school_info 受控）。"""
    profile = {
        "username": u.username,
        "display_name": u.display_name or u.username,
        "avatar_url": u.avatar_url,
        "created_at": u.created_at,
        "badges": badges,
        # ---- 个人主页外观（V0.5.5 §9.3）：公开装饰字段，不走隐私过滤 ----
        "profile_banner": u.profile_banner,
        "profile_banner_color": u.profile_banner_color,
        # 地区字段永久公开（硬性约束）
        "country": u.country,
        "region": u.region,
        "locality": u.locality,
        "country_code": u.country_code,
        "subdiv1_code": u.subdiv1_code,
        "subdiv2_code": u.subdiv2_code,
        "locality_text": u.locality_text,
        # ---- Module D：身份标签（公开展示；社会成员两值恒 False/无标签） ----
        "identity_school_verified": u.identity_school_verified,
        "is_club_member": u.club_position is not None,
        # 学校信息块：本人恒可见；访客需已验证 + 隐私开关开启（后端控制输出，
        # 禁止仅靠 CSS 隐藏实现隐私）
        "school_info": school_info,
    }
    # real_name：本人恒可见；非本人仅当显式开启（默认不公开，语义与 bio 等相反）
    if _is_self(viewer_ctx, u) or (u.profile_privacy or {}).get("real_name") == "public":
        profile["real_name"] = u.real_name
    else:
        profile["real_name"] = None
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


async def _load_viewer(db: AsyncSession, viewer_ctx: dict | None) -> User | None:
    """按 ctx 加载访问者 User 行（判在册成员需 club_position；BG 无 user_id 返回 None）。"""
    if not viewer_ctx or viewer_ctx.get("break_glass"):
        return None
    uid = viewer_ctx.get("user_id")
    if not uid:
        return None
    return await db.get(User, int(uid))


@router.get("/{username}/profile", response_model=UserProfileOut)
async def get_user_profile(
    username: str,
    db: AsyncSession = Depends(get_db, scope="function"),
    viewer_ctx: dict | None = Depends(get_optional_user),
):
    """用户个人主页基本信息（隐私过滤后；real_name/school_info 按访问者身份+开关输出）。"""
    u = await _load_user_or_404(db, username)
    badges = await badges_for_user(db, u)
    # 学校信息：本人永远可见；访客需已验证 + 隐私开关开启（默认关闭）
    school_info = None
    if _is_self(viewer_ctx, u) or (u.profile_privacy or {}).get("school_info") == "public":
        school_info = await _school_info(db, u)
    profile = _public_profile(u, viewer_ctx, badges, school_info=school_info)
    # ---- 社交关注（V0.5.5 §9.2）：计数恒有；方向/好友状态仅登录的非本人访问者有意义 ----
    profile.update(await _follow_stats(db, u, viewer_ctx))
    return profile


# ---------- 社交关注（V0.5.5 §9.2）：单向关注；双向互关自动视为好友 ----------
async def _follow_stats(db: AsyncSession, u: User, viewer_ctx: dict | None) -> dict:
    """关注计数 + 访问者视角关系状态。未登录 / BG / 本人 → 三个关系字段为 None。"""
    follower_count = (await db.execute(
        select(func.count()).select_from(UserFollow).where(UserFollow.followee_id == u.id)
    )).scalar_one()
    following_count = (await db.execute(
        select(func.count()).select_from(UserFollow).where(UserFollow.follower_id == u.id)
    )).scalar_one()

    viewer_id: int | None = None
    if viewer_ctx and not viewer_ctx.get("break_glass"):
        raw = viewer_ctx.get("user_id")
        viewer_id = int(raw) if raw else None
    if viewer_id is None or viewer_id == u.id:
        return {
            "follower_count": follower_count,
            "following_count": following_count,
            "is_following": None,
            "follows_me": None,
            "is_friend": None,
        }
    following = (await db.execute(
        select(UserFollow.id).where(
            UserFollow.follower_id == viewer_id, UserFollow.followee_id == u.id).limit(1)
    )).scalar_one_or_none() is not None
    followed = (await db.execute(
        select(UserFollow.id).where(
            UserFollow.follower_id == u.id, UserFollow.followee_id == viewer_id).limit(1)
    )).scalar_one_or_none() is not None
    return {
        "follower_count": follower_count,
        "following_count": following_count,
        "is_following": following,
        "follows_me": followed,
        "is_friend": following and followed,  # 双向互关 = 好友（EXISTS 判定，不拉全量）
    }


def _viewer_user_id(user: dict) -> int:
    """提取登录用户 ID；BG / 异常会话直接 403（BG 无 users 行，无社交身份）。"""
    raw = user.get("user_id")
    if user.get("break_glass") or not raw:
        raise HTTPException(status_code=403, detail="该操作不适用于当前账号")
    return int(raw)


@router.post("/{username}/follow")
async def follow_user(
    username: str,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """关注用户（单向）。重复关注幂等返回；禁止自关。"""
    me_id = _viewer_user_id(user)
    target = await _load_user_or_404(db, username)
    if me_id == target.id:
        raise HTTPException(status_code=400, detail="不能关注自己")
    existing = (await db.execute(
        select(UserFollow.id).where(
            UserFollow.follower_id == me_id, UserFollow.followee_id == target.id).limit(1)
    )).scalar_one_or_none()
    if existing:
        return {"ok": True, "following": True, "already": True}
    db.add(UserFollow(follower_id=me_id, followee_id=target.id))
    await db.commit()
    return {"ok": True, "following": True}


@router.delete("/{username}/follow")
async def unfollow_user(
    username: str,
    user: dict = Depends(require_role(Role.MEMBER)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """取消关注（幂等：未关注时返回 ok=False 状态不变）。"""
    me_id = _viewer_user_id(user)
    target = await _load_user_or_404(db, username)
    result = await db.execute(
        delete(UserFollow).where(
            UserFollow.follower_id == me_id, UserFollow.followee_id == target.id)
    )
    await db.commit()
    return {"ok": True, "following": False, "removed": result.rowcount}


@router.get("/{username}/memos", response_model=dict)
async def list_user_memos(
    username: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db, scope="function"),
    viewer_ctx: dict | None = Depends(get_optional_user),
):
    """用户个人主页说说列表：按访问者身份过滤可见性（归档/下架/软删恒过滤）。

    - 本人 / 管理员 / Break-Glass：public + member_only + private 全部可见；
    - 在册社团成员（职务非空或管理 tier）：public + member_only；
    - 其余（匿名 / 外部注册用户）：仅 public。
    """
    u = await _load_user_or_404(db, username)

    conditions = [
        Memo.author_id == u.id,
        Memo.archived.is_(False),
        Memo.admin_removed.is_(False),
        Memo.deleted_at.is_(None),
    ]
    full_access = (
        _is_self(viewer_ctx, u)
        or (viewer_ctx or {}).get("break_glass")
        or (viewer_ctx or {}).get("role") in _FULL_ACCESS_ROLES
    )
    if not full_access:
        viewer = await _load_viewer(db, viewer_ctx)
        if viewer is not None and is_club_member(viewer):
            conditions.append(or_(
                Memo.visibility == MemoVisibility.PUBLIC,
                Memo.visibility == MemoVisibility.MEMBER_ONLY,
            ))
        else:
            conditions.append(Memo.visibility == MemoVisibility.PUBLIC)

    stmt = select(Memo).where(*conditions).order_by(Memo.created_at.desc())
    # 裸 ORM 行分页：MemoBriefOut 的 excerpt/has_image 等为计算字段，不能直接 model_validate
    result = await paginate(db, stmt, page, page_size)

    rows = result["items"]
    uid = (viewer_ctx or {}).get("user_id")
    if uid is not None and rows:
        liked_ids, fav_ids = await _liked_fav_ids(db, uid, [m.id for m in rows])
    else:
        liked_ids, fav_ids = set(), set()
    att_map = await _fill_attachment_rows(db, [m.id for m in rows])

    # _memo_brief_dict 内部已完成作者 display_name / 徽章组装（db 传入时）
    result["items"] = [
        await _memo_brief_dict(
            m, liked_ids, fav_ids,
            next((a.url for a in att_map.get(m.id, []) if a.kind == "image"), None),
            any(a.kind == "image" for a in att_map.get(m.id, [])),
            db=db,
        )
        for m in rows
    ]
    return result


@router.get("/{username}/blog", response_model=dict)
async def list_user_blog(
    username: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """用户个人主页公开博客列表：仅 status=published。"""
    u = await _load_user_or_404(db, username)
    stmt = select(BlogPost).where(
        BlogPost.author_id == u.id,
        BlogPost.status == BlogPostStatus.PUBLISHED,
    ).order_by(BlogPost.published_at.desc())
    return await paginate(db, stmt, page, page_size, out_model=BlogPostBriefOut)
