/**
 * 国际化配置（单一真值源）
 * 定义支持的语言列表、默认语言、语言显示名称、变体回退映射
 *
 * 规范约束（本地化系统）：
 * - 13 门语言，URL 路径全小写横杠分隔；
 * - 变体语言（zh-cn-sg/zh-yue-cn/zh-yue-hk/zh-mo）缺失词条回退 zh-cn（不落英文）；
 * - UI 翻译语言与区域格式化（日期/货币/数字）严格分离，二者可独立选择；
 * - 此处 locales 数组是中间件、i18n 初始化、语言下拉、sitemap、hreflang 的唯一来源。
 */
export const locales = [
  "zh-cn",
  "zh-cn-sg",
  "zh-tw",
  "zh-mo",
  "zh-yue-cn",
  "zh-yue-hk",
  "en-gb",
  "ja-jp",
  "ko-kr",
  "es-es",
  "fr-fr",
  "de-de",
  "ru-ru",
] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "zh-cn";

/** supportedLocales 别名（语义清晰，供外部消费） */
export const supportedLocales = locales;

/** 语言显示名称（用于语言切换下拉） */
export const localeNames: Record<Locale, string> = {
  "zh-cn": "简体中文（中国大陆）",
  "zh-cn-sg": "简体中文（新加坡）",
  "zh-tw": "繁體中文（台灣）",
  "zh-mo": "繁體中文（澳門）",
  "zh-yue-cn": "简体粤语",
  "zh-yue-hk": "繁體廣東話",
  "en-gb": "English (UK)",
  "ja-jp": "日本語",
  "ko-kr": "한국어",
  "es-es": "Español",
  "fr-fr": "Français",
  "de-de": "Deutsch",
  "ru-ru": "Русский",
};

/** 变体回退映射：变体缺失词条时回退到父语言（zh-cn），不落英文 */
export const localeFallbackMap: Partial<Record<Locale, Locale>> = {
  "zh-cn-sg": "zh-cn",
  "zh-mo": "zh-cn",
  "zh-yue-cn": "zh-cn",
  "zh-yue-hk": "zh-cn",
};

/** locale → ISO-3166-1 region_code 映射（「切换语言同步更新区域」复选框用） */
export const localeToRegion: Record<Locale, string> = {
  "zh-cn": "CN",
  "zh-cn-sg": "SG",
  "zh-tw": "TW",
  "zh-mo": "MO",
  "zh-yue-cn": "CN",
  "zh-yue-hk": "HK",
  "en-gb": "GB",
  "ja-jp": "JP",
  "ko-kr": "KR",
  "es-es": "ES",
  "fr-fr": "FR",
  "de-de": "DE",
  "ru-ru": "RU",
};

/** 语言地区分组（语言选择器分组展示） */
export type LocaleGroup = "eastAsia" | "europeAmericas";

/** 语言元数据：本地名 / 英文名（搜索用）/ 地区分组 */
export interface LocaleMeta {
  nativeName: string;
  englishName: string;
  group: LocaleGroup;
}

export const localeMeta: Record<Locale, LocaleMeta> = {
  "zh-cn": { nativeName: "简体中文", englishName: "Simplified Chinese (China)", group: "eastAsia" },
  "zh-cn-sg": { nativeName: "简体中文（新加坡）", englishName: "Simplified Chinese (Singapore)", group: "eastAsia" },
  "zh-tw": { nativeName: "繁體中文（台灣）", englishName: "Traditional Chinese (Taiwan)", group: "eastAsia" },
  "zh-mo": { nativeName: "繁體中文（澳門）", englishName: "Traditional Chinese (Macao)", group: "eastAsia" },
  "zh-yue-cn": { nativeName: "简体粤语", englishName: "Cantonese (Simplified)", group: "eastAsia" },
  "zh-yue-hk": { nativeName: "繁體廣東話", englishName: "Cantonese (Traditional, HK)", group: "eastAsia" },
  "en-gb": { nativeName: "English (UK)", englishName: "English (United Kingdom)", group: "europeAmericas" },
  "ja-jp": { nativeName: "日本語", englishName: "Japanese (Japan)", group: "eastAsia" },
  "ko-kr": { nativeName: "한국어", englishName: "Korean (South Korea)", group: "eastAsia" },
  "es-es": { nativeName: "Español", englishName: "Spanish (Spain)", group: "europeAmericas" },
  "fr-fr": { nativeName: "Français", englishName: "French (France)", group: "europeAmericas" },
  "de-de": { nativeName: "Deutsch", englishName: "German (Germany)", group: "europeAmericas" },
  "ru-ru": { nativeName: "Русский", englishName: "Russian (Russia)", group: "europeAmericas" },
};

/** 分组展示顺序（空分组渲染时自动跳过） */
export const localeGroupOrder: readonly LocaleGroup[] = [
  "eastAsia",
  "europeAmericas",
];

/** 语言对应的 HTML lang 属性（统一小写） */
export const localeHtmlLang: Record<Locale, string> = {
  "zh-cn": "zh-cn",
  "zh-cn-sg": "zh-cn-sg",
  "zh-tw": "zh-tw",
  "zh-mo": "zh-mo",
  "zh-yue-cn": "zh-yue-cn",
  "zh-yue-hk": "zh-yue-hk",
  "en-gb": "en-gb",
  "ja-jp": "ja-jp",
  "ko-kr": "ko-kr",
  "es-es": "es-es",
  "fr-fr": "fr-fr",
  "de-de": "de-de",
  "ru-ru": "ru-ru",
};

/** 判断字符串是否为支持的语言 */
export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Locale → URL 语言段（locale 本身已全小写，直接返回） */
export function localeToUrlLang(locale: Locale): string {
  return locale;
}

/** URL 语言段 → Locale（大小写不敏感，兼容旧链接；非法值返回 null） */
export function urlLangToLocale(value: string): Locale | null {
  const lower = value.toLowerCase();
  return locales.find((l) => l === lower) ?? null;
}
