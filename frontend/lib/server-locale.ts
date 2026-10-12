import { headers } from "next/headers";
import { defaultLocale, urlLangToLocale, type Locale } from "@/lib/i18n";

/**
 * 服务端取当前 locale（仅在 Server Component / Server Action 内调用）。
 * 读 proxy.ts 注入的 x-locale 头（proxy 已把请求 URL 补全为 /{locale}/...），
 * 非法 / 缺失时降级 defaultLocale。
 *
 * 用于：服务端 redirect() 拼 locale 前缀路径、[locale] layout 生成每页 hreflang 等。
 */
export async function getServerLocale(): Promise<Locale> {
  const h = await headers();
  return urlLangToLocale(h.get("x-locale") ?? "") ?? defaultLocale;
}

/** 服务端取当前浏览器路径（proxy 注入的 x-pathname，含 locale 前缀）。 */
export async function getServerPathname(): Promise<string> {
  const h = await headers();
  return h.get("x-pathname") ?? "/";
}
