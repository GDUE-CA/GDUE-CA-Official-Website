import type { Metadata } from "next";
import Link from "next/link";
import FileText from "@/assets/icons/status/megaphone.svg";
import { getDictionary } from "@/i18n/dictionary";
import { listPublicAnnouncements } from "@/lib/api/announcements";
import { markdownExcerpt } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { DirectionalTransition } from "@/components/shared/DirectionalTransition";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";

/**
 * 公告列表页 - 数据源：公告 CMS（category=home，仅生效中 + 已发布），ISR 60s；
 * 后端不可用/为空时展示空态。点击条目跳转公告详情页。
 */
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  return { title: dict.announcements.title, description: dict.announcements.subtitle };
}

export default async function AnnouncementsListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  // lang=locale：后端按显示语言自动翻译公告标题/内容（失败回退原文）
  const items = await listPublicAnnouncements("home", locale).catch(() => []);

  return (
    <DirectionalTransition>
      <PageHeader
        title={dict.announcements.title}
        subtitle={dict.announcements.subtitle}
        transitionName="page-title-announcements"
      >
        <p className="flex items-center gap-2 font-mono text-[13px] md:text-sm">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
          {items.length} {dict.announcements.countUnit}
        </p>
      </PageHeader>

      <section className="container mx-auto max-w-5xl px-5 sm:px-6 lg:px-8 py-12 md:py-[72px]">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <FileText className="h-10 w-10 opacity-40" aria-hidden="true" />
            <p className="text-sm">{dict.announcements.empty}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/${locale}/announcements/${a.id}`}
                  className="group block rounded-xl border border-border bg-card p-5 md:p-6 transition-colors hover:border-primary/50 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <time className="font-mono text-xs text-muted-foreground">
                    <FormattedUserActionTime utcIso={a.start_at ?? a.created_at} />
                  </time>
                  <h2 className="mt-2 text-lg md:text-xl font-semibold leading-snug group-hover:text-primary transition-colors">
                    {a.title}
                  </h2>
                  {markdownExcerpt(a.content) && (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                      {markdownExcerpt(a.content)}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DirectionalTransition>
  );
}
