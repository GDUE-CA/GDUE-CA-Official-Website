/**
 * 服务端字典加载器
 * 通过 next/headers 读取当前 URL，从中解析 locale 前缀
 * 动态加载对应语言的翻译；变体语言缺失词条自动深合并父语言（zh-cn）
 */
import { headers } from "next/headers";
import type { Locale } from "@/lib/i18n";
import {
  isLocale,
  defaultLocale,
  locales,
  localeFallbackMap,
} from "@/lib/i18n";

/** 翻译消息类型（从 zh-cn.json 推断） */
export type Messages = typeof import("@/i18n/messages/zh-cn.json");

/** 字典加载器映射（键与 lib/i18n.ts locales 一一对应，全小写） */
const dictionaries = {
  "zh-cn": () => import("@/i18n/messages/zh-cn.json").then((m) => m.default),
  "zh-cn-sg": () => import("@/i18n/messages/zh-cn-sg.json").then((m) => m.default),
  "zh-tw": () => import("@/i18n/messages/zh-tw.json").then((m) => m.default),
  "zh-mo": () => import("@/i18n/messages/zh-mo.json").then((m) => m.default),
  "zh-yue-cn": () => import("@/i18n/messages/zh-yue-cn.json").then((m) => m.default),
  "zh-yue-hk": () => import("@/i18n/messages/zh-yue-hk.json").then((m) => m.default),
  "en-gb": () => import("@/i18n/messages/en-gb.json").then((m) => m.default),
  "ja-jp": () => import("@/i18n/messages/ja-jp.json").then((m) => m.default),
  "ko-kr": () => import("@/i18n/messages/ko-kr.json").then((m) => m.default),
  "es-es": () => import("@/i18n/messages/es-es.json").then((m) => m.default),
  "fr-fr": () => import("@/i18n/messages/fr-fr.json").then((m) => m.default),
  "de-de": () => import("@/i18n/messages/de-de.json").then((m) => m.default),
  "ru-ru": () => import("@/i18n/messages/ru-ru.json").then((m) => m.default),
} as const;

/** 深合并：base 为底，override 的键覆盖 base（递归到嵌套对象） */
function deepMerge<T>(base: T, override: unknown): T {
  if (
    base && typeof base === "object" && !Array.isArray(base) &&
    override && typeof override === "object" && !Array.isArray(override)
  ) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
      out[k] = k in out ? deepMerge(out[k], v) : v;
    }
    return out as T;
  }
  return (override as T) ?? base;
}

/**
 * 从当前请求的 URL 路径中解析 locale 前缀
 * 优先使用页面 params 传入的 locale（App Router / SSG 构建时 header 不可用，params 是唯一可靠来源）；
 * 未传时 fallback 到请求 header 推断，最后回退 defaultLocale
 */
export async function getLocale(paramLocale?: string): Promise<Locale> {
  if (paramLocale && isLocale(paramLocale)) return paramLocale;
  const headerList = await headers();
  const path =
    headerList.get("x-path") ??
    headerList.get("x-current-path") ??
    headerList.get("referer") ??
    "";
  // 从路径中提取 locale 前缀（动态匹配全部支持语言，大小写不敏感）
  const alt = locales.join("|");
  const match = path.match(new RegExp(`\\/(${alt})(?:\\/|$)`, "i"));
  const loc = match?.[1]?.toLowerCase() ?? defaultLocale;
  if (!isLocale(loc)) return defaultLocale;
  return loc;
}

/**
 * 获取当前语言的翻译字典
 * 优先使用页面 params 传入的 locale（必须：SSG 静态页构建时 header 不可用）
 */
export async function getDictionary(paramLocale?: string): Promise<Messages> {
  const currentLocale = await getLocale(paramLocale);
  return getDictionaryByLocale(currentLocale);
}

/**
 * 根据指定 locale 获取翻译字典。
 * 变体语言（zh-cn-sg/zh-mo/zh-yue-cn/zh-yue-hk）的翻译文件只存差异 key，
 * 缺失词条自动深合并父语言（zh-cn），不落英文。
 */
export async function getDictionaryByLocale(loc: Locale): Promise<Messages> {
  // cast 为 Messages：变体文件只存差异 key，类型与完整 zh-cn 不同，靠深合并补全
  const own = (await dictionaries[loc]()) as Messages;
  const fallback = localeFallbackMap[loc];
  if (!fallback) return own;
  const parent = (await dictionaries[fallback]()) as Messages;
  return deepMerge(parent, own);
}

/**
 * 嵌套键查找函数
 * t(dict, "nav.home") -> dict.nav.home
 */
export function t(
  messages: Messages,
  key: string,
  vars?: Record<string, string | number>
): string {
  const parts = key.split(".");
  let result: unknown = messages;
  for (const part of parts) {
    if (result && typeof result === "object" && part in result) {
      result = (result as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  if (typeof result !== "string") return key;
  if (vars) {
    return result.replace(/\{(\w+)\}/g, (_, name: string) =>
      String(vars[name] ?? `{${name}}`)
    );
  }
  return result;
}
