"""本地化解析工具（通用层，零社团业务逻辑，可直接迁移至任意 SaaS/企业系统）。

核心函数 resolve_localization(user, request, db, is_break_glass) 实现三级优先级：
  用户个人设置（users 表，非空优先） > URL 路径 locale（仅 UI 翻译文字） > 系统全局默认（sys_config）

严格分离两件事：
  1. ui_locale —— 控制 UI 界面翻译文字（按钮、菜单文案）
  2. region_code / tz / currency —— 控制区域格式化规则（日期、星期起始、长短日期、时间、数字、货币）

匿名访客：UI 翻译与格式化均跟随 URL-locale；tz/currency 回退系统默认。
Break-Glass：无 users 表记录，全部直取 sys_config；URL 可临时切 UI 翻译但不持久化。
登录用户：字段非空赢，NULL 回退 sys_config。

永不 raise：sys_config 取失败兜底 Asia/Shanghai / zh-cn / CN / CNY。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.core.locales import (
    DEFAULT_CURRENCY,
    DEFAULT_LOCALE,
    DEFAULT_REGION,
    DEFAULT_TIMEZONE,
    LOCALE_TO_REGION,
    normalize_locale,
)

if TYPE_CHECKING:
    from fastapi import Request
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.db.models import User


# X-Locale 请求头名（前端 fetcher 给所有 /api/* 请求注入）
X_LOCALE_HEADER = "X-Locale"


@dataclass(frozen=True)
class LocalizationResult:
    """本地化解析结果：4 项互不联动的设置。"""

    ui_locale: str      # UI 界面翻译语言（如 zh-cn / en-gb）
    timezone: str       # IANA 时区（如 Asia/Shanghai）
    region_code: str     # ISO-3166-1 二位，驱动日期/数字格式化
    currency: str        # ISO-4217 货币代码


async def _fetch_sys_defaults(db: "AsyncSession | None") -> tuple[str, str, str, str]:
    """从 SystemSetting 读取 4 项全局默认；取失败/缺行返回硬编码兜底。永不 raise。"""
    if db is None:
        return DEFAULT_LOCALE, DEFAULT_TIMEZONE, DEFAULT_REGION, DEFAULT_CURRENCY
    try:
        from app.db.models import SystemSetting
        ss = await db.get(SystemSetting, 1)
        if ss is None:
            return DEFAULT_LOCALE, DEFAULT_TIMEZONE, DEFAULT_REGION, DEFAULT_CURRENCY
        return (
            ss.sys_default_locale or DEFAULT_LOCALE,
            ss.sys_default_timezone or DEFAULT_TIMEZONE,
            ss.sys_default_region or DEFAULT_REGION,
            ss.sys_default_currency or DEFAULT_CURRENCY,
        )
    except Exception:
        return DEFAULT_LOCALE, DEFAULT_TIMEZONE, DEFAULT_REGION, DEFAULT_CURRENCY


def _url_locale_from_request(request: "Request | None") -> str | None:
    """从 X-Locale 请求头取当前 URL locale（前端 fetcher 注入）；非法或缺失返回 None。"""
    if request is None:
        return None
    raw = request.headers.get(X_LOCALE_HEADER)
    if not raw:
        return None
    return normalize_locale(raw)


async def resolve_localization(
    user: "User | None",
    request: "Request | None" = None,
    db: "AsyncSession | None" = None,
    is_break_glass: bool = False,
) -> LocalizationResult:
    """解析当前请求的本地化设置。

    Args:
        user: 登录用户对象；匿名访客传 None
        request: FastAPI Request（用于读 X-Locale 头获取匿名访客的 URL locale）
        db: 异步会话（用于读 SystemSetting 全局默认；None 时用硬编码兜底）
        is_break_glass: 是否为 Break-Glass 应急账号（无 users 表记录，直取 sys_config）

    Returns:
        LocalizationResult(ui_locale, timezone, region_code, currency)
    """
    sys_locale, sys_tz, sys_region, sys_currency = await _fetch_sys_defaults(db)
    url_locale = _url_locale_from_request(request)

    # 1) Break-Glass 应急账号：无 users 表记录，全部直取 sys_config
    #    URL 可临时切 UI 翻译，但无法持久保存个人偏好
    if is_break_glass:
        ui_locale = url_locale or sys_locale
        return LocalizationResult(
            ui_locale=ui_locale,
            timezone=sys_tz,
            region_code=sys_region,
            currency=sys_currency,
        )

    # 2) 匿名访客：UI 翻译与格式化跟随 URL-locale；tz/currency 回退系统默认
    if user is None:
        ui_locale = url_locale or sys_locale
        # 格式化 region 跟随 URL-locale（如有）；否则 sys 默认
        region = url_locale or sys_region
        return LocalizationResult(
            ui_locale=ui_locale,
            timezone=sys_tz,
            region_code=region,
            currency=sys_currency,
        )

    # 3) 登录用户：字段非空赢，NULL 回退 sys_config
    ui_locale = user.locale if user.locale else sys_locale
    tz = user.timezone if user.timezone else sys_tz
    region = user.region_code if user.region_code else sys_region
    currency = user.currency if user.currency else sys_currency
    return LocalizationResult(
        ui_locale=ui_locale,
        timezone=tz,
        region_code=region,
        currency=currency,
    )


def locale_to_region(locale_id: str) -> str:
    """locale → ISO-3166-1 region_code 映射（「切换语言同步更新区域」复选框用）。

    不在映射表内的 locale 返回 DEFAULT_REGION。
    """
    return LOCALE_TO_REGION.get(locale_id, DEFAULT_REGION)
