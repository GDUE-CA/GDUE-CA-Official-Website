"use client";

/**
 * 本地化导航工具（i18n URL 规范 §5）
 * - localizedPath(locale, rawPath, query?)：纯函数，把原生路径（如 "/setting"）
 *   拼接 locale 前缀输出完整本地化 URL；已带前缀或非站内相对路径原样返回
 * - useLocalizedPath()：客户端 hook，自动取当前 URL 顶层 locale，返回拼路径函数
 * - useSwitchLocale()：客户端 hook，切换语言时只替换 URL 顶层 locale 段，
 *   保留子路径与 query（规范 §3）
 *
 * 防开放重定向：rawPath 仅接受单个 / 开头的站内相对路径，拒 //、\、绝对 URL。
 */
import { usePathname, useRouter } from "next/navigation";
import {
  defaultLocale,
  urlLangToLocale,
  localeToUrlLang,
  type Locale,
} from "@/lib/i18n";

/** query 值类型（undefined / null 自动跳过，不写入最终 URL） */
type QueryValue = string | number | boolean | undefined | null;
type Query = Record<string, QueryValue>;

/** 判断路径首段是否为合法 locale（即已带 locale 前缀） */
function hasLocalePrefix(p: string): boolean {
  const first = p.split("/")[1] ?? "";
  return urlLangToLocale(first) !== null;
}

/** 把 query 合并进 path（path 自带 query 时先解析再合并；undefined/null 跳过） */
function mergeQuery(path: string, query?: Query): string {
  if (!query) return path;
  const qIndex = path.indexOf("?");
  const base = qIndex >= 0 ? path.slice(0, qIndex) : path;
  const existing = qIndex >= 0 ? path.slice(qIndex + 1) : "";
  const params = new URLSearchParams(existing);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * 把原生路径拼接 locale 前缀。
 * - 非 / 开头（外部 URL / 锚点）→ 原样返回
 * - // 或含 \（开放重定向风险）→ 原样返回（不拼前缀，交由调用方/守卫处理）
 * - 已带合法 locale 前缀 → 仅合并 query
 * - 其余 → 前置 /{locale}，根路径 "/" → /{locale}
 */
export function localizedPath(locale: Locale, rawPath: string, query?: Query): string {
  if (!rawPath.startsWith("/")) return rawPath;
  if (rawPath.startsWith("//") || rawPath.includes("\\")) return rawPath;
  if (hasLocalePrefix(rawPath)) return mergeQuery(rawPath, query);
  const prefixed = `/${localeToUrlLang(locale)}${rawPath === "/" ? "" : rawPath}`;
  return mergeQuery(prefixed, query);
}

/**
 * 客户端 hook：返回一个 (rawPath, query?) => string 函数。
 * 自动从当前 URL 顶层段取 locale（经 rewrite 后 usePathname 返回浏览器源 URL，含 locale），
 * 取不到时降级 defaultLocale。
 */
export function useLocalizedPath(): (rawPath: string, query?: Query) => string {
  const pathname = usePathname() ?? "/";
  const first = pathname.split("/")[1] ?? "";
  const locale = urlLangToLocale(first) ?? defaultLocale;
  return (rawPath: string, query?: Query) => localizedPath(locale, rawPath, query);
}

/**
 * 客户端 hook：返回切换语言的函数。
 * 只替换 URL 顶层 locale 段，保留子路径与 query（规范 §3）。
 * 例：当前 /zh-cn/blog/post?id=1，切日语 → /ja/blog/post?id=1。
 */
export function useSwitchLocale(): (target: Locale) => void {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  return (target: Locale) => {
    const targetLang = localeToUrlLang(target);
    const segs = pathname.split("/"); // ["", maybe-locale, ...rest]
    let rest: string;
    if (segs.length > 1 && urlLangToLocale(segs[1])) {
      // 已有 locale 段：剥掉，保留后续
      rest = "/" + segs.slice(2).join("/");
    } else {
      // 无 locale 段：整段保留为子路径
      rest = pathname;
    }
    const search = typeof window !== "undefined" ? window.location.search : "";
    router.replace(`/${targetLang}${rest === "/" ? "" : rest}${search}`);
  };
}
