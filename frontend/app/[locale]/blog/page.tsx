import { getDictionary } from "@/i18n/dictionary";
import { listPublicPosts, listPublicTags } from "@/lib/api/blog";
import { PageHeader } from "@/components/shared/PageHeader";
import { DirectionalTransition } from "@/components/shared/DirectionalTransition";
import { BlogList } from "@/components/blog/BlogList";
import type { BlogPost, BlogTag } from "@/types/api";

/**
 * 技术博客列表页 - 文章卡片列表，支持标签筛选
 *
 * 数据源：博客 CMS（/api/blog），ISR 60s 增量更新；
 * 修改内容无需重新部署。失败时降级为空列表。
 */

/** 后端文章 → 前端卡片形状（tags 仅保留名称供筛选展示） */
function toCardPost(p: BlogPost) {
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt ?? "",
    // 原始 UTC ISO 字符串，由客户端组件按用户时区渲染
    date: p.published_at ?? p.created_at,
    tags: p.tags.map((t) => t.name),
    author: p.author ?? "—",
  };
}

export const revalidate = 60;

export default async function BlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  let posts: ReturnType<typeof toCardPost>[] = [];
  let tags: BlogTag[] = [];
  try {
    // page_size 上限为后端限制的 50；超出部分由分页/搜索覆盖（博客首屏展示场景足够）
    // lang=locale：后端按显示语言自动翻译文章标题/摘要与标签名（缓存加速，失败回退原文）
    const [postRes, tagRes] = await Promise.all([
      listPublicPosts({ page_size: 50, lang: locale }),
      listPublicTags(locale),
    ]);
    posts = postRes.items.map(toCardPost);
    tags = tagRes;
  } catch {
    // 后端不可达时降级为空列表，页面仍可渲染
  }

  return (
    <DirectionalTransition>
      <PageHeader
        title={dict.blog.title}
        subtitle={dict.blog.subtitle}
        transitionName="page-title-blog"
      />
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <BlogList posts={posts} tags={tags.map((t) => t.name)} />
      </div>
    </DirectionalTransition>
  );
}
