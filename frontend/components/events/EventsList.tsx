"use client";

/**
 * EventsList - 活动列表（含类型筛选）
 * 通栏筛选条（胶囊按钮，aria-pressed）+ 表格式列表：
 * 桌面六列（日期 / 类型 / 活动 / 状态 / 报名人数 / 操作）；
 * 手机堆叠为卡片：日期·类型 / 标题·简介 / 状态·报名人数（带标签）/ 等宽双按钮（40px 触控高度）
 * - 无数据（含筛选后为空）：隐藏表头，显示灰色「暂无数据」
 * - 每行展示后端实时业务状态标签（RuntimeStatusBadge）
 * - 操作列：详情链接 + 一键报名按钮（EnrolButton 挂载时实时拉取登录态）
 * - archived 模式（归档专区）：顶部提示条 + 隐藏报名按钮，仅保留详情查阅
 * 客户端按类型筛选；列表同时充当统计图的表格视图
 */
import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import ArrowRight from "@/assets/icons/navigation/arrow-right.svg";
import { RuntimeStatusBadge } from "@/components/events/RuntimeStatusBadge";
import { EnrolButton } from "@/components/events/EnrolButton";
import type { ClubEvent } from "@/types/api";

interface EventsListProps {
  events: ClubEvent[];
  /** 归档专区模式：隐藏报名按钮，仅可查阅 */
  archived?: boolean;
}

/**
 * 取本地化的活动字段：先查 i18n 字典，查不到回退到 markdown 原文。
 * 字典中的活动翻译位于 home.events.items.{slug}.{title|description}，
 * 由各语言 messages/*.json 维护，与 markdown frontmatter 一一对应。
 */
function localizedEventField(
  t: (key: string) => string,
  slug: string,
  field: "title" | "description",
  fallback: string
): string {
  const key = `home.events.items.${slug}.${field}`;
  const translated = t(key);
  // i18n 查不到键时 lookup 会返回 key 本身，此时回退到 markdown 内容
  return translated === key ? fallback : translated;
}

const rowGrid =
  "md:grid md:grid-cols-[130px_100px_minmax(0,1fr)_auto_96px_auto] md:items-center md:gap-x-5";

export function EventsList({ events, archived = false }: EventsListProps) {
  const { t, locale } = useI18n();
  const [filter, setFilter] = useState<string>("all");

  const filters = [
    { key: "all", label: t("events.filterAll") },
    { key: "lecture", label: t("events.filterLecture") },
    { key: "competition", label: t("events.filterCompetition") },
    { key: "recruitment", label: t("events.filterRecruitment") },
    { key: "workshop", label: t("events.filterWorkshop") },
  ];

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);
  const typeLabel = (type: string) =>
    t(`events.filter${type.charAt(0).toUpperCase()}${type.slice(1)}`);

  return (
    <>
      {/* 归档提示条（P0：归档活动仅可查阅历史记录） */}
      {archived && (
        <div className="border-b border-border bg-muted/50">
          <div className="container mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 py-3 text-sm text-muted-foreground">
            {t("events.archive.notice")}
          </div>
        </div>
      )}

      {/* 通栏筛选条（手机横向滚动，右缘渐隐提示可滑动） */}
      <div className="border-b border-border">
        <div className="container mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 py-4 md:h-[72px] md:py-0 flex items-center justify-between gap-4">
          <div role="group" aria-label={t("events.filterAll")} className="flex gap-2 overflow-x-auto -mx-1 px-1 max-md:pr-6 max-md:[mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)]">
            {filters.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "h-9 shrink-0 rounded-full border px-3.5 text-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active
                      ? "border-primary bg-primary font-semibold text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <span className="hidden md:inline shrink-0 font-mono text-[13px] text-muted-foreground">
            {t("events.sortByDate")} ↓
          </span>
        </div>
      </div>

      {/* 表格式列表 */}
      <div className="container mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 pt-4 md:pt-8 pb-12 md:pb-[72px]">
        <div role="table" aria-label={t("events.title")} aria-rowcount={filtered.length + 1}>
          <div
            role="row"
            className={cn(
              "hidden h-10 border-b border-border font-mono text-xs text-muted-foreground",
              filtered.length > 0 && rowGrid
            )}
          >
            <span role="columnheader" className="flex items-center">{t("events.dateColumn")}</span>
            <span role="columnheader" className="flex items-center">{t("events.typeColumn")}</span>
            <span role="columnheader" className="flex items-center">{t("events.title")}</span>
            <span role="columnheader" className="flex items-center">{t("events.statusColumn")}</span>
            <span role="columnheader" className="flex items-center justify-end text-right">{t("events.enrolledColumn")}</span>
            <span role="columnheader" className="flex items-center justify-end text-right">{t("events.actionColumn")}</span>
          </div>
          {filtered.length === 0 && (
            <div
              role="row"
              className="flex h-40 items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground"
            >
              <span role="cell">{t("events.empty")}</span>
            </div>
          )}
          {filtered.map((event) => (
            <div
              key={event.slug}
              role="row"
              className={cn(
                "flex flex-col gap-3 border-b border-border py-5 md:min-h-[92px] md:py-4",
                rowGrid
              )}
            >
              <div className="flex items-center justify-between md:contents">
                <time
                  role="cell"
                  dateTime={event.date}
                  className="font-mono text-xs md:text-sm text-muted-foreground md:flex md:items-center"
                >
                  {event.date}
                </time>
                <span role="cell" className="md:flex md:items-center">
                  <span className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-xs">
                    {typeLabel(event.type)}
                  </span>
                </span>
              </div>
              <div role="cell" className="flex min-w-0 flex-col gap-1 md:justify-center">
                <Link
                  href={`/${locale}/events/${event.id}`}
                  className="text-[17px] font-semibold leading-snug md:truncate hover:text-primary transition-colors"
                >
                  {localizedEventField(t, event.slug, "title", event.title)}
                </Link>
                <span className="text-sm text-muted-foreground line-clamp-2 md:line-clamp-1">
                  {localizedEventField(t, event.slug, "description", event.description)}
                </span>
              </div>
              {/* 手机：状态与报名人数同一行；桌面：拆回两列 */}
              <div className="flex items-center justify-between gap-3 md:contents">
                <div role="cell" className="flex items-center gap-2 md:justify-start">
                  <RuntimeStatusBadge status={event.runtime_status} />
                </div>
                <span role="cell" className="font-mono text-xs md:text-sm md:text-right tabular-nums text-muted-foreground md:text-foreground md:flex md:items-center md:justify-end">
                  <span className="md:hidden">{t("events.enrolledColumn")} </span>
                  {(event.enrolled_count ?? 0).toLocaleString("en-us")}
                </span>
              </div>
              {/* 手机：按钮等宽铺满、40px 触控高度；桌面：右对齐紧凑按钮 */}
              <div
                role="cell"
                className="grid auto-cols-fr grid-flow-col gap-2 [&>*]:h-10 [&>*]:w-full [&>*]:justify-center md:flex md:items-center md:justify-end md:[&>*]:h-8 md:[&>*]:w-auto"
              >
                {archived ? (
                  <Link
                    href={`/${locale}/events/${event.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    {t("events.viewDetail")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <>
                    <EnrolButton eventId={event.id} size="sm" />
                    <Link
                      href={`/${locale}/events/${event.id}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      {t("events.viewDetail")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
