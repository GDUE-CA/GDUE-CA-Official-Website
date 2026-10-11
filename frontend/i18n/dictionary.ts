/**
 * 服务端字典加载器
 * 通过 next/headers 读取当前 URL，从中解析 locale 前缀
 * 动态加载对应语言的翻译
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { isLocale, defaultLocale } from "@/lib/i18n";

/** 翻译消息类型（从 zh-cn.json 推断） */
export type Messages = typeof import("@/i18n/messages/zh-cn.json");

/** 字典加载器映射（键与 lib/i18n.ts locales 一一对应，全小写） */
const dictionaries = {
  "zh-cn": () =>
    import("@/i18n/messages/zh-cn.json").then((m) => m.default),
  "zh-tw": () => import("@/i18n/messages/zh-tw.json").then((m) => m.default),
  "zh-hk": () => import("@/i18n/messages/zh-hk.json").then((m) => m.default),
  "en-us": () => import("@/i18n/messages/en-us.json").then((m) => m.default),
  "en-gb": () => import("@/i18n/messages/en-gb.json").then((m) => m.default),
  ja: () => import("@/i18n/messages/ja.json").then((m) => m.default),
} as const;

/**
 * 从当前请求的 URL 路径中解析 locale 前缀
 * 例如：/zh-cn/about -> "zh-cn"，/en-gb -> "en-gb"（大小写不敏感，兼容旧链接）
 * 优先使用页面 params 传入的 locale（App Router / SSG 构建时 header 不可用，params 是唯一可靠来源）；
 * 未传时 fallback 到请求 header 推断，最后回退 defaultLocale
 */
export async function getLocale(paramLocale?: string): Promise<Locale> {
  if (paramLocale && isLocale(paramLocale)) return paramLocale;
  const headerList = await headers();
  // Next.js 中可以通过 x-path 或自定义 header 获取当前路径
  // 但更稳定的方式是从 referer 或其他方式获取
  // 此处优先使用 x-path（Next.js 内部 header），fallback 到 defaultLocale
  const path =
    headerList.get("x-path") ??
    headerList.get("x-current-path") ??
    headerList.get("referer") ??
    "";
  // 从路径中提取 locale 前缀（大小写不敏感）
  const match = path.match(/\/(zh-cn|zh-tw|zh-hk|en-us|en-gb|ja)(?:\/|$)/i);
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
  return dictionaries[currentLocale]();
}

/**
 * 根据指定 locale 获取翻译字典
 */
export async function getDictionaryByLocale(
  loc: Locale
): Promise<Messages> {
  return dictionaries[loc]();
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
