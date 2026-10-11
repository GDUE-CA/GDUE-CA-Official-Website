/**
 * 国际化配置
 * 定义支持的语言列表、默认语言、语言显示名称
 * 规范：所有语言标识统一使用全小写形式（如 zh-cn、en-gb），全链路一致
 */

export const locales = ["zh-cn", "zh-tw", "zh-hk", "en-us", "en-gb", "ja"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "zh-cn";

/** 语言显示名称（用于语言切换下拉） */
export const localeNames: Record<Locale, string> = {
  "zh-cn": "简体中文",
  "zh-tw": "繁體中文（台灣）",
  "zh-hk": "繁體中文（香港）",
  "en-us": "English (US)",
  "en-gb": "English (UK)",
  ja: "日本語",
};

/** 语言对应的 HTML lang 属性（统一小写） */
export const localeHtmlLang: Record<Locale, string> = {
  "zh-cn": "zh-cn",
  "zh-tw": "zh-tw",
  "zh-hk": "zh-hk",
  "en-us": "en-us",
  "en-gb": "en-gb",
  ja: "ja",
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
