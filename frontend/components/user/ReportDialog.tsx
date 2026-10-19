"use client";

/**
 * ReportDialog —— 举报弹窗（V0.6.1 需求5）
 *
 * 访客预览视图中点击「举报」打开：
 * 1. 举报类型下拉：用户主页 / 博客文章 / 说说（动态）
 * 2. 举报理由文本域
 * 3. 提交 / 取消
 *
 * 全部文案走 i18n；提交失败（重复举报 / 高频拦截）内联提示。
 * 个人主页场景仅开放「用户主页」类型，并以 username 寻址（前端无内部用户 id）。
 */
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitReport } from "@/lib/api/reports";
import type { ReportType } from "@/types/api";

const ALL_TYPES: ReportType[] = ["user", "blog", "post"];

export function ReportDialog({
  open,
  onOpenChange,
  allowedTypes = ALL_TYPES,
  targetId,
  targetUsername,
  targetLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowedTypes?: ReportType[];
  targetId?: number;
  targetUsername?: string;
  targetLabel?: string;
}) {
  const { t } = useI18n();
  const [type, setType] = useState<ReportType>(allowedTypes[0] ?? "user");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setReason("");
    setError(null);
    setDone(false);
    setSubmitting(false);
    setType(allowedTypes[0] ?? "user");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 2) {
      setError(t("report.reasonTooShort"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitReport({
        report_type: type,
        target_id: type === "user" ? undefined : targetId,
        target_username: type === "user" ? targetUsername : undefined,
        reason: reason.trim(),
      });
      setDone(true);
      setTimeout(() => {
        reset();
        onOpenChange(false);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("report.submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) {
          if (!o) reset();
          onOpenChange(o);
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("report.title")}</DialogTitle>
        </DialogHeader>

        {done ? (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-600 dark:bg-green-950/20">
            {t("report.success")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {targetLabel && (
              <p className="text-xs text-muted-foreground">
                {t("report.target")}: <span className="font-medium">{targetLabel}</span>
              </p>
            )}
            {allowedTypes.length > 1 && (
              <div className="space-y-2">
                <Label>{t("report.typeLabel")}</Label>
                <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedTypes.map((tp) => (
                      <SelectItem key={tp} value={tp}>
                        {t(`report.types.${tp}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="report-reason">{t("report.reasonLabel")}</Label>
              <Textarea
                id="report-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError(null);
                }}
                placeholder={t("report.reasonPlaceholder")}
                rows={4}
                maxLength={2000}
              />
            </div>
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("setting.saving") : t("report.submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
