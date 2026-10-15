import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ArrowLeft from "@/assets/icons/navigation/arrow-left.svg";
import CalendarDays from "@/assets/icons/status/calendar-days.svg";
import Clock from "@/assets/icons/status/clock.svg";
import Users from "@/assets/icons/user/users.svg";
import { getDictionary } from "@/i18n/dictionary";
import { fetchActivityById } from "@/lib/api/activities";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownRenderer } from "@/components/blog/MarkdownRenderer";
import { RuntimeStatusBadge } from "@/components/events/RuntimeStatusBadge";
import { EnrolButton } from "@/components/events/EnrolButton";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";

/**
 * 活动详情页 - 数据源：活动 CMS（/api/activities/{id}），ISR 60s；
 * 草稿/软删除后端 404；归档活动可查阅（P0：归档 ≠ 删除，仅禁新增报名）。
 * 报名按钮为客户端组件（挂载时实时拉取登录态与 enrolled，不受 ISR 缓存影响）。
 */
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;
  const activity = await fetchActivityById(Number(id), locale).catch(() => null);
  if (!activity) return {};
  return {
    title: activity.title,
    description: activity.description,
  };
}

const TYPE_LABEL_KEYS = {
  lecture: "filterLecture",
  competition: "filterCompetition",
  recruitment: "filterRecruitment",
  workshop: "filterWorkshop",
} as const;

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id, locale } = await params;
  const dict = await getDictionary(locale);
  const activity = await fetchActivityById(Number(id), locale).catch(() => null);

  if (!activity) notFound();

  const isArchived = activity.status === "archived";
  const typeLabel = activity.category
    ? (TYPE_LABEL_KEYS as Record<string, string>)[activity.category]
      ? dict.events[TYPE_LABEL_KEYS[activity.category as keyof typeof TYPE_LABEL_KEYS]]
      : activity.category
    : null;

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
      {/* 返回链接 */}
      <Link
        href={`/${locale}/events`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        {dict.events.title}
      </Link>

      {/* 封面图 */}
      {activity.cover_url && (
        <div className="mb-8 aspect-video rounded-xl overflow-hidden border border-border bg-muted">
          <img
            src={activity.cover_url}
            alt={activity.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* 标题区 */}
      <div className="mb-8 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <RuntimeStatusBadge status={activity.runtime_status} />
          {typeLabel && <Badge variant="accent">{typeLabel}</Badge>}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          {activity.title}
        </h1>
        {activity.description && (
          <p className="text-lg text-muted-foreground">{activity.description}</p>
        )}
      </div>

      {/* 信息卡：时间 / 报名统计 / 报名操作 */}
      <Card className="mb-8">
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2.5 text-sm">
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">{dict.events.detail.startTime}</span>
              {activity.start_at ? (
                <FormattedUserActionTime utcIso={activity.start_at} />
              ) : (
                <span>—</span>
              )}
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">{dict.events.detail.endTime}</span>
              {activity.end_at ? (
                <FormattedUserActionTime utcIso={activity.end_at} />
              ) : (
                <span>—</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {dict.events.enrolledCount}
              <span className="font-mono tabular-nums text-foreground">
                {activity.enrolled_count}
              </span>
            </span>
            {isArchived ? (
              <span className="text-sm text-muted-foreground italic">
                {dict.events.archive.notice}
              </span>
            ) : (
              <EnrolButton eventId={activity.id} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* 归档提示条（归档活动详情页顶部提示，P0：仅可查阅） */}
      {isArchived && (
        <div className="mb-8 rounded-lg border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          {dict.events.archive.notice}
        </div>
      )}

      {/* Markdown 活动详情 */}
      <Card>
        <CardContent className="p-5 md:p-8">
          <MarkdownRenderer content={activity.content ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
