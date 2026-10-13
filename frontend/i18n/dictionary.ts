/**
 * 服务端字典加载器
 * 通过 next/headers 读取当前 URL，从中解析 locale 前缀；
 * 字典按 localeFallbackChain 合并：扁平点号 key 展开、空串/缺失词条自动回退，最终兜底 zh-cn。
 */
import { headers } from "next/headers";
import type { Locale } from "@/lib/i18n";
import {
  isLocale,
  defaultLocale,
  locales,
  localeFallbackChain,
  dictionaryLoaders,
} from "@/lib/i18n";
import {
  expandFlatKeys,
  stripEmptyLeaves,
  mergeLocaleChain,
  type Dict,
} from "./merge";

/** 翻译消息类型（从 zh-cn.json 推断） */
export type Messages = typeof import("@/i18n/messages/zh-cn.json");

/** 加载单语言原始字典（扁平 key 展开 + 空串剔除） */
async function loadLocaleDict(loc: Locale): Promise<Dict> {
  const raw = (await dictionaryLoaders[loc]()) as unknown as Dict;
  return stripEmptyLeaves(expandFlatKeys(raw));
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
 * 沿 localeFallbackChain 合并（自身 → 父语言 → … → zh-cn）：
 * 任一语言某 key 为空字符串或缺失时自动回退兜底 zh-cn，不落英文、防页面空白。
 */
export async function getDictionaryByLocale(loc: Locale): Promise<Messages> {
  const chain = localeFallbackChain(loc);
  if (chain.length === 1) return (await loadLocaleDict(loc)) as unknown as Messages;
  const dicts = await Promise.all(chain.map(loadLocaleDict));
  return mergeLocaleChain(dicts) as unknown as Messages;
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
