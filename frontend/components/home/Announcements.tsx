"use client";

/**
 * Announcements - 首页公告栏
 * 桌面：标签 + 三栏公告（细线分隔，单行截断省略）；手机：纵向列表
 * 悬浮公告条目弹出预览卡片（标题 / 摘要 / 发布时间）；点击条目：公告配置了 link 时直接跳转
 * （站内路径加 locale 前缀，外链新标签页打开），否则进入公告详情页；
 * 弹层为原生 div + 受控 open + CSS 过渡（见 SettingsDropdown 同类实现）
 * 数据源：CMS 主页公告（category=home）前 3 条；加载中显示骨架，失败/为空显示空态
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ArrowUpRight from "@/assets/icons/navigation/arrow-up-right.svg";
import { useI18n } from "@/i18n/provider";
import { listPublicAnnouncements } from "@/lib/api/announcements";
import { markdownExcerpt } from "@/lib/utils";
import type { PublicAnnouncement } from "@/types/api";

/** 公告条目统一形状（CMS 公告与 i18n 回退项归一，供列表与预览卡片渲染） */
interface NoticeItem {
  key: string;
  title: string;
  date: string; // 纯日期 YYYY-MM-DD（与现有展示样式一致）
  excerpt: string; // 摘要（由正文 Markdown 纯文本化截断）
  href: string; // 跳转目标：站内路径已带 locale 前缀，外链为 http(s) 绝对地址
  external: boolean;
}

/**
 * 公告 link → 跳转目标；后端 SafeUrl 只放行 http(s) 与 "/" 开头路径，
 * 但 "/\\host" 会被浏览器当作 "//host"（协议相对外链），此处一并拒绝，回退到详情页
 */
function resolveHref(a: PublicAnnouncement, locale: string): { href: string; external: boolean } {
  const link = a.link?.trim();
  if (link && /^https?:\/\//i.test(link)) return { href: link, external: true };
  if (link && link.startsWith("/") && !/^\/[/\\]/.test(link)) return { href: `/${locale}${link}`, external: false };
  return { href: `/${locale}/announcements/${a.id}`, external: false };
}

/** 外链新标签页打开（与公告详情页「相关链接」一致） */
function linkTarget(item: NoticeItem) {
  return item.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

/** 鼠标离开后延迟关闭，避免跨条目移动时弹层闪烁 */
const CLOSE_DELAY_MS = 150;

/** 预览卡片的 id（供条目 aria-controls 关联） */
const POPOVER_ID = "home-announcement-popover";

export function Announcements() {
  const { t, locale } = useI18n();
  const [cmsItems, setCmsItems] = useState<PublicAnnouncement[] | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  // 弹层打开期间：点击外部区域关闭
  useEffect(() => {
    if (!open) return;
    const closeAll = () => setActive(null);
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeAll();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
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
    closeTimer.current = setTimeout(() => setActive(null), CLOSE_DELAY_MS);
  }

  const list: NoticeItem[] = (cmsItems ?? []).map((a) => ({
    key: `cms-${a.id}`,
    title: a.title,
    date: (a.start_at ?? a.created_at).slice(0, 10),
    excerpt: markdownExcerpt(a.content),
    ...resolveHref(a, locale),
  }));

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
          {cmsItems === null &&
            [0, 1, 2].map((i) => (
              <li
                key={`skeleton-${i}`}
                aria-hidden="true"
                className="flex min-w-0 flex-col gap-2 py-4 first:pt-0 md:py-0 md:flex-1 md:pl-6 border-b last:border-b-0 md:border-b-0 md:border-l border-border"
              >
                <span className="h-3 w-20 rounded-sm bg-muted animate-pulse" />
                <span className="h-4 w-3/4 rounded-sm bg-muted animate-pulse" />
              </li>
            ))}
          {cmsItems !== null && list.length === 0 && (
            <li className="flex min-w-0 md:flex-1 md:pl-6 md:border-l border-border text-sm text-muted-foreground">
              {t("announcements.empty")}
            </li>
          )}
          {list.map((item, i) => (
            <li
              key={item.key}
              className="flex min-w-0 py-4 first:pt-0 md:py-0 md:flex-1 md:pl-6 border-b last:border-b-0 md:border-b-0 md:border-l border-border"
              onMouseEnter={() => {
                cancelClose();
                setActive(i);
              }}
            >
              {/* 整行可点：有 link 直接跳转，否则进详情（桌面悬浮显示预览卡片） */}
              <Link
                href={item.href}
                {...linkTarget(item)}
                aria-controls={POPOVER_ID}
                className="flex w-full min-w-0 flex-col gap-1 text-left rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                <time dateTime={item.date} className="font-mono text-xs text-muted-foreground">
                  {item.date}
                </time>
                <span className="text-[15px] md:text-sm leading-normal md:truncate block w-full min-w-0">
                  {item.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* 预览卡片：始终渲染，透明度/位移过渡（面板挂在栏底，覆盖后续区块） */}
        <div
          id={POPOVER_ID}
          aria-hidden={!open}
          className={`absolute left-5 right-5 sm:left-6 sm:right-6 lg:left-8 lg:right-8 top-full z-50 transition-[opacity,transform] duration-200 ease-out ${
            open ? "opacity-100 translate-y-1" : "pointer-events-none opacity-0 -translate-y-1"
          }`}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="rounded-md border border-border bg-popover text-popover-foreground shadow-md max-h-[60vh] overflow-y-auto">
            {activeItem && (
              <Link
                href={activeItem.href}
                {...linkTarget(activeItem)}
                className="block p-5 rounded-md transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <time
                  dateTime={activeItem.date}
                  className="font-mono text-xs text-muted-foreground"
                >
                  {activeItem.date}
                </time>
                <h3 className="mt-1.5 text-[15px] md:text-base font-semibold leading-snug break-words">
                  {activeItem.title}
                </h3>
                {activeItem.excerpt && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-3 break-words">
                    {activeItem.excerpt}
                  </p>
                )}
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
                  {t("home.announcements.viewDetail")}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
