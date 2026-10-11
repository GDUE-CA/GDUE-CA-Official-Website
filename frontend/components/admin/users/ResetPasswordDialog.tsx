"use client";

/**
 * 重置密码弹窗：确认 → 生成一次性临时密码（仅显示一次）+ 复制
 */
import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resetUserPassword } from "@/lib/api/auth";
import type { AdminUser } from "@/types/api";

export function ResetPasswordDialog({
  user,
  onOpenChange,
}: {
  user: AdminUser | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"confirm" | "result">("confirm");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 打开时回到确认阶段
  useEffect(() => {
    if (user) {
      setPhase("confirm");
      setTempPassword(null);
      setCopied(false);
      setError(null);
    }
  }, [user]);

  async function handleConfirm() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await resetUserPassword(user.id);
      setTempPassword(res.temp_password);
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用时忽略，用户可手动选中复制
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {phase === "confirm"
              ? t("admin.users.resetPwdTitle")
              : t("admin.users.resetPwdResultTitle")}
          </DialogTitle>
          <DialogDescription>
            {phase === "confirm"
              ? t("admin.users.resetPwdConfirmDesc", {
                  name: user?.username ?? "",
                })
              : t("admin.users.resetPwdResultDesc")}
          </DialogDescription>
        </DialogHeader>

        {phase === "confirm" ? (
          <>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={handleConfirm} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("admin.users.resetPwdConfirm")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2.5">
              <code className="flex-1 font-mono text-sm break-all select-all">
                {tempPassword}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-1 shrink-0"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? t("admin.users.resetPwdCopied") : t("admin.users.resetPwdCopy")}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>
                {t("admin.users.resetPwdDone")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
