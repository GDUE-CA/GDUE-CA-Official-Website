"""用户个人主页公开 Pydantic 模型。

隐私规则（与 app/api/users.py:_public_profile 对应）：
- 地区字段永久公开（硬性约束，用户不可关闭）；
- bio / gender / birthday 受 profile_privacy JSON 控制，privacy=private 时返回 None；
- gender='hidden' 时即使 privacy=public 也返回 None（用户显式选择「不显示」）；
- real_name 默认不公开：本人恒返回；非本人仅当 profile_privacy.real_name=="public" 返回。
"""
from app.schemas.badge import BadgeOut
from app.schemas.common import UTCDatetime
from pydantic import BaseModel


class UserProfileOut(BaseModel):
    """用户公开个人主页信息（隐私过滤后；不含内部用户 id，前台一律以 username 寻址）。"""
    username: str
    display_name: str
    avatar_url: str | None = None
    # 真实姓名：隐私受控（本人恒可见；访客仅当开关开启时后端才输出）
    real_name: str | None = None
    # ---- Module D：身份标签 + 学校信息（隐私受控，默认不输出） ----
    identity_school_verified: bool = False
    is_club_member: bool = False
    # 仅本人 或（已验证 且 开关开启）时输出：{student_id, college_name, major_name,
    # grade_year, class_display_name, ...}；未验证恒为 null（前端整块不渲染）
    school_info: dict | None = None
    bio: str | None = None
    gender: str | None = None
    birthday: UTCDatetime | None = None
    # 用户徽章（系统徽章动态计算 + 自定义徽章）
    badges: list[BadgeOut] = []
    # ---- 个人主页外观（V0.5.5 §9）：公开装饰字段，不走隐私过滤 ----
    profile_banner: str | None = None
    profile_banner_color: str | None = None
    # V0.6.1 需求5：主页隐藏标记（管理员处罚）。访客看到「主页不可见」提示；
    # 隐藏时访客仅返回最小字段（不泄露内部信息），本人 / 管理员仍可查看完整内容。
    profile_hidden: bool = False
    # ---- 社交关注（V0.5.5 §9.2）：未登录访问者 is_following/is_friends 为 None ----
    follower_count: int = 0
    following_count: int = 0
    is_following: bool | None = None   # 访问者 → 目标用户
    follows_me: bool | None = None     # 目标用户 → 访问者
    is_friend: bool | None = None      # 双向互关（好友）
    # ---- 地区字段（永久公开） ----
    country: str | None = None
    region: str | None = None
    locality: str | None = None
    country_code: str | None = None
    subdiv1_code: str | None = None
    subdiv2_code: str | None = None
    locality_text: str | None = None
    created_at: UTCDatetime

    model_config = {"from_attributes": True}
