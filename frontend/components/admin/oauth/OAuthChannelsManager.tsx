"use client";

/**
 * 第三方登录渠道配置管理（/admin/oauth）
 * 4 渠道（GitHub/Microsoft/Apple/Google）卡片式表单：
 * 开关 / Client ID / Client Secret（脱敏展示，留空不覆盖，输入明文重新加密）
 * / Redirect URI。对应后端 GET/PUT /api/admin/oauth/channels。
 */
import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { adminListOAuthChannels, adminUpdateOAuthChannel } from "@/lib/api/oauth";
import type { OAuthChannel, OAuthProvider } from "@/types/api";

/** 单渠道表单草稿（secret 输入框独立于 channel 数据） */
interface ChannelDraft {
  enabled: boolean;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

const PROVIDERS: OAuthProvider[] = ["github", "microsoft", "apple", "google"];

export function OAuthChannelsManager() {
  const { t } = useI18n();
  const [channels, setChannels] = useState<OAuthChannel[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ChannelDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<OAuthProvider | null>(null);
  const [message, setMessage] = useState<{ p: string; ok: boolean; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const list = await adminListOAuthChannels();
      setChannels(list);
      setDrafts(
        Object.fromEntries(
          list.map((c) => [
            c.provider,
            {
              enabled: c.enabled,
              client_id: c.client_id ?? "",
              client_secret: "",
              redirect_uri: c.redirect_uri ?? "",
            },
          ])
        )
      );
    } catch (err) {
      setMessage({ p: "", ok: false, text: err instanceof Error ? err.message : t("common.error") });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patchDraft(p: OAuthProvider, patch: Partial<ChannelDraft>) {
    setDrafts((d) => ({ ...d, [p]: { ...d[p], ...patch } }));
  }

  async function save(p: OAuthProvider) {
    const draft = drafts[p];
    if (!draft) return;
    setSaving(p);
    setMessage(null);
    try {
      await adminUpdateOAuthChannel(p, {
        enabled: draft.enabled,
        client_id: draft.client_id,
        // secret 留空 = 不覆盖（后端仅收到非空明文才重新加密；此处不传 = 不变）
        ...(draft.client_secret ? { client_secret: draft.client_secret } : {}),
        redirect_uri: draft.redirect_uri,
      });
      setMessage({ p, ok: true, text: t("admin.oauth.saved") });
      await load();
    } catch (err) {
      setMessage({
        p,
        ok: false,
        text: err instanceof Error ? err.message : t("common.error"),
      });
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("admin.oauth.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.oauth.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" />
          {t("common.refresh")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {PROVIDERS.map((p) => {
          const ch = channels.find((c) => c.provider === p);
          const draft = drafts[p];
          if (!ch || !draft) return null;
          const msg = message?.p === p ? message : null;
          return (
            <Card key={p}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base capitalize">{p}</CardTitle>
                  {/* 无 Switch 组件：原生 checkbox + accent-primary（与全站一致） */}
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="size-4 rounded accent-primary cursor-pointer"
                      checked={draft.enabled}
                      onChange={(e) => patchDraft(p, { enabled: e.target.checked })}
                    />
                    {draft.enabled ? t("common.enabled") : t("common.disabled")}
                  </label>
                </div>
                <CardDescription>
                  {ch.has_secret && ch.secret_masked
                    ? `${t("admin.oauth.secretMasked")}：${ch.secret_masked}`
                    : t("admin.oauth.noSecret")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${p}-client-id`}>Client ID</Label>
                  <Input
                    id={`${p}-client-id`}
                    value={draft.client_id}
                    onChange={(e) => patchDraft(p, { client_id: e.target.value })}
                    placeholder="Client ID"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${p}-secret`}>{t("admin.oauth.clientSecret")}</Label>
                  <Input
                    id={`${p}-secret`}
                    type="password"
                    value={draft.client_secret}
                    onChange={(e) => patchDraft(p, { client_secret: e.target.value })}
                    placeholder={
                      ch.has_secret ? t("admin.oauth.secretPlaceholderKeep") : t("admin.oauth.secretPlaceholderSet")
                    }
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${p}-redirect`}>{t("admin.oauth.redirectUri")}</Label>
                  <Input
                    id={`${p}-redirect`}
                    value={draft.redirect_uri}
                    onChange={(e) => patchDraft(p, { redirect_uri: e.target.value })}
                    placeholder={`https://<domain>/api/oauth/${p}/callback`}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">{t("admin.oauth.redirectHint")}</p>
                </div>

                {msg && (
                  <p className={`text-sm px-3 py-2 rounded-md ${msg.ok ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" : "text-destructive bg-destructive/10"}`}>
                    {msg.text}
                  </p>
                )}

                <Button size="sm" onClick={() => save(p)} disabled={saving === p}>
                  {saving === p && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("common.save")}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
