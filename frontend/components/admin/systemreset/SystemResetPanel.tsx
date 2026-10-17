"use client";

/**
 * SystemResetPanel —— V0.5.7 最高危运维功能「系统重置」
 *
 * 三重确认（任一不满足，执行按钮永久置灰）：
 *   ① 勾选「已阅读并理解全部风险」
 *   ② 逐字输入固定英文 I confirm system reset
 *   ③ 点击执行后弹出第二层 Dialog，最终确认才真正发请求
 *
 * 执行由后端异步任务驱动（category=system_reset）：
 *   - 强制先全库自动备份，备份失败后端会直接终止，绝不清空；
 *   - 成功后所有会话失效，本面板继续轮询必然收到 401，
 *     此时调用公开的 /api/system-init/status 判定 system_initialized=false，
 *     进入「已重置」终态并清理本地登录态，引导前往 Break-Glass 初始化向导。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AlertTriangle from "@/assets/icons/status/alert-triangle.svg";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import XCircle from "@/assets/icons/status/x-circle.svg";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { ApiError } from "@/lib/api/client";
import { SYSTEM_RESET_CONFIRM_TEXT, submitSystemReset } from "@/lib/api/systemReset";
import {
  getBackgroundTask,
  notifyBackgroundTaskSubmitted,
} from "@/lib/api/backgroundTasks";
import { fetchSystemInitStatus } from "@/lib/api/auth";
import { clearLocalSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { BackgroundTask } from "@/types/api";

type Phase = "idle" | "running" | "success" | "failed" | "completed";

const POLL_INTERVAL_MS = 1000;

export function SystemResetPanel() {
  const { t } = useI18n();
  const lp = useLocalizedPath();

  // —— 三重确认状态 ——
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // —— 任务状态 ——
  const [phase, setPhase] = useState<Phase>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [task, setTask] = useState<BackgroundTask | null>(null);
  const [errorText, setErrorText] = useState("");

  const timerRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    stoppedRef.current = false;
    return () => {
      stoppedRef.current = true;
      clearTimer();
    };
  }, []);

  const textMatched = confirmText === SYSTEM_RESET_CONFIRM_TEXT;
  const canExecute = acknowledged && textMatched && phase !== "running";

  /** 轮询到 401：会话已随重置失效，用公开初始化状态接口判定是否重置成功 */
  const handlePollUnauthorized = useCallback(async () => {
    clearTimer();
    try {
      const status = await fetchSystemInitStatus();
      if (!status.system_initialized) {
        clearLocalSession();
        setPhase("completed");
        return;
      }
    } catch {
      // 状态接口也不可用时落到失败提示，允许用户重新登录后核对
    }
    setPhase("failed");
    setErrorText(t("admin.systemReset.sessionLost"));
  }, [t]);

  const pollTask = useCallback(
    async (taskId: string) => {
      if (stoppedRef.current) return;
      try {
        const res = await getBackgroundTask(taskId);
        if (stoppedRef.current) return;
        setTask(res);
        if (res.status === "success") {
          setPhase("success");
          return;
        }
        if (res.status === "failed") {
          setPhase("failed");
          setErrorText(res.result_payload?.error || res.message);
          return;
        }
        timerRef.current = window.setTimeout(() => void pollTask(taskId), POLL_INTERVAL_MS);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await handlePollUnauthorized();
          return;
        }
        clearTimer();
        setPhase("failed");
        setErrorText(e instanceof Error ? e.message : String(e));
      }
    },
    [handlePollUnauthorized]
  );

  // —— 第三重：二次 Modal 内的最终确认 ——
  const handleFinalConfirm = async () => {
    setSubmitting(true);
    setErrorText("");
    try {
      const res = await submitSystemReset(SYSTEM_RESET_CONFIRM_TEXT);
      setDialogOpen(false);
      setPhase("running");
      notifyBackgroundTaskSubmitted();
      timerRef.current = window.setTimeout(
        () => void pollTask(res.task_id),
        POLL_INTERVAL_MS
      );
    } catch (e) {
      // 400 确认文案不符 / 409 已有进行中任务 / 403 权限：原样展示后端信息
      setErrorText(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const running = phase === "running";
  const progress = task?.progress ?? 0;
  const backupFilename =
    task?.result_payload?.backup_filename ?? task?.result_payload?.filename ?? "";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      {/* 红色高危警示头 */}
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          <h1 className="text-base font-bold">{t("admin.systemReset.title")}</h1>
        </div>
        <p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-destructive">
          {t("admin.systemReset.warningText")}
        </p>
      </div>

      {/* 执行前：三重确认区 */}
      {(phase === "idle" || phase === "failed") && (
        <div className="rounded-lg border bg-card p-4">
          {phase === "failed" && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <div className="font-semibold">{t("admin.systemReset.failedTitle")}</div>
                <pre className="mt-1 whitespace-pre-wrap break-all text-xs">
                  {errorText}
                </pre>
              </div>
            </div>
          )}

          <h2 className="text-sm font-semibold">{t("admin.systemReset.confirmTitle")}</h2>
          <ol className="mt-3 space-y-4">
            {/* ① 复选框 */}
            <li>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-destructive"
                />
                <span>{t("admin.systemReset.acknowledge")}</span>
              </label>
            </li>

            {/* ② 固定英文逐字输入 */}
            <li>
              <label htmlFor="system-reset-confirm" className="block text-sm font-medium">
                {t("admin.systemReset.inputLabel")}
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("admin.systemReset.inputHint")}
              </p>
              <input
                id="system-reset-confirm"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={SYSTEM_RESET_CONFIRM_TEXT}
                className="mt-2 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-destructive focus:ring-1 focus:ring-destructive"
              />
              {confirmText.length > 0 && !textMatched && (
                <p className="mt-1 text-xs text-destructive">
                  {t("admin.systemReset.inputMismatch")}
                </p>
              )}
            </li>
          </ol>

          {/* ③ 按钮（条件不满足永久置灰；点击只打开第二层 Modal） */}
          <Button
            variant="destructive"
            className="mt-5"
            disabled={!canExecute}
            onClick={() => {
              setErrorText("");
              setDialogOpen(true);
            }}
          >
            {t("admin.systemReset.executeBtn")}
          </Button>
        </div>
      )}

      {/* 进行中 / 成功：进度卡 */}
      {(running || phase === "success") && (
        <div
          className={cn(
            "rounded-lg border bg-card p-4",
            phase === "success" && "border-green-500/40"
          )}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
                {t("admin.systemReset.runningTitle")}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
                <span className="text-green-600">{t("admin.systemReset.successTitle")}</span>
              </>
            )}
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300",
                running ? "bg-primary" : "bg-green-500"
              )}
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {running && task
              ? t("admin.systemReset.progressDetail", {
                  message: task.message,
                  progress: task.progress,
                })
              : running
                ? t("admin.systemReset.runningTitle")
                : null}
          </p>

          {phase === "success" && (
            <div className="mt-3 space-y-3 text-sm">
              <p className="break-all">
                {t("admin.systemReset.backupReady", { name: backupFilename })}
              </p>
              <p className="text-muted-foreground">
                {t("admin.systemReset.successSessions")}
              </p>
              <Button asChild size="sm">
                <Link href={lp("/admin/setup")}>
                  {t("admin.systemReset.goSetup")}
                </Link>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* completed：轮询遭遇 401 且 system_initialized=false（正常情况下成功重置后落到这里） */}
      {phase === "completed" && (
        <div className="rounded-lg border border-green-500/40 bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-600">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {t("admin.systemReset.completedTitle")}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("admin.systemReset.completedHint")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={lp("/admin/setup")}>{t("admin.systemReset.goSetup")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={lp("/admin/login")}>{t("admin.systemReset.goLogin")}</Link>
            </Button>
          </div>
        </div>
      )}

      {/* 第二层 Modal：最终确认 */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !submitting && setDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {t("admin.systemReset.dialogTitle")}
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line text-left">
              {t("admin.systemReset.dialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              {t("admin.systemReset.dialogCancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleFinalConfirm()}
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t("admin.systemReset.dialogConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
