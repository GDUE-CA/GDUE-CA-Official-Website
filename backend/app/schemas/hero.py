"""首页 Hero 区块配置 Pydantic 模型。

多语言文案一律以 `{locale: text}` 的扁平字典存储；缺失/空串由读取方回退。
"""
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import SafeUrl, UTCDatetime

# 统计卡片最多 4 张（与首页 2×2 数据格布局一致）
MAX_STATS = 4


class HeroTexts(BaseModel):
    """单个语种的 Hero 左侧文本字段。"""
    eyebrow: str = Field(default="", max_length=200)
    title: str = Field(default="", max_length=200)
    subtitle: str = Field(default="", max_length=300)
    description: str = Field(default="", max_length=2000)


class HeroButton(BaseModel):
    """Hero 行动按钮（多语言文案 + 跳转 URL + 启用开关）。"""
    id: str = Field(min_length=1, max_length=64)
    label: dict[str, str] = Field(default_factory=dict)
    href: SafeUrl = ""
    variant: Literal["default", "outline"] = "default"
    enabled: bool = True


class HeroStat(BaseModel):
    """Hero 右侧统计卡片（多语言主数值 + 起始值 + 多语言底部说明）。"""
    value: dict[str, str] = Field(default_factory=dict)
    # 数字滚动起始值（仅当 value 为纯整数时有意义）；NULL = 无滚动动画
    from_value: int | None = None
    label: dict[str, str] = Field(default_factory=dict)
    enabled: bool = True


class HeroOut(BaseModel):
    """管理端：完整 Hero 配置（含全部语种原文，供后台表单编辑）。"""
    background_url: str | None = None
    background_opacity: int = 30
    background_blur: int = 8
    texts: dict[str, HeroTexts] = Field(default_factory=dict)
    buttons: list[HeroButton] = Field(default_factory=list)
    stats: list[HeroStat] = Field(default_factory=list)
    updated_at: UTCDatetime | None = None


class HeroUpdate(BaseModel):
    """管理端：Hero 配置更新请求。"""
    background_url: str | None = Field(default=None, max_length=512)
    background_opacity: int = Field(default=30, ge=0, le=100)
    background_blur: int = Field(default=8, ge=0, le=24)
    texts: dict[str, HeroTexts] = Field(default_factory=dict)
    buttons: list[HeroButton] = Field(default_factory=list)
    stats: list[HeroStat] = Field(default_factory=list)

    @field_validator("stats")
    @classmethod
    def _cap_stats(cls, v: list[HeroStat]) -> list[HeroStat]:
        if len(v) > MAX_STATS:
            raise ValueError(f"统计卡片最多 {MAX_STATS} 张")
        return v


# ---------- 公开接口：按请求 locale 解析后的扁平输出 ----------
class HeroPublicButton(BaseModel):
    id: str
    label: str | None = None
    href: str
    variant: str
    enabled: bool


class HeroPublicStat(BaseModel):
    value: str | None = None
    from_value: int | None = None
    label: str | None = None
    enabled: bool


class HeroPublicOut(BaseModel):
    locale: str
    background_url: str | None = None
    background_opacity: int = 30
    background_blur: int = 8
    eyebrow: str = ""
    title: str = ""
    subtitle: str = ""
    description: str = ""
    buttons: list[HeroPublicButton] = Field(default_factory=list)
    stats: list[HeroPublicStat] = Field(default_factory=list)
