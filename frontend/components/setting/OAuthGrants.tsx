"use client";

/**
 * OAuthGrants —— 授权管理（/setting/connections）
 *
 * 列出当前账号的全部第三方登录授权（oauth_accounts）：
 * 平台、授权时间；可撤销授权（DELETE /api/account/oauth-grants/{id}，后端写审计日志）。
 */
import { useCallback, useEffect, useState } from "react";
import KeyRound from "@/assets/icons/status/key-round.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Link2 from "@/assets/icons/navigation/link-2.svg";
import Github from "@/assets/icons/brand/github.svg";
import Chrome from "@/assets/icons/brand/chrome.svg";
import AppleIcon from "@/assets/icons/brand/apple.svg";
import ShieldCheck from "@/assets/icons/status/shield-check.svg";
import { useI18n } from "@/i18n/provider";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchOAuthGrants, revokeOAuthGrant } from "@/lib/api/account";
import type { OAuthGrant, OAuthProvider } from "@/types/api";

const PROVIDER_META: Record<
  OAuthProvider,
  { icon: typeof Github; nameKey: string }
> = {
  github: { icon: Github, nameKey: "setting.oauth.github" },
  google: { icon: Chrome, nameKey: "setting.oauth.google" },
  microsoft: { icon: Chrome, nameKey: "setting.oauth.microsoft" },
  apple: { icon: AppleIcon, nameKey: "setting.oauth.apple" },
};

export function OAuthGrants() {
  const { t, locale } = useI18n();
  const [grants, setGrants] = useState<OAuthGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<OAuthGrant | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGrants(await fetchOAuthGrants());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setBusy(true);
    setError(null);
    try {
      await revokeOAuthGrant(revokeTarget.id);
      setGrants((prev) => prev.filter((g) => g.id !== revokeTarget.id));
      setRevokeTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setting.oauth.revokeFailed"));
    } finally {
      setBusy(false);
    }
  }

  function formatDate(iso: string) {
    try {
      return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-4 w-4" />
          {t("setting.oauth.title")}
        </CardTitle>
        <CardDescription>{t("setting.oauth.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : grants.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Link2 className="h-9 w-9" />
            <p className="text-sm">{t("setting.oauth.empty")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {grants.map((g) => {
              const meta = PROVIDER_META[g.provider] ?? {
                icon: ShieldCheck,
                nameKey: g.provider,
              };
              const Icon = meta.icon;
              return (
                <div
                  key={g.id}
                  className="flex items-center gap-3 rounded-md border border-border px-4 py-3"
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{t(meta.nameKey)}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("setting.oauth.grantedAt", { date: formatDate(g.created_at) })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRevokeTarget(g)}
                    className="rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 shrink-0"
                  >
                    {t("setting.oauth.revoke")}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>

      {/* 撤销确认 */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !busy && !open && setRevokeTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("setting.oauth.revokeTitle")}</DialogTitle>
            <DialogDescription>
              {revokeTarget
                ? t("setting.oauth.revokeConfirm", {
                    name: t(PROVIDER_META[revokeTarget.provider]?.nameKey ?? revokeTarget.provider),
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={busy}>
              {t("setting.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void confirmRevoke()} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("setting.oauth.revoke")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
