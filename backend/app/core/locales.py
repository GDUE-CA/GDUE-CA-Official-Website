"""本地化常量与校验工具（通用层，零社团业务逻辑，可直接迁移至任意 SaaS/企业系统）。

定义支持的 UI 界面语言列表、变体回退映射、locale→region_code 映射，
以及 locale / region_code / currency 的校验函数。

规范约束（本地化系统，2026-10-13 版）：
- 19 门语言，URL 路径全小写横杠分隔；
- 变体语言缺失词条沿回退链按分组兜底：亚洲语言（zh/ja/ko）落到 zh-cn，
  欧美/拉丁系语言落到 en-gb（双基准语言：zh-cn + en-gb）；
- 时区一律 IANA 标识符（如 Asia/Shanghai），禁止存 ±偏移量；
- region_code 为 ISO-3166-1 二位国家/地区代码（如 CN/US/JP）；
- currency 为 ISO-4217 货币代码（如 CNY/USD/EUR）。
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LocaleMeta:
    """单条语言元信息（与前端 lib/i18n 单一源数据保持一致）。"""

    id: str
    native_name: str
    english_name: str
    # 变体回退目标；None = 无特殊回退（缺失词条按分组终态落到 zh-cn / en-gb）
    fallback: str | None
    # locale → ISO-3166-1 二位 region_code（「切换语言同步更新区域」复选框用）
    region_code: str


# 唯一源：支持的全部 19 门 UI 界面语言
SUPPORTED_LOCALES: tuple[LocaleMeta, ...] = (
    LocaleMeta("zh-cn", "简体中文（中国大陆）", "Simplified Chinese (China)", None, "CN"),
    LocaleMeta("zh-cn-sg", "简体中文（新加坡）", "Simplified Chinese (Singapore)", "zh-cn", "SG"),
    LocaleMeta("zh-hk", "繁體中文（中國香港）", "Traditional Chinese (Hong Kong)", None, "HK"),
    LocaleMeta("zh-mo", "繁體中文（中國澳門）", "Traditional Chinese (Macao)", "zh-hk", "MO"),
    LocaleMeta("zh-yue-cn", "简体粤语", "Cantonese (Simplified)", "zh-cn", "CN"),
    LocaleMeta("zh-yue-tw", "繁體廣東話", "Cantonese (Traditional)", "zh-hk", "TW"),
    LocaleMeta("en-gb", "English (UK)", "English (United Kingdom)", None, "GB"),
    LocaleMeta("en-us", "English (US)", "English (United States)", "en-gb", "US"),
    LocaleMeta("ja-jp", "日本語", "Japanese (Japan)", None, "JP"),
    LocaleMeta("ko-kr", "한국어", "Korean (South Korea)", None, "KR"),
    LocaleMeta("es-es", "Español", "Spanish (Spain)", None, "ES"),
    LocaleMeta("fr-fr", "Français", "French (France)", None, "FR"),
    LocaleMeta("de-de", "Deutsch", "German (Germany)", None, "DE"),
    LocaleMeta("ru-ru", "Русский", "Russian (Russia)", None, "RU"),
    LocaleMeta("pt-br", "Português (Brasil)", "Portuguese (Brazil)", None, "BR"),
    LocaleMeta("ar-sa", "العربية", "Arabic (Saudi Arabia)", None, "SA"),
    LocaleMeta("hi-in", "हिन्दी", "Hindi (India)", None, "IN"),
    LocaleMeta("tr-tr", "Türkçe", "Turkish (Türkiye)", None, "TR"),
    LocaleMeta("it-it", "Italiano", "Italian (Italy)", None, "IT"),
)

# 支持的 locale id 列表（用于快速 contains 判断）
SUPPORTED_LOCALE_IDS: frozenset[str] = frozenset(m.id for m in SUPPORTED_LOCALES)

# 变体回退映射（前端 i18n 字典深合并用；后端格式化兜底用）
LOCALE_FALLBACK_MAP: dict[str, str] = {
    m.id: m.fallback for m in SUPPORTED_LOCALES if m.fallback is not None
}

# locale → region_code 映射（「切换语言同步更新区域」复选框用）
LOCALE_TO_REGION: dict[str, str] = {m.id: m.region_code for m in SUPPORTED_LOCALES}

# 最终兜底语言（无变体回退且词条缺失时落到此处）
DEFAULT_LOCALE: str = "zh-cn"
DEFAULT_REGION: str = "CN"
DEFAULT_TIMEZONE: str = "Asia/Shanghai"
DEFAULT_CURRENCY: str = "CNY"

# 支持的 ISO-4217 货币代码白名单（可扩展）
SUPPORTED_CURRENCIES: frozenset[str] = frozenset({
    "CNY", "USD", "EUR", "GBP", "JPY", "KRW", "HKD", "SGD", "TWD", "RUB",
})


def validate_locale(value: str) -> bool:
    """校验 locale id 是否在支持列表内（大小写不敏感，内部归一小写比较）。"""
    return value.lower() in SUPPORTED_LOCALE_IDS


def normalize_locale(value: str) -> str | None:
    """归一 locale 为支持的 id；不支持的返回 None。"""
    v = value.lower()
    return v if v in SUPPORTED_LOCALE_IDS else None


def validate_region_code(value: str) -> bool:
    """校验 ISO-3166-1 二位国家/地区代码（仅基本格式校验，不查官方注册表）。"""
    v = value.upper()
    return len(v) == 2 and v.isalpha()


def validate_currency(value: str) -> bool:
    """校验 ISO-4217 货币代码是否在白名单内。"""
    return value.upper() in SUPPORTED_CURRENCIES
