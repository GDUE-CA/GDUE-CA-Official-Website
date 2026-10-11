import { getDictionary } from "@/i18n/dictionary";
import { fetchClubEvents } from "@/lib/api/activities";
import { PageHeader } from "@/components/shared/PageHeader";
import { DirectionalTransition } from "@/components/shared/DirectionalTransition";
import { EventsChart } from "@/components/events/EventsChart";
import { EventsList } from "@/components/events/EventsList";

/**
 * 活动页面 - 标题区（含场次 / 人次摘要）、类型筛选 + 表格式活动列表、参与人数统计图
 *
 * 数据源：活动 CMS（/api/activities?status_filter=archive），ISR 60s；
 * 展示组件（EventsList/EventsChart）与交互逻辑不变。后端不可用时降级为空列表。
 */
export const revalidate = 60;

export default async function EventsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  // lang=locale：后端按显示语言自动翻译活动标题/短描述（失败回退原文）
  const events = await fetchClubEvents(locale).catch(() => []);
  const total = events.reduce((sum, e) => sum + e.participants, 0);

  return (
    <DirectionalTransition>
      <PageHeader
        title={dict.events.title}
        subtitle={dict.events.subtitle}
        transitionName="page-title-events"
      >
        <p className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[13px] md:text-sm">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
            {events.length} {dict.events.countUnit}
          </span>
          <span className="text-muted-foreground">
            {[dict.events.totalPrefix, total.toLocaleString("en-us"), dict.events.totalSuffix]
              .filter(Boolean)
              .join(" ")}
          </span>
        </p>
      </PageHeader>

      <EventsList events={events} />

      {/* 参与人数统计图 */}
      <section
        aria-labelledby="events-chart-title"
        className="border-t border-border"
      >
        <div className="container mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 py-12 md:py-[72px]">
          <div className="mb-6 flex flex-col gap-1.5">
            <h2 id="events-chart-title" className="text-[28px] md:text-[32px] leading-tight">
              {dict.events.chartTitle}
            </h2>
            <p className="text-[15px] md:text-base text-muted-foreground">{dict.events.chartSubtitle}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <EventsChart events={events} />
          </div>
        </div>
      </section>
    </DirectionalTransition>
  );
}
