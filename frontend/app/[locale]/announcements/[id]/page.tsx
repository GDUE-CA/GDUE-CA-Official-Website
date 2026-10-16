import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ArrowLeft from "@/assets/icons/navigation/arrow-left.svg";
import ExternalLink from "@/assets/icons/navigation/external-link.svg";
import { getDictionary } from "@/i18n/dictionary";
import { getPublicAnnouncement } from "@/lib/api/announcements";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownRenderer } from "@/components/blog/MarkdownRenderer";
import { AnnouncementAttachments } from "@/components/announcements/AnnouncementAttachments";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";

/**
 * 公告详情页 - 数据源：公告 CMS（/api/announcements/{id}），ISR 60s；
 * 草稿 / 过期 / 已删除 / 不存在统一 404（后端只返回生效中 + 已发布）。
 */
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;
  const a = await getPublicAnnouncement(Number(id), locale).catch(() => null);
  if (!a) return {};
  return { title: a.title, description: a.content.slice(0, 120) };
}

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id, locale } = await params;
  const dict = await getDictionary(locale);
  const a = await getPublicAnnouncement(Number(id), locale).catch(() => null);

  if (!a) notFound();

  return (
    <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      {/* 返回链接 */}
      <Link
        href={`/${locale}/announcements`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        {dict.announcements.title}
      </Link>

      {/* 标题区 */}
      <div className="mb-6 space-y-3">
        <time className="font-mono text-xs text-muted-foreground">
          <FormattedUserActionTime utcIso={a.start_at ?? a.created_at} />
        </time>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight break-words">
          {a.title}
        </h1>
      </div>

      {/* 正文（Markdown 富文本） */}
      <Card>
        <CardContent className="p-5 md:p-8">
          <MarkdownRenderer content={a.content} />
        </CardContent>
      </Card>

      {/* 附件在线预览（视频 / 音频 / PDF 在线渲染，Office 下载兜底） */}
      {a.attachments.length > 0 && (
        <AnnouncementAttachments attachments={a.attachments} />
      )}

      {/* 可选外部/站内相关链接 */}
      {a.link && (
        <div className="mt-6">
          <Link
            href={a.link.startsWith("/") ? `/${locale}${a.link}` : a.link}
            target={a.link.startsWith("/") ? undefined : "_blank"}
            rel={a.link.startsWith("/") ? undefined : "noopener noreferrer"}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {dict.announcements.relatedLink}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
