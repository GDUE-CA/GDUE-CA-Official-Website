"use client";

/**
 * EventsPreview - 首页「近期活动」区块（便当格）
 * 标题行 + 「查看全部」；最新一场为大卡片（带节点线条插图），其余三场为紧凑卡片
 * 所有卡片均可点击，前进滑入活动页
 */
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import type { ClubEvent } from "@/types/api";

interface EventsPreviewProps {
  events: ClubEvent[];
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

/** 活动类型标签文案 */
function typeLabel(t: (key: string) => string, type: string) {
  return t(`events.filter${type.charAt(0).toUpperCase()}${type.slice(1)}`);
}

const cardClass =
  "rounded-2xl border border-border bg-card transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** 节点线条插图：主线 + 分支 + 合并点（强调色）；Git 主题活动附带分支名标注 */
function CommitGraph({ labelled }: { labelled: boolean }) {
  return (
    <svg viewBox="0 0 560 110" fill="none" aria-hidden="true" className="h-20 md:h-[110px] w-full">
      <path d="M10 76H550" className="stroke-border" strokeWidth="2" />
      <path d="M130 76C170 76 170 32 210 32H400C440 32 440 76 480 76" className="stroke-border" strokeWidth="2" />
      {[
        [50, 76],
        [130, 76],
        [250, 32],
        [320, 32],
        [390, 32],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="6" className="fill-card stroke-muted-foreground" strokeWidth="2" />
      ))}
      <circle cx="480" cy="76" r="8" className="fill-signal" />
      <circle cx="480" cy="76" r="14" className="stroke-signal" strokeOpacity="0.35" strokeWidth="2" />
      {labelled && (
        <g className="fill-muted-foreground font-mono" fontSize="11">
          <text x="10" y="100">main</text>
          <text x="210" y="18">feature/first-pr</text>
          <text x="500" y="100">merge</text>
        </g>
      )}
    </svg>
  );
}

export function EventsPreview({ events }: EventsPreviewProps) {
  const { locale, t } = useI18n();

  if (events.length === 0) return null;

  const eventsHref = `/${locale}/events`;
  const [featured, ...rest] = events;

  return (
    <section
      aria-labelledby="events-preview-title"
      className="container mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 py-10 md:py-[72px]"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between mb-5 md:mb-8">
        <div className="flex flex-col gap-1.5">
          <h2 id="events-preview-title" className="text-[28px] md:text-4xl leading-tight">
            {t("home.events.title")}
          </h2>
          <p className="text-[15px] md:text-base text-muted-foreground">{t("home.events.subtitle")}</p>
        </div>
        <Button asChild variant="outline" className="hidden sm:inline-flex">
          <Link href={eventsHref} transitionTypes={["nav-forward"]}>
            {t("common.viewAll")}
            <ArrowRight />
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 md:gap-4 lg:grid-cols-12 lg:h-[384px]">
        {/* 最新一场：大卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35 }}
          className="lg:col-span-7"
        >
          <Link
            href={eventsHref}
            transitionTypes={["nav-forward"]}
            className={`${cardClass} flex h-full flex-col justify-between gap-4 p-6 md:p-8`}
          >
            <div className="flex items-center justify-between md:justify-start gap-3">
              <time dateTime={featured.date} className="font-mono text-xs md:text-[13px] text-muted-foreground">
                {featured.date}
              </time>
              <span className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-xs">
                {typeLabel(t, featured.type)}
              </span>
            </div>
            <CommitGraph labelled={featured.slug === "git-workshop"} />
            <div className="flex flex-col gap-2.5">
              <h3 className="text-2xl md:text-[32px] leading-tight">
                {localizedEventField(t, featured.slug, "title", featured.title)}
              </h3>
              <p className="text-sm md:text-[15px] leading-relaxed text-muted-foreground line-clamp-2">
                {localizedEventField(t, featured.slug, "description", featured.description)}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs md:text-[13px] text-muted-foreground">
                {featured.participants} {t("common.peopleJoined")}
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                {t("common.viewDetails")}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        </motion.div>

        {/* 其余活动：紧凑卡片 */}
        <div className="flex flex-col gap-3 md:gap-4 lg:col-span-5">
          {rest.map((event, i) => (
            <motion.div
              key={event.slug}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: (i + 1) * 0.06 }}
              className="lg:flex-1"
            >
              <Link
                href={eventsHref}
                transitionTypes={["nav-forward"]}
                className={`${cardClass} flex h-full flex-col justify-between gap-2 px-5 py-[18px] md:px-6`}
              >
                <div className="flex items-center justify-between">
                  <time dateTime={event.date} className="font-mono text-xs text-muted-foreground">
                    {event.date}
                  </time>
                  <span className="inline-flex h-[22px] items-center rounded-full border border-border px-2 text-xs">
                    {typeLabel(t, event.type)}
                  </span>
                </div>
                <h3 className="text-[17px] md:text-lg font-semibold tracking-[-0.01em] truncate">
                  {localizedEventField(t, event.slug, "title", event.title)}
                </h3>
                <span className="font-mono text-xs text-muted-foreground">
                  {event.participants} {t("common.peopleJoined")}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 手机端：查看全部放在列表下方 */}
      <Button asChild variant="outline" size="lg" className="mt-5 w-full sm:hidden">
        <Link href={eventsHref} transitionTypes={["nav-forward"]}>
          {t("common.viewAll")}
          <ArrowRight />
        </Link>
      </Button>
    </section>
  );
}
