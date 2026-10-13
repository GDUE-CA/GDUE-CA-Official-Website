"use client";

/**
 * LoginSessionsCard —— 登录设备 / 会话管理卡片
 *
 * 用于 /setting/sessions 个人设置会话管理：
 * - 登录地点显示：设备名称、设备型号、登录 IP（当前 + 历史，最近 20 条）
 * - 每条记录「查看详细」展开完整信息（UA / 过期时间 / 撤销时间等）
 * - 「踢出登录」强制登出指定设备（踢掉当前设备时本地登出并跳登录页）
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Monitor,
  Smartphone,
  Laptop,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  LogOut,
  MapPin,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchSessions, revokeSession } from "@/lib/api/auth";
import { logout } from "@/lib/auth";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import type { LoginSessionInfo } from "@/types/api";
import { cn } from "@/lib/utils";

function DeviceIcon({ model }: { model: string }) {
  const m = model.toLowerCase();
  if (m.includes("iphone") || m.includes("android") || m.includes("手机")) {
    return <Smartphone className="h-4 w-4 shrink-0" />;
  }
  if (m.includes("laptop") || m.includes("笔记本")) {
    return <Laptop className="h-4 w-4 shrink-0" />;
  }
  return <Monitor className="h-4 w-4 shrink-0" />;
}

function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "primary" | "danger" | "success";
}) {
  const tones: Record<string, string> = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    danger: "bg-destructive/10 text-destructive",
    success: "bg-green-500/10 text-green-600 dark:text-green-500",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function LoginSessionsCard() {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();
  const [sessions, setSessions] = useState<LoginSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [kickTarget, setKickTarget] = useState<LoginSessionInfo | null>(null);
  const [kicking, setKicking] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await fetchSessions();
      // 当前设备 > 未踢出（按最近活跃倒序）> 已踢出
      list.sort((a, b) => {
        if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
        if (a.revoked !== b.revoked) return a.revoked ? 1 : -1;
        return b.last_active_at.localeCompare(a.last_active_at);
      });
      setSessions(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.sessions.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleKick() {
    if (!kickTarget) return;
    setKicking(true);
    try {
      const res = await revokeSession(kickTarget.id);
      setKickTarget(null);
      if (res.current_kicked) {
        // 踢掉的是当前设备：本地登出并跳转登录页
        await logout();
        router.push(lp("/login"));
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.sessions.kickFailed"));
    } finally {
      setKicking(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">{t("profile.sessions.title")}</CardTitle>
          <CardDescription>{t("profile.sessions.subtitle")}</CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void load()}
          disabled={loading}
          aria-label={t("profile.sessions.refresh")}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
            {error}
          </p>
        )}

        {loading && sessions.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {t("profile.sessions.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border">
            {sessions.map((s) => {
              const expanded = expandedId === s.id;
              return (
                <li key={s.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-muted-foreground">
                      <DeviceIcon model={s.device_model} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium truncate">
                          {s.device_name}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {s.device_model}
                        </span>
                        {s.is_current && <Badge tone="primary">{t("profile.sessions.current")}</Badge>}
                        {s.revoked && <Badge tone="danger">{t("profile.sessions.revoked")}</Badge>}
                        {!s.revoked && s.remember_device && (
                          <Badge tone="success">{t("profile.sessions.remembered")}</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {s.ip ?? t("profile.sessions.unknownIp")}
                        </span>
                        <span>
                          {t("profile.sessions.loginAt")}
                          <FormattedUserActionTime utcIso={s.login_at} className="ml-1" />
                        </span>
                        {!s.revoked && (
                          <span>
                            {t("profile.sessions.lastActive")}
                            <FormattedUserActionTime utcIso={s.last_active_at} className="ml-1" />
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(expanded ? null : s.id)}
                      >
                        {expanded ? (
                          <>
                            <ChevronUp className="h-4 w-4" />
                            {t("profile.sessions.hideDetails")}
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4" />
                            {t("profile.sessions.viewDetails")}
                          </>
                        )}
                      </Button>
                      {!s.revoked && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={kicking}
                          onClick={() => setKickTarget(s)}
                        >
                          <LogOut className="h-4 w-4" />
                          {t("profile.sessions.kick")}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* 查看详细：完整登录信息 */}
                  {expanded && (
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 rounded-md bg-muted/50 px-3 py-2.5 text-xs">
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground shrink-0">{t("profile.sessions.ip")}：</dt>
                        <dd className="font-mono break-all">{s.ip ?? "—"}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground shrink-0">{t("profile.sessions.expiresAt")}：</dt>
                        <dd>
                          <FormattedUserActionTime utcIso={s.expires_at} />
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground shrink-0">{t("profile.sessions.revokedAt")}：</dt>
                        <dd>
                          {s.revoked_at ? (
                            <FormattedUserActionTime utcIso={s.revoked_at} />
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground shrink-0">{t("profile.sessions.rememberDevice")}：</dt>
                        <dd>{s.remember_device ? t("common.yes") : t("common.no")}</dd>
                      </div>
                      <div className="flex gap-2 sm:col-span-2">
                        <dt className="text-muted-foreground shrink-0">{t("profile.sessions.userAgent")}：</dt>
                        <dd className="font-mono break-all">{s.user_agent || "—"}</dd>
                      </div>
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">{t("profile.sessions.hint")}</p>
      </CardContent>

      {/* 踢出确认弹窗 */}
      <Dialog open={!!kickTarget} onOpenChange={(open) => !open && setKickTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("profile.sessions.kickConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("profile.sessions.kickConfirmDesc", {
                device: kickTarget ? `${kickTarget.device_name} · ${kickTarget.device_model}` : "",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setKickTarget(null)} disabled={kicking}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void handleKick()} disabled={kicking}>
              {kicking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("profile.sessions.kicking")}
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  {t("profile.sessions.kick")}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
