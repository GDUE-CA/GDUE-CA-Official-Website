"use client";

/**
 * 管理员可信 IP 白名单面板（系统安全 · 访问控制）
 *
 * 从 /admin/settings 基础站点页整体迁移至此，业务逻辑完全不变：
 * - 读取 GET /api/system/settings/admin 的 admin_trusted_ips
 * - 保存 PUT /api/admin/config/admin-trusted-ips（原样提交全部行，
 *   含空行 / # 注释行，过滤与逐行校验由后端完成；非法行整体 400 并返回行号）
 */
import { useEffect, useState } from "react";
import { Loader2, Check, ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSystemSettings, updateAdminTrustedIps } from "@/lib/api/system";

export function TrustedAdminIpsPanel() {
  const { t } = useI18n();
  const [adminTrustedIpsInput, setAdminTrustedIpsInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchSystemSettings();
        if (!cancelled) setAdminTrustedIpsInput((s.admin_trusted_ips ?? []).join("\n"));
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

  // 原样提交全部行（含空行 / # 注释行），过滤与逐行校验由后端完成；非法行整体 400 并返回行号
  async function saveAdminTrustedIps() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const lines = adminTrustedIpsInput.split("\n");
      const res = await updateAdminTrustedIps(lines);
      setAdminTrustedIpsInput(res.admin_trusted_ips.join("\n"));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
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
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          {t("admin.settings.adminTrustedIpsTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {t("admin.settings.adminTrustedIpsDesc")}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="adminTrustedIps">
            {t("admin.settings.adminTrustedIpsLabel")}
          </Label>
          <Textarea
            id="adminTrustedIps"
            rows={8}
            placeholder={t("admin.settings.adminTrustedIpsPlaceholder")}
            value={adminTrustedIpsInput}
            onChange={(e) => setAdminTrustedIpsInput(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground whitespace-pre-line">
          {t("admin.settings.adminTrustedIpsNote")}
        </p>
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button onClick={saveAdminTrustedIps} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {t("admin.activities.save")}
          </Button>
          {saved && (
            <p className="text-sm text-emerald-600 flex items-center gap-1">
              <Check className="h-4 w-4" />
              {t("admin.settings.saved")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
