"""界面主题 Pydantic 模型（公开列表 / 管理 CRUD）。

css_vars / dark_vars 为 CSS 自定义属性包：键须 ^--[a-z0-9-]+$，
值禁止 url( / expression( / javascript: / <（防 CSS 注入）。
"""
import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import PlainText, UTCDatetime

# 主题 key：小写字母开头 + 小写字母/数字/连字符（与 User.theme 校验一致）
THEME_KEY_PATTERN = r"^[a-z][a-z0-9-]{0,31}$"
_THEME_KEY_RE = re.compile(THEME_KEY_PATTERN)
# CSS 变量键
_CSS_VAR_KEY_RE = re.compile(r"^--[a-z0-9-]+$")
# CSS 变量值黑名单（防注入）
_CSS_VAR_VALUE_RE = re.compile(r"url\(|expression\(|javascript:|<", re.IGNORECASE)

_MAX_VARS = 100

ThemeLayoutLiteral = Literal["microsoft", "apple"]


def _validate_css_vars(v: dict | None) -> dict | None:
    """CSS 变量包校验：≤100 项；键合法；值为 ≤200 非空字符串且无危险内容。"""
    if v is None:
        return v
    if not isinstance(v, dict):
        raise ValueError("CSS 变量包须为对象")
    if len(v) > _MAX_VARS:
        raise ValueError(f"CSS 变量包最多 {_MAX_VARS} 项")
    for k, val in v.items():
        if not _CSS_VAR_KEY_RE.match(k):
            raise ValueError(f"非法 CSS 变量名：{k}")
        if not isinstance(val, str) or not val.strip() or len(val) > 200:
            raise ValueError(f"CSS 变量 {k} 的值须为 1-200 字符非空字符串")
        if _CSS_VAR_VALUE_RE.search(val):
            raise ValueError(f"CSS 变量 {k} 的值包含危险内容")
    return v


class ThemeCreate(BaseModel):
    key: PlainText = Field(min_length=1, max_length=32, pattern=THEME_KEY_PATTERN)
    name: PlainText = Field(min_length=1, max_length=64)
    layout: ThemeLayoutLiteral = "microsoft"
    css_vars: dict = Field(default_factory=dict)
    dark_vars: dict | None = None
    enabled: bool = True
    sort_order: int = Field(default=0, ge=-10000, le=10000)

    _v_css = field_validator("css_vars")(_validate_css_vars)
    _v_dark = field_validator("dark_vars")(_validate_css_vars)


class ThemeUpdate(BaseModel):
    name: PlainText | None = Field(default=None, min_length=1, max_length=64)
    layout: ThemeLayoutLiteral | None = None
    css_vars: dict | None = None
    dark_vars: dict | None = None
    enabled: bool | None = None
    sort_order: int | None = Field(default=None, ge=-10000, le=10000)

    _v_css = field_validator("css_vars")(_validate_css_vars)
    _v_dark = field_validator("dark_vars")(_validate_css_vars)


class ThemeOut(BaseModel):
    id: int
    key: str
    name: str
    layout: str
    css_vars: dict
    dark_vars: dict | None
    enabled: bool
    sort_order: int
    created_at: UTCDatetime
    updated_at: UTCDatetime

    model_config = {"from_attributes": True}
