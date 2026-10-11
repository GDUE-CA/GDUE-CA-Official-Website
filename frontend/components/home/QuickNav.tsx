"use client";

/**
 * QuickNav - 首页快速导航（编号宫格）
 * 4 个入口：项目、活动、招新、博客；桌面 4 列 / 手机 2 列，1px 细线分隔
 * 点击后前进滑入栏目页，卡片标题与栏目页大标题做共享元素过渡（page-title-*）
 */
import { ViewTransition } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useI18n } from "@/i18n/provider";

export function QuickNav() {
  const { locale, t } = useI18n();

  const items = [
    { title: t("home.quickNav.projectsTitle"), desc: t("home.quickNav.projectsDesc"), href: "/projects" },
    { title: t("home.quickNav.eventsTitle"), desc: t("home.quickNav.eventsDesc"), href: "/events" },
    { title: t("home.quickNav.joinTitle"), desc: t("home.quickNav.joinDesc"), href: "/join" },
    { title: t("home.quickNav.blogTitle"), desc: t("home.quickNav.blogDesc"), href: "/blog" },
  ];

  return (
    <section
      aria-labelledby="quicknav-title"
      className="border-t border-border"
    >
      <div className="container mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 py-10 md:py-14">
        <div className="flex flex-col gap-1.5 mb-5 md:mb-6">
          <h2 id="quicknav-title" className="text-[28px] md:text-[32px] leading-tight">
            {t("home.quickNav.title")}
          </h2>
          <p className="text-[15px] md:text-base text-muted-foreground">{t("home.quickNav.subtitle")}</p>
        </div>
        <ul className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-border bg-border">
          {items.map((item, i) => (
            <li key={item.href} className="bg-card">
              <Link
                href={`/${locale}${item.href}`}
                transitionTypes={["nav-forward"]}
                className="group flex h-[132px] flex-col justify-between p-4 md:px-6 md:py-[22px] transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="font-mono text-xs">0{i + 1}</span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <ViewTransition
                    name={`page-title-${item.href.slice(1)}`}
                    share="text-morph"
                    default="none"
                  >
                    <h3 className="text-base md:text-lg font-semibold tracking-normal">{item.title}</h3>
                  </ViewTransition>
                  <p className="text-[13px] md:text-sm leading-normal text-muted-foreground">{item.desc}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
