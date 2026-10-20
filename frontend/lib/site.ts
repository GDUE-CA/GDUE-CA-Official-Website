import { headers } from "next/headers";
import { requestHost } from "@/lib/requestHost";

/**
 * 站点对外根 URL（无末尾斜杠），供 sitemap.xml / robots.txt / hreflang / JSON-LD 生成绝对链接。
 *
 * 优先级：
 *   1. SITE_URL：运行时读取（systemd 部署改环境变量后重启即可生效，无需重新构建）
 *   2. NEXT_PUBLIC_SITE_URL：构建期固化（Docker 构建参数）
 *   3. 都未配置：按当前请求的 Host 推断（经 Cloudflare / Nginx 反代时取 X-Forwarded-Host）
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const host = requestHost(await headers());
  if (!host) return "";
  // 不信任 X-Forwarded-Proto：Cloudflare → Nginx 回源可能是 http，对外始终是 https；仅本机开发用 http
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return `${local ? "http" : "https"}://${host}`;
}
