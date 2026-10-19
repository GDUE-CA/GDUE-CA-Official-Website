"use client";

/**
 * Hero - 首页横幅区（克制科技风 · 动态软编码）
 *
 * V0.6.1 需求3：文本 / 按钮 / 统计卡片 / 背景图全部由后端 Hero 配置驱动（props 传入），
 * 前端不再硬编码。文案为空时回退 i18n 文案；背景图加载失败降级为纯色背景。
 * 左：眉题 + 大标题 + 口号 + 简介 + 行动按钮；右：2×2 数据格（细线分隔）。
 */
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import ArrowRight from "@/assets/icons/navigation/arrow-right.svg";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/shared/CountUp";
import type { HeroPublic, HeroPublicButton } from "@/types/api";

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: "easeOut" as const },
});

/** 站内相对路径补上当前 locale 前缀；绝对地址（http(s)）原样使用 */
function resolveHref(href: string, locale: string): string {
  if (href.startsWith("/")) return `/${locale}${href}`;
  return href;
}

export function Hero({ hero }: { hero: HeroPublic }) {
  const { locale, t } = useI18n();
  const [bgFailed, setBgFailed] = useState(false);

  const bgUrl = hero.background_url;
  const showBg = !!bgUrl && !bgFailed;

  // 后端未返回按钮时（如接口不可用）回退为 i18n 标准入口，保证行动区不空白
  const buttons: HeroPublicButton[] =
    hero.buttons.length > 0
      ? hero.buttons
      : [
          { id: "join-club", label: t("register.clubTitle"), href: "/join?mode=club", variant: "default", enabled: true },
          { id: "join-event", label: t("register.eventTitle"), href: "/join?mode=event", variant: "outline", enabled: true },
          { id: "about", label: t("nav.about"), href: "/about", variant: "outline", enabled: true },
        ];

  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* 背景图：透明度 + 磨砂模糊；加载失败/无图时降级为纯色（section 默认底色） */}
      {showBg && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ opacity: Math.min(Math.max(hero.background_opacity, 0), 100) / 100 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bgUrl}
            alt=""
            className="h-full w-full object-cover"
            style={{ filter: `blur(${Math.min(Math.max(hero.background_blur, 0), 24)}px)` }}
            onError={() => setBgFailed(true)}
          />
        </div>
      )}

      <div className="relative container mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 py-12 md:py-24 grid gap-10 lg:grid-cols-12 lg:gap-20 lg:items-center">
        <div className="lg:col-span-7 flex flex-col items-start">
          {/* 眉题：学校 · 校区（成立年份已在右侧数据格展示，不再重复） */}
          <motion.p
            {...fadeUp(0)}
            className="flex items-center gap-3 text-[13px] md:text-sm text-muted-foreground"
          >
            <span aria-hidden="true" className="h-px w-6 shrink-0 bg-foreground/30" />
            {hero.eyebrow || t("home.hero.eyebrow")}
          </motion.p>

          <motion.h1 {...fadeUp(0.05)} className="hero-display-title mt-5 md:mt-6">
            {hero.title || t("home.hero.title")}
          </motion.h1>

          <motion.p
            {...fadeUp(0.1)}
            className="mt-3 text-lg md:text-2xl font-medium leading-snug"
          >
            {hero.subtitle || t("home.hero.subtitle")}
          </motion.p>

          <motion.p
            {...fadeUp(0.15)}
            className="mt-4 max-w-xl text-[15px] md:text-[17px] leading-relaxed md:leading-[1.7] text-muted-foreground text-pretty"
          >
            {hero.description || t("home.hero.description")}
          </motion.p>

          {buttons.length > 0 && (
            <motion.div
              {...fadeUp(0.2)}
              className="mt-6 md:mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap"
            >
              {buttons.map((btn, i) => (
                <Button
                  key={btn.id || `hero-btn-${i}`}
                  asChild
                  size="lg"
                  variant={btn.variant === "outline" ? "outline" : "default"}
                >
                  <Link href={resolveHref(btn.href, locale)} transitionTypes={["nav-forward"]}>
                    {btn.label || btn.href}
                    {i === 0 && btn.variant !== "outline" && <ArrowRight />}
                  </Link>
                </Button>
              ))}
            </motion.div>
          )}
        </div>

        {/* 数据格：1px 间隙透出分隔线颜色 */}
        {hero.stats.length > 0 && (
          <motion.div
            {...fadeUp(0.25)}
            className="lg:col-span-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border"
          >
            {hero.stats.map((stat, i) => {
              const value = stat.value ?? "";
              const isNumeric = /^\d+$/.test(value.trim());
              return (
                <div
                  key={`${stat.label ?? ""}-${i}`}
                  className="flex h-[104px] md:h-[150px] flex-col justify-between bg-card p-4 md:px-7 md:py-6"
                >
                  <span aria-hidden="true" className="hidden md:block font-mono text-xs text-muted-foreground">
                    /0{i + 1}
                  </span>
                  <div className="mt-auto flex flex-col gap-1">
                    {isNumeric ? (
                      <CountUp
                        to={Number(value)}
                        from={stat.from_value ?? 0}
                        delay={0.3}
                        className="text-[34px] md:text-[52px] leading-none font-semibold tracking-[-0.03em]"
                      />
                    ) : (
                      <span className="text-[34px] md:text-[52px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
                        {value}
                      </span>
                    )}
                    <span className="text-[13px] md:text-sm text-muted-foreground">
                      {stat.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </div>
    </section>
  );
}
