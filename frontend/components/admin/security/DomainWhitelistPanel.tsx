"use client";

/**
 * 域名白名单面板（系统安全 · 访问控制）
 *
 * 从 /admin/settings 基础站点页整体迁移至此，业务逻辑完全不变：
 * - CORS Origins / Allowed Hosts 每行一条，随文本原样提交，
 *   后端逐行校验，非法行整体 400；
 * - PUT /api/system/settings 为部分更新，本面板仅提交这两个字段。
 */
import { useEffect, useState } from "react";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Check from "@/assets/icons/action/check.svg";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSystemSettings, updateSystemSettings } from "@/lib/api/system";

export function DomainWhitelistPanel() {
  const { t } = useI18n();
  const [corsOrigins, setCorsOrigins] = useState("");
  const [allowedHosts, setAllowedHosts] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchSystemSettings();
        if (cancelled) return;
        setCorsOrigins((s.cors_origins ?? []).join("\n"));
        setAllowedHosts((s.allowed_hosts ?? []).join("\n"));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const corsList = corsOrigins.split("\n").map((s) => s.trim()).filter(Boolean);
      const hostsList = allowedHosts.split("\n").map((s) => s.trim()).filter(Boolean);
      await updateSystemSettings({
        cors_origins: corsList,
        allowed_hosts: hostsList,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.settings.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.settings.domainWhitelist")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("admin.settings.domainWhitelistDesc")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="corsOrigins">CORS Origins</Label>
          <Textarea
            id="corsOrigins"
            rows={3}
            placeholder={t("admin.settings.domainWhitelistPlaceholder")}
            value={corsOrigins}
            onChange={(e) => setCorsOrigins(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="allowedHosts">Allowed Hosts</Label>
          <Textarea
            id="allowedHosts"
            rows={3}
            placeholder="如：gdue-ca.paperee.guru"
            value={allowedHosts}
            onChange={(e) => setAllowedHosts(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && (
          <p className="text-sm text-emerald-600 flex items-center gap-1">
            <Check className="h-4 w-4" />
            {t("admin.settings.saved")}
          </p>
        )}
        <Button onClick={saveSettings} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          {t("admin.activities.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
