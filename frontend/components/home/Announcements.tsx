"use client";

/**
 * Announcements - 首页公告栏
 * 桌面：标签 + 三栏公告（细线分隔，单行截断省略）；手机：纵向列表
 * 悬浮或点击公告弹出完整内容卡片（含标题/发布时间/全部正文/可选链接），
 * 点击外部区域或 ESC 关闭；弹层为原生 div + 受控 open + CSS 过渡（见 SettingsDropdown 同类实现）
 * 数据源：CMS 主页公告（category=home）前 3 条；加载中/失败/为空时回退到 i18n 内置公告
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { listPublicAnnouncements } from "@/lib/api/announcements";
import type { Announcement } from "@/types/api";

/** 公告条目统一形状（CMS 公告与 i18n 回退项归一，供弹出卡片渲染） */
interface NoticeItem {
  key: string;
  title: string;
  date: string; // 纯日期 YYYY-MM-DD（与现有展示样式一致）
  content: string; // 完整正文
  link: string | null;
}

/** 外链新窗口打开，站内链接走 next/link */
function AnnouncementLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

/** 鼠标离开后延迟关闭，避免跨条目移动时弹层闪烁 */
const CLOSE_DELAY_MS = 150;

export function Announcements() {
  const { t, locale } = useI18n();
  const [cmsItems, setCmsItems] = useState<Announcement[] | null>(null);
  const [hovered, setHovered] = useState<number | null>(null); // 悬浮条目（临时）
  const [pinned, setPinned] = useState<number | null>(null); // 单击条目（固定，移出不关闭）
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = pinned ?? hovered;
  const open = active !== null;

  useEffect(() => {
    let cancelled = false;
    // lang=当前显示语言：后端自动翻译公告标题/内容（缓存加速，失败回退原文）
    listPublicAnnouncements("home", locale)
      .then((list) => {
        if (!cancelled) setCmsItems(list.slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) setCmsItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // 弹层打开期间：ESC / 点击外部区域关闭
  useEffect(() => {
    if (!open) return;
    const closeAll = () => {
      setPinned(null);
      setHovered(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeAll();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  // 卸载时清理延迟关闭定时器
  useEffect(() => () => cancelClose(), []);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setHovered(null), CLOSE_DELAY_MS);
  }

  const fallbackItems: NoticeItem[] = [1, 2, 3]
    .map((n) => ({
      key: `fallback-${n}`,
      title: t(`home.announcements.item${n}Title`),
      date: t(`home.announcements.item${n}Date`),
      content: "",
      link: null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const list: NoticeItem[] =
    cmsItems && cmsItems.length > 0
      ? cmsItems.slice(0, 3).map((a) => ({
          key: `cms-${a.id}`,
          title: a.title,
          date: (a.start_at ?? a.created_at).slice(0, 10),
          content: a.content,
          link: a.link,
        }))
      : fallbackItems;

  const activeItem = active !== null ? list[active] : undefined;

  return (
    <section
      aria-labelledby="announcements-title"
      className="border-b border-border bg-card"
    >
      <div
        ref={rootRef}
        className="relative container mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 py-7 md:py-0 md:h-[88px] flex flex-col md:flex-row md:items-center gap-4 md:gap-8"
      >
        <div className="flex items-baseline justify-between md:w-[120px] md:shrink-0 md:flex-col md:gap-0.5">
          <h2 id="announcements-title" className="text-[15px] md:text-sm font-semibold tracking-normal">
            {t("home.announcements.title")}
          </h2>
          <span aria-hidden="true" className="font-mono text-[11px] text-muted-foreground">
            NOTICE
          </span>
        </div>
        <ul
          className="flex flex-col md:flex-row md:flex-1 md:min-w-0"
          onMouseLeave={scheduleClose}
        >
          {list.map((item, i) => (
            <li
              key={item.key}
              role="button"
              tabIndex={0}
              aria-expanded={open && active === i}
              className="flex min-w-0 flex-col gap-1 py-4 first:pt-0 md:py-0 md:flex-1 md:pl-6 border-b last:border-b-0 md:border-b-0 md:border-l border-border cursor-pointer outline-none focus-visible:opacity-70"
              onMouseEnter={() => {
                cancelClose();
                setHovered(i);
              }}
              onClick={() => setPinned((p) => (p === i ? null : i))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPinned((p) => (p === i ? null : i));
                }
              }}
            >
              <time dateTime={item.date} className="font-mono text-xs text-muted-foreground">
                {item.date}
              </time>
              <span className="text-[15px] md:text-sm leading-normal md:truncate block min-w-0">
                {item.title}
              </span>
            </li>
          ))}
        </ul>

        {/* 完整内容弹出卡片：始终渲染，透明度/位移过渡（面板挂在栏底，覆盖后续区块） */}
        <div
          aria-hidden={!open}
          className={`absolute left-5 right-5 sm:left-6 sm:right-6 lg:left-8 lg:right-8 top-full z-50 transition-[opacity,transform] duration-200 ease-out ${
            open ? "opacity-100 translate-y-1" : "pointer-events-none opacity-0 -translate-y-1"
          }`}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="rounded-md border border-border bg-popover text-popover-foreground shadow-md max-h-[60vh] overflow-y-auto">
            {activeItem && (
              <div className="p-5">
                <time
                  dateTime={activeItem.date}
                  className="font-mono text-xs text-muted-foreground"
                >
                  {activeItem.date}
                </time>
                <h3 className="mt-1.5 text-[15px] md:text-base font-semibold leading-snug break-words">
                  {activeItem.title}
                </h3>
                {activeItem.content && (
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                    {activeItem.content}
                  </p>
                )}
                {activeItem.link && (
                  <AnnouncementLink
                    href={activeItem.link}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {t("home.announcements.viewDetail")}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </AnnouncementLink>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
