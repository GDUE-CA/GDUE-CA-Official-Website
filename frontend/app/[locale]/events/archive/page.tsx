import { getDictionary } from "@/i18n/dictionary";
import { fetchArchivedClubEvents } from "@/lib/api/activities";
import { PageHeader } from "@/components/shared/PageHeader";
import { DirectionalTransition } from "@/components/shared/DirectionalTransition";
import { EventsList } from "@/components/events/EventsList";

/**
 * 归档活动专区（P0）- 数据源：/api/activities?archived=only，ISR 60s
 * 复用活动列表布局；页面隐藏全部报名按钮（历史活动仅可查阅），
 * 详情页对归档活动同样隐藏报名操作并展示归档提示。
 */
export const revalidate = 60;

export default async function ArchivedEventsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  const events = await fetchArchivedClubEvents(locale).catch(() => []);

  return (
    <DirectionalTransition>
      <PageHeader
        title={dict.events.archive.title}
        subtitle={dict.events.archive.subtitle}
        transitionName="page-title-events"
      >
        <p className="font-mono text-[13px] md:text-sm">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
            {events.length} {dict.events.countUnit}
          </span>
        </p>
      </PageHeader>

      <EventsList events={events} archived />
    </DirectionalTransition>
  );
}
