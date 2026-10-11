"use client";

/**
 * Hero - 首页横幅区（克制科技风）
 * 左：状态胶囊 + 大标题 + 口号 + 简介 + 行动按钮；右：2×2 数据格（细线分隔）
 * 小屏上下堆叠；入场使用轻量 Framer Motion 淡入
 */
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: "easeOut" as const },
});

export function Hero() {
  const { locale, t } = useI18n();

  const stats = [
    { label: t("home.hero.stat1"), value: "36" },
    { label: t("home.hero.stat2"), value: "7" },
    { label: t("home.hero.stat3"), value: "14" },
    { label: t("home.hero.stat4"), value: "2008" },
  ];

  return (
    <section className="border-b border-border">
      <div className="container mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 py-12 md:py-24 grid gap-10 lg:grid-cols-12 lg:gap-20 lg:items-center">
        <div className="lg:col-span-7 flex flex-col items-start">
          {/* 状态胶囊 */}
          <motion.div
            {...fadeUp(0)}
            className="inline-flex h-7 items-center gap-2 rounded-full border border-border bg-card px-3 font-mono text-[11px] sm:text-xs text-muted-foreground"
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
            {t("home.hero.badge")}
          </motion.div>

          <motion.h1
            {...fadeUp(0.05)}
            className="mt-5 md:mt-6 text-[52px] md:text-7xl lg:text-8xl leading-[1.05] font-bold tracking-[-0.03em]"
          >
            {t("home.hero.title")}
          </motion.h1>

          <motion.p
            {...fadeUp(0.1)}
            className="mt-3 text-lg md:text-2xl font-medium leading-snug"
          >
            {t("home.hero.subtitle")}
          </motion.p>

          <motion.p
            {...fadeUp(0.15)}
            className="mt-4 max-w-xl text-[15px] md:text-[17px] leading-relaxed md:leading-[1.7] text-muted-foreground text-pretty"
          >
            {t("home.hero.description")}
          </motion.p>

          <motion.div
            {...fadeUp(0.2)}
            className="mt-6 md:mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
          >
            <Button asChild size="lg">
              <Link href={`/${locale}/join`} transitionTypes={["nav-forward"]}>
                {t("home.hero.cta1")}
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/${locale}/about`} transitionTypes={["nav-forward"]}>
                {t("home.hero.cta2")}
              </Link>
            </Button>
          </motion.div>
        </div>

        {/* 数据格：1px 间隙透出分隔线颜色 */}
        <motion.div
          {...fadeUp(0.25)}
          className="lg:col-span-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border"
        >
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="flex h-[104px] md:h-[150px] flex-col justify-between bg-card p-4 md:px-7 md:py-6"
            >
              <span aria-hidden="true" className="hidden md:block font-mono text-xs text-muted-foreground">
                /0{i + 1}
              </span>
              <div className="mt-auto flex flex-col gap-1">
                <span className="text-[34px] md:text-[52px] leading-none font-semibold tracking-[-0.03em]">
                  {stat.value}
                </span>
                <span className="text-[13px] md:text-sm text-muted-foreground">{stat.label}</span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
