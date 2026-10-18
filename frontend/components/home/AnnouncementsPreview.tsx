"use client";

/**
 * AnnouncementsPreview - 首页底部「最新公告」横向预览区块
 * 桌面：一行最多 4 张横向卡片；手机：纵向堆叠
 * 卡片：发布日期（font-mono 小字）+ 标题（2 行截断），整卡可点跳公告详情
 * 数据源：listPublicAnnouncements("home", locale)（与 /announcements 列表页同源）
 * 加载失败/无数据时展示空态提示，不渲染卡片列表
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import ArrowUpRight from "@/assets/icons/navigation/arrow-up-right.svg";
import { useI18n } from "@/i18n/provider";
import { listPublicAnnouncements } from "@/lib/api/announcements";
import type { PublicAnnouncement } from "@/types/api";

export function AnnouncementsPreview() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<PublicAnnouncement[]>([]);

  useEffect(() => {
    let cancelled = false;
    listPublicAnnouncements("home", locale)
      .then((list) => {
        if (!cancelled) setItems(list.slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return (
    <section
      aria-labelledby="announcements-preview-title"
      className="border-t border-border"
    >
      <div className="container mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 py-10 md:py-14">
        <div className="flex items-baseline justify-between gap-4 mb-5 md:mb-6">
          <h2
            id="announcements-preview-title"
            className="text-[28px] md:text-[32px] leading-tight"
          >
            {t("home.announcementsPreview.title")}
          </h2>
          <Link
            href={`/${locale}/announcements`}
            className="group inline-flex shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {t("home.announcementsPreview.viewAll")}
            <ArrowUpRight
              aria-hidden="true"
              className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </Link>
        </div>

        {items.length === 0 ? (
          <p className="rounded-lg border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
            {t("home.announcementsPreview.empty")}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {items.map((a) => {
              const date = (a.start_at ?? a.created_at).slice(0, 10);
              return (
                <li key={a.id}>
                  <Link
                    href={`/${locale}/announcements/${a.id}`}
                    className="flex h-full min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-4 md:p-5 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <time
                      dateTime={date}
                      className="font-mono text-xs text-muted-foreground"
                    >
                      {date}
                    </time>
                    <span className="text-[15px] md:text-sm leading-normal line-clamp-2 break-words">
                      {a.title}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
