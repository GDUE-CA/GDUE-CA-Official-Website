"""用户徽章 Pydantic 模型。

徽章纯 UI 展示装饰，与权限彻底解耦：
- 系统徽章（type=system）：不入库，按 club_position/role 动态计算，只输出 key；
- 自定义徽章（type=custom）：存 user_badges 表，管理员维护，单用户 ≤3 枚 active。
"""
import re

from pydantic import BaseModel, field_validator

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


class BadgeOut(BaseModel):
    """对外统一徽章输出：系统徽章仅 key；自定义徽章带展示属性。"""
    type: str                      # "system" | "custom"
    key: str | None = None         # system：president / vice_president / admin / member
    id: int | None = None          # custom：user_badges.id
    name: str | None = None        # custom：显示文字（入库前已剥 HTML）
    emoji: str | None = None
    bg_color: str | None = None
    text_color: str | None = None


class CustomBadgeIn(BaseModel):
    """新增自定义徽章。"""
    name: str
    emoji: str | None = None
    bg_color: str = "#6366f1"
    text_color: str = "#ffffff"

    @field_validator("name")
    @classmethod
    def _v_name(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 32:
            raise ValueError("徽章名称长度需为 1-32 字符")
        return v

    @field_validator("emoji")
    @classmethod
    def _v_emoji(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        if len(v) > 8:
            raise ValueError("emoji 长度超限")
        return v

    @field_validator("bg_color", "text_color")
    @classmethod
    def _v_color(cls, v: str) -> str:
        if not _HEX_COLOR.match(v):
            raise ValueError("颜色须为 #RRGGBB 格式")
        return v.lower()


class CustomBadgeUpdate(BaseModel):
    """修改自定义徽章（全部可选，传啥改啥）。"""
    name: str | None = None
    emoji: str | None = None
    bg_color: str | None = None
    text_color: str | None = None
    is_active: bool | None = None

    _v_name = field_validator("name")(CustomBadgeIn._v_name.__func__)
    _v_emoji = field_validator("emoji")(CustomBadgeIn._v_emoji.__func__)
    _v_color = field_validator("bg_color", "text_color")(CustomBadgeIn._v_color.__func__)


class BadgeReorderIn(BaseModel):
    """整体排序：提交该用户全部自定义徽章 id 的目标顺序。"""
    ids: list[int]


class AdminBadgeListOut(BaseModel):
    """后台徽章管理：系统徽章只读 key + 自定义徽章完整记录。"""
    system_key: str | None
    custom: list[dict]
