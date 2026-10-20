import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

/**
 * robots.ts - 自动生成 robots.txt
 *
 * 允许爬虫抓取公开页面（带 locale 前缀），禁止抓取：
 *   - /api/        后端接口（同源反代到 FastAPI，非 HTML 内容）
 *   - /uploads/    用户上传文件存储（图片通过 img 引用，不需直接爬取）
 *   - /{locale}/admin/   后台（登录态 + admin 角色才能访问）
 *   - /{locale}/auth/    登录/注册/找回密码等认证页
 *   - /{locale}/setting/ 个人设置（登录态才能访问）
 *
 * 私密路径本身 403/重定向，但显式 Disallow 可避免爬虫浪费配额。
 * 部署后可通过 /robots.txt 访问；域名取运行时配置（见 lib/site.ts）。
 */
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = await getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/uploads/",
        "/*/admin",
        "/*/admin/*",
        "/*/auth",
        "/*/auth/*",
        "/*/setting",
        "/*/setting/*",
      ],
    },
    // 不输出 Host 指令：仅 Yandex 识别，Google / Bing 忽略
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
