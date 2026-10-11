/**
 * 统一状态徽章：报名审核 / Bug 反馈 / 密码重置审核 共用同一套色调语义
 * warning=待处理 / success=通过或已解决 / danger=拒绝 / info=已签到或补录 / neutral=表单来源等
 */
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-blue-500/10 text-blue-600",
  success: "bg-emerald-500/10 text-emerald-600",
  warning: "bg-amber-500/10 text-amber-600",
  danger: "bg-rose-500/10 text-rose-600",
} as const;

export type StatusTone = keyof typeof TONES;

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full whitespace-nowrap inline-flex items-center",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
