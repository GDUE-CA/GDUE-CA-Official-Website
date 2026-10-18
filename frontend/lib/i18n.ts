/**
 * 国际化配置（单一真值源）
 *
 * 规范约束（本地化系统，2026-10-13 版）：
 * - 语言列表由 next.config.ts 扫描 i18n/messages/*.json 自动生成
 *   （见 lib/i18n/locales.generated.ts），禁止硬编码语言清单；
 * - URL 访问不存在的 locale 文件时由 proxy 回退兜底 zh-cn；
 * - 变体语言缺失/空字符串词条沿 localeFallbackChain 回退：亚洲语言（zh/ja/ko）
 *   最终兜底 zh-cn，欧美/拉丁系语言最终兜底 en-gb（双基准语言：zh-cn + en-gb）；
 * - UI 翻译语言与区域格式化（日期/货币/数字）严格分离，二者可独立选择；
 * - 语言显示名/英文名/地区分组均由 locale 码经 Intl.DisplayNames 派生，不再维护静态映射；
 * - 此处 locales 是中间件、i18n 初始化、语言选择器、sitemap、hreflang 的唯一来源。
 */
import {
  locales,
  dictionaryLoaders,
  type Locale,
} from "@/lib/i18n/locales.generated";

export { locales, dictionaryLoaders };
export type { Locale };

export const defaultLocale: Locale = "zh-cn";

/** supportedLocales 别名（语义清晰，供外部消费） */
export const supportedLocales = locales;

/** 变体回退映射：变体缺失词条时回退到父语言（链式解析，终态语言按分组兜底 zh-cn / en-gb） */
export const localeFallbackMap: Partial<Record<Locale, Locale>> = {
  "zh-mo": "zh-hk",
  "en-us": "en-gb",
};

/** 分组终态兜底语言：东亚（中/日/韩）→ zh-cn；欧美/拉丁系 → en-gb */
function terminalFallback(loc: Locale): Locale {
  return localeGroup(loc) === "eastAsia" ? "zh-cn" : "en-gb";
}

/**
 * 回退链：自身 → 父语言 → … → 分组终态语言（zh-cn 或 en-gb）。
 * 任一语言某 key 为空字符串/缺失时沿链自动回退，防页面空白。
 */
export function localeFallbackChain(loc: Locale): Locale[] {
  const chain: Locale[] = [loc];
  let cur = loc;
  for (;;) {
    const parent = localeFallbackMap[cur];
    if (!parent || chain.includes(parent)) break;
    chain.push(parent);
    cur = parent;
  }
  const terminal = terminalFallback(loc);
  if (chain[chain.length - 1] !== terminal) chain.push(terminal);
  return chain;
}

/** 语言地区分组（语言选择器分组展示） */
export type LocaleGroup = "eastAsia" | "europeAmericas";

/** 分组展示顺序（空分组渲染时自动跳过） */
export const localeGroupOrder: readonly LocaleGroup[] = [
  "eastAsia",
  "europeAmericas",
];

/** 语言分组：东亚（中/日/韩）与欧美及其他 */
export function localeGroup(loc: Locale): LocaleGroup {
  return /^(zh|ja|ko)/.test(loc) ? "eastAsia" : "europeAmericas";
}

const displayNameCache = new Map<string, string>();

/** 语言本地名（如 "Deutsch"、"简体中文"）：Intl.DisplayNames 以该语言自身渲染；失败/恒等回退语言码 */
export function localeDisplayName(loc: string): string {
  const key = `native:${loc}`;
  const cached = displayNameCache.get(key);
  if (cached) return cached;
  let name = loc;
  try {
    const resolved = new Intl.DisplayNames([loc], { type: "language" }).of(loc);
    if (resolved && resolved.toLowerCase() !== loc.toLowerCase()) name = resolved;
  } catch {
    /* ICU 无该码数据时回退语言码 */
  }
  displayNameCache.set(key, name);
  return name;
}

/** 语言英文名（语言选择器搜索用；失败回退语言码） */
export function localeEnglishName(loc: string): string {
  const key = `en:${loc}`;
  const cached = displayNameCache.get(key);
  if (cached) return cached;
  let name = loc;
  try {
    name = new Intl.DisplayNames(["en"], { type: "language" }).of(loc) ?? loc;
  } catch {
    /* ICU 无该码数据时回退语言码 */
  }
  displayNameCache.set(key, name);
  return name;
}

/** locale → ISO-3166-1 region_code（末段两位字母大写；「切换语言同步更新区域」复选框用） */
export function localeToRegion(loc: string): string {
  const seg = loc.split("-").pop() ?? "";
  return /^[a-z]{2}$/.test(seg) ? seg.toUpperCase() : "CN";
}

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
  return (locales as readonly string[]).includes(lower)
    ? (lower as Locale)
    : null;
}
