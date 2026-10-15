"use client";

/**
 * BackgroundTaskCard —— 后台异步任务通知卡片（悬浮弹窗与通知中心共用，数据同源）
 *
 * 展示规则（规范硬性约束）：
 * - 进行中：蓝色进度条 + 「当前：{message} ({progress}%)」；
 * - 成功：绿色，展示输出路径 + 「跳转到备份文件列表」按钮（数据库维护卡片锚点）；
 * - 失败：红色，完整错误文本 + 「复制错误日志」按钮；
 * - 完成/失败后不自动消失，用户手动点 X 关闭（dismiss）。
 */
import { useState } from "react";
import Link from "next/link";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import Copy from "@/assets/icons/action/copy.svg";
import Check from "@/assets/icons/action/check.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import X from "@/assets/icons/action/x.svg";
import XCircle from "@/assets/icons/status/x-circle.svg";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import { cn } from "@/lib/utils";
import type { BackgroundTask } from "@/types/api";

export function BackgroundTaskCard({
  task,
  onDismiss,
  dismissing = false,
}: {
  task: BackgroundTask;
  /** 用户点 X 手动关闭（dismiss API 已由调用方触发后的本地移除回调） */
  onDismiss: (taskId: string) => void;
  dismissing?: boolean;
}) {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const [copied, setCopied] = useState(false);

  const running = task.status === "pending" || task.status === "running";
  const success = task.status === "success";
  const failed = task.status === "failed";

  /** 标题按类别本地化（库中 title 为提交时语言，展示以当前 UI 语言为准） */
  const categoryKey = `notifications.backgroundTask.category.${task.category}`;
  const categoryLabel = t(categoryKey);
  const title = categoryLabel !== categoryKey ? categoryLabel : task.title;

  const statusText = running
    ? t("notifications.backgroundTask.statusRunning")
    : success
      ? t("notifications.backgroundTask.statusSuccess")
      : t("notifications.backgroundTask.statusFailed");

  const copyError = async () => {
    const text = task.result_payload?.error || task.message;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用（非安全上下文等）：静默忽略
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-3 shadow-sm",
        success && "border-green-500/40",
        failed && "border-destructive/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {running && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
          )}
          {success && (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
          )}
          {failed && (
            <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
          )}
          <span className="truncate text-sm font-semibold">{title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              running && "bg-primary/10 text-primary",
              success && "bg-green-500/10 text-green-600",
              failed && "bg-destructive/10 text-destructive"
            )}
          >
            {statusText}
          </span>
          <button
            type="button"
            onClick={() => onDismiss(task.id)}
            disabled={dismissing}
            aria-label={t("notifications.backgroundTask.dismiss")}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 进度条：进行中蓝色 / 成功绿色 / 失败红色（失败保持当前进度） */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            running && "bg-primary",
            success && "bg-green-500",
            failed && "bg-destructive"
          )}
          style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }}
        />
      </div>

      <div className="mt-1.5 text-xs text-muted-foreground">
        {running &&
          t("notifications.backgroundTask.currentProgress", {
            message: task.message,
            progress: task.progress,
          })}
        {success && (
          <span className="break-all">
            {t("notifications.backgroundTask.generatedFile", {
              path: task.result_payload?.path ?? "",
            })}
          </span>
        )}
      </div>

      {failed && (
        <pre className="mt-1.5 max-h-28 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-destructive/5 p-2 text-xs text-destructive">
          {task.result_payload?.error || task.message}
        </pre>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <FormattedUserActionTime
          utcIso={task.created_at}
          className="text-[10px] text-muted-foreground"
        />
        <div className="flex items-center gap-1.5">
          {failed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={copyError}
              className="h-6 gap-1 px-2 text-[11px]"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied
                ? t("notifications.backgroundTask.copied")
                : t("notifications.backgroundTask.copyError")}
            </Button>
          )}
          {success && (
            <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-[11px]">
              <Link href={`${lp("/admin/settings")}#db-maintenance`}>
                {t("notifications.backgroundTask.gotoMaintenance")}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
