import type { MetadataRoute } from "next";

/**
 * robots.ts - 自动生成 robots.txt
 * 允许全部爬虫抓取，并指向 sitemap.xml
 * 部署后可通过 /robots.txt 访问
 */
const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://gdueca.example.edu.cn";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
