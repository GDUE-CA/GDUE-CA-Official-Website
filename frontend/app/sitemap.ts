import type { MetadataRoute } from "next";
import { locales, defaultLocale } from "@/lib/i18n";

/**
 * sitemap.ts - 自动生成 sitemap.xml
 * 包含所有语言版本的静态页面与动态内容页（博客、项目）
 * 部署后可通过 /sitemap.xml 访问
 */
const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://gdueca.example.edu.cn";

// 静态页面路径（不含 [locale] 前缀）
const staticRoutes = ["", "/about", "/projects", "/events", "/join", "/blog", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {

  const entries: MetadataRoute.Sitemap = [];

  // 为每个语言生成静态页面条目
  for (const locale of locales) {
    // 首页为默认语言添加 hreflang alternate 指向各语言版本
    for (const route of staticRoutes) {
      const url = `${BASE_URL}/${locale}${route}`;
      const alternates: Record<string, string> = {};
      for (const altLocale of locales) {
        alternates[altLocale] = `${BASE_URL}/${altLocale}${route}`;
      }
      // 默认语言额外标注 x-default
      if (locale === defaultLocale) {
        alternates["x-default"] = `${BASE_URL}${route === "" ? "" : route}`;
      }
      entries.push({
        url,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: route === "" ? 1.0 : 0.8,
        alternates: {
          languages: alternates,
        },
      });
    }
  }

  return entries;
}
