import type { MetadataRoute } from "next";
import { locales, defaultLocale, localeToHreflang } from "@/lib/i18n";
import { getSiteUrl } from "@/lib/site";
import { listPublicPosts } from "@/lib/api/blog";
import { listPublicProjects } from "@/lib/api/projects";
import { listPublicActivities } from "@/lib/api/activities";
import { listPublicAnnouncements } from "@/lib/api/announcements";

/**
 * sitemap.ts - 自动生成 sitemap.xml（sitemaps.org 0.9 + xhtml:link hreflang）
 *
 * 包含所有语言版本的静态页面与已发布内容详情页（博客 / 项目 / 活动 / 公告）。
 * 每次请求动态生成：域名取运行时配置（见 lib/site.ts），内容随 CMS 发布即时更新。
 * 内容接口失败时只跳过对应部分，静态页面照常输出。
 */
export const dynamic = "force-dynamic";

// 静态页面路径（不含 [locale] 前缀）
const staticRoutes = ["", "/about", "/projects", "/events", "/join", "/blog", "/submit", "/announcements"];

/** 内容页：路径（不含 locale）+ 最后修改时间 */
interface ContentRoute {
  path: string;
  lastModified?: string;
}

/** 博客分页上限 50，逐页拉取；设页数上限防止异常数据导致无限循环 */
async function blogRoutes(): Promise<ContentRoute[]> {
  const out: ContentRoute[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await listPublicPosts({ page, page_size: 50 });
    out.push(...res.items.map((p) => ({ path: `/blog/${p.slug}`, lastModified: p.updated_at })));
    if (res.items.length < 50 || out.length >= res.total) break;
  }
  return out;
}

async function projectRoutes(): Promise<ContentRoute[]> {
  const out: ContentRoute[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await listPublicProjects({ page, page_size: 100 });
    out.push(...res.items.map((p) => ({ path: `/projects/${p.slug}`, lastModified: p.updated_at })));
    if (res.items.length < 100 || out.length >= res.total) break;
  }
  return out;
}

async function eventRoutes(): Promise<ContentRoute[]> {
  const items = await listPublicActivities();
  return items.map((a) => ({ path: `/events/${a.id}`, lastModified: a.updated_at }));
}

async function announcementRoutes(): Promise<ContentRoute[]> {
  const items = await listPublicAnnouncements();
  return items.map((a) => ({ path: `/announcements/${a.id}`, lastModified: a.start_at ?? a.created_at }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = await getSiteUrl();

  const results = await Promise.allSettled([blogRoutes(), projectRoutes(), eventRoutes(), announcementRoutes()]);
  const content = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  const routes: (ContentRoute & { priority: number; changeFrequency: "weekly" | "monthly" })[] = [
    // 静态页不写 lastmod：没有可靠的修改时间，写当前时间会被搜索引擎判为不可信
    ...staticRoutes.map((path) => ({ path, priority: path === "" ? 1.0 : 0.8, changeFrequency: "weekly" as const })),
    ...content.map((c) => ({ ...c, priority: 0.6, changeFrequency: "monthly" as const })),
  ];

  const entries: MetadataRoute.Sitemap = [];
  for (const route of routes) {
    // 每条 URL 列出全部语言版本（hreflang 用 BCP 47 规范大小写，与页面 <head> 一致）+ x-default
    const languages: Record<string, string> = {};
    for (const l of locales) {
      languages[localeToHreflang(l)] = `${baseUrl}/${l}${route.path}`;
    }
    languages["x-default"] = `${baseUrl}/${defaultLocale}${route.path}`;

    for (const locale of locales) {
      entries.push({
        url: `${baseUrl}/${locale}${route.path}`,
        ...(route.lastModified ? { lastModified: route.lastModified } : {}),
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        alternates: { languages },
      });
    }
  }
  return entries;
}
