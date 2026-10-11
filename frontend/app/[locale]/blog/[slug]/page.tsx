import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, User } from "lucide-react";
import { getDictionary } from "@/i18n/dictionary";
import { getPublicPost } from "@/lib/api/blog";
import { ApiError } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/blog/MarkdownRenderer";
import { CommentsSection } from "@/components/blog/CommentsSection";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";

/**
 * 技术博客文章详情页 - 数据源：博客 CMS（/api/blog/{slug}）
 *
 * ISR 60s；动态渲染（服务端 fetch），非已发布文章一律 404。
 */
export const revalidate = 60;

/** 生成 metadata */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  try {
    // lang=locale：后端按显示语言自动翻译标题/摘要（正文 Markdown 不做机器翻译）
    const post = await getPublicPost(slug, locale);
    return {
      title: post.title,
      description: post.excerpt ?? undefined,
    };
  } catch {
    return {};
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug, locale } = await params;
  const dict = await getDictionary(locale);

  let post;
  try {
    post = await getPublicPost(slug, locale);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return (
    <article className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      {/* 返回链接 */}
      <Link
        href={`/${locale}/blog`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        {dict.blog.title}
      </Link>

      {/* 文章头部 */}
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          {post.title}
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {/* 后端原始 UTC ISO，客户端按用户时区渲染 */}
            <FormattedUserActionTime
              utcIso={post.published_at ?? post.created_at}
            />
          </span>
          <span className="flex items-center gap-1.5">
            <User className="h-4 w-4" />
            {post.author ?? "—"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Badge key={tag.id} variant="accent">{tag.name}</Badge>
          ))}
        </div>
      </header>

      {/* 文章正文 */}
      <MarkdownRenderer content={post.content_md} />

      {/* 评论区（客户端组件自行拉取 /api/blog/{id}/comments） */}
      <CommentsSection postId={post.id} />
    </article>
  );
}
