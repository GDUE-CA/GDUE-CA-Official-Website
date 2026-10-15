"use client";

/**
 * RuntimeStatusBadge - 活动实时业务状态标签（P0：预报名/报名中/即将进行/进行中/已结束）
 *
 * 状态由后端按当前 UTC 时间实时计算（runtime_status，不存库），前端仅做展示映射：
 * - pre_register 预报名：灰
 * - registration_open 报名中：主色
 * - upcoming 即将进行：描边蓝调
 * - ongoing 进行中：绿色 + 呼吸点
 * - ended 已结束：弱化灰
 * - archived 已归档：描边 + 归档图标
 * - draft 草稿：琥珀（仅后台可见）
 */
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import Archive from "@/assets/icons/action/archive.svg";
import type { RuntimeStatus } from "@/types/api";

const STATUS_STYLES: Record<
  RuntimeStatus,
  { badgeClass: string; dotClass?: string }
> = {
  pre_register: { badgeClass: "border-border bg-secondary text-secondary-foreground" },
  registration_open: {
    badgeClass: "border-transparent bg-primary text-primary-foreground",
  },
  upcoming: {
    badgeClass: "border-primary/40 bg-primary/10 text-primary",
  },
  ongoing: {
    badgeClass: "border-transparent bg-emerald-600 text-white",
    dotClass: "h-1.5 w-1.5 rounded-full bg-white animate-pulse",
  },
  ended: {
    badgeClass: "border-border bg-muted text-muted-foreground",
  },
  draft: {
    badgeClass: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  archived: {
    badgeClass: "border-border bg-muted text-muted-foreground",
  },
};

export function RuntimeStatusBadge({
  status,
  className,
}: {
  status: RuntimeStatus | null;
  className?: string;
}) {
  const { t } = useI18n();
  if (!status) return null;
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.ended;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        style.badgeClass,
        className
      )}
    >
      {status === "archived" && <Archive className="h-3 w-3" aria-hidden="true" />}
      {style.dotClass && <span className={style.dotClass} aria-hidden="true" />}
      {t(`events.status.${status}`)}
    </span>
  );
}
