"use client";

/**
 * SessionsView —— Tab-5 登录设备
 *
 * - 顶部高危区：「下线全部其他设备」destructive 按钮 + 确认弹窗
 *   → POST /api/auth/sessions/revoke-others（接口保留当前设备，当前设备不会被登出）
 *   → 绿色提示条显示下线数量 → 通过 key 重挂载刷新下方列表
 * - 下方直接复用 components/profile/LoginSessionsCard（不改其内部逻辑）
 */
import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, Loader2, LogOut } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoginSessionsCard } from "@/components/profile/LoginSessionsCard";
import { revokeOtherSessions } from "@/lib/api/auth";
import { fetchSystemSettings } from "@/lib/api/system";
import { cn } from "@/lib/utils";

export function SessionsView() {
  const { t } = useI18n();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState<number | null>(null);
  // 下线成功后重挂载 LoginSessionsCard 刷新列表
  const [listKey, setListKey] = useState(0);
  // 全局空闲超时提示
  const [globalTimeout, setGlobalTimeout] = useState<number | null>(null);

  useEffect(() => {
    fetchSystemSettings()
      .then((s) => setGlobalTimeout(s.session_idle_timeout_minutes ?? null))
      .catch(() => {});
  }, []);

  async function handleRevokeAll() {
    setRevoking(true);
    setError(null);
    try {
      const res = await revokeOtherSessions();
      setRevoked(res.revoked);
      setConfirmOpen(false);
      setListKey((k) => k + 1);
      setTimeout(() => setRevoked(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
      setConfirmOpen(false);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 全局空闲超时提示 */}
      {globalTimeout !== null && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{t("setting.sessions.globalTimeoutNotice", { minutes: globalTimeout })}</span>
        </div>
      )}

      {/* 高危区：下线全部其他设备 */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.sessions.revokeAll")}</CardTitle>
          <CardDescription>{t("setting.sessions.revokeAllConfirm")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            variant="destructive"
            disabled={revoking}
            onClick={() => setConfirmOpen(true)}
          >
            <LogOut className="h-4 w-4" />
            {t("setting.sessions.revokeAll")}
          </Button>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {revoked !== null && (
            <p
              className={cn(
                "flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-600 dark:bg-green-950/20"
              )}
            >
              <CheckCircle2 className="h-4 w-4" />
              {t("setting.sessions.revokedCount", { count: revoked })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 登录设备列表（复用前台组件） */}
      <LoginSessionsCard key={listKey} />

      {/* 确认弹窗 */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !revoking) setConfirmOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("setting.sessions.revokeAll")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("setting.sessions.revokeAllConfirm")}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={revoking}>
              {t("setting.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void handleRevokeAll()} disabled={revoking}>
              {revoking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("setting.saving")}
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  {t("setting.sessions.revokeAll")}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
