"use client";

/**
 * BadgeChip / BadgeList - 用户公开徽章（纯 UI 展示装饰，与权限彻底解耦）
 *
 * - 系统内置徽章：后端仅下发 key，emoji / 配色 / 文案由前端映射（文案走 i18n badges.system.<key>）
 * - 自定义徽章：后端下发 name / emoji / bg_color / text_color（颜色已经过后端格式校验，文本已经过 XSS 清洗）
 * - 业务鉴权永远读取 role 角色字段，严禁依靠徽章做任何权限判断
 */
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { BadgeOut } from "@/types/api";

/** 系统内置徽章展示元数据（优先级顺序由后端决定，此处仅负责渲染样式） */
const SYSTEM_BADGE_META: Record<string, { emoji: string; className: string }> = {
  president: {
    emoji: "👑",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  vice_president: {
    emoji: "🥇",
    className: "bg-yellow-600/15 text-yellow-700 dark:text-yellow-300",
  },
  admin: {
    emoji: "🏛️",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  member: {
    emoji: "🔧",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
};

const chipBase =
  "inline-flex items-center gap-0.5 px-1.5 h-5 rounded-full text-[10px] font-medium whitespace-nowrap";

export function BadgeChip({
  badge,
  className,
}: {
  badge: BadgeOut;
  className?: string;
}) {
  const { t } = useI18n();

  if (badge.type === "system") {
    const meta = badge.key ? SYSTEM_BADGE_META[badge.key] : undefined;
    if (!meta) return null;
    return (
      <span className={cn(chipBase, meta.className, className)}>
        <span aria-hidden="true">{meta.emoji}</span>
        {t(`badges.system.${badge.key}`)}
      </span>
    );
  }

  return (
    <span
      className={cn(chipBase, className)}
      style={{
        backgroundColor: badge.bg_color ?? "#6366f1",
        color: badge.text_color ?? "#ffffff",
      }}
    >
      {badge.emoji ? <span aria-hidden="true">{badge.emoji}</span> : null}
      {badge.name}
    </span>
  );
}

/** 徽章组：固定顺序【最高等级系统徽章】+【自定义徽章 1..3】（后端已排好序，前端原样渲染） */
export function BadgeList({
  badges,
  className,
}: {
  badges: BadgeOut[] | null | undefined;
  className?: string;
}) {
  if (!badges || badges.length === 0) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 flex-wrap", className)}>
      {badges.map((b, i) => (
        <BadgeChip
          key={b.type === "custom" ? `c-${b.id}` : `s-${b.key ?? i}`}
          badge={b}
        />
      ))}
    </span>
  );
}
