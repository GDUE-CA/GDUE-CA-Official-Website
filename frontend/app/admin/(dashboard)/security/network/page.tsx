"use client";

/**
 * /admin/security/network - 网络配置
 * 监听端口 / 监听 IP / 绑定域名（参考值，实际生效需运维重载 Nginx）
 */
import { useEffect, useState } from "react";
import { Globe, Loader2, AlertTriangle, History, Check } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchNetworkConfig,
  updateNetworkConfig,
} from "@/lib/api/security";
import { fetchNetworkConfigHistory } from "@/lib/api/system";
import type { NetworkConfig, NetworkConfigHistory } from "@/types/api";

export default function NetworkConfigPage() {
  const { t } = useI18n();
  const [port, setPort] = useState(443);
  const [listenIp, setListenIp] = useState("0.0.0.0");
  const [domains, setDomains] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [history, setHistory] = useState<NetworkConfigHistory[]>([]);
  const [canManage, setCanManage] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const me = await import("@/lib/api/auth").then((m) => m.fetchProfile());
      setCanManage(me.role === "super_admin");
      const cfg: NetworkConfig = await fetchNetworkConfig();
      setPort(cfg.network_port ?? 443);
      setListenIp(cfg.network_listen_ip ?? "0.0.0.0");
      setDomains((cfg.network_domains ?? []).join("\n"));
      try {
        setHistory(await fetchNetworkConfigHistory());
      } catch {
        /* 历史加载失败不阻断主流程 */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validate(): string | null {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      return t("admin.security.netInvalidPort");
    if (listenIp.trim() && !/^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]{2,}$/.test(listenIp.trim())
        && listenIp !== "::" && listenIp !== "0.0.0.0")
      return t("admin.security.netInvalidIp");
    return null;
  }

  function openConfirm() {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setConfirmOpen(true);
  }

  async function confirmSave() {
    setConfirmOpen(false);
    setSaving(true);
    setError(null);
    const domainList = domains.split("\n").map((s) => s.trim()).filter(Boolean);
    try {
      const res = await updateNetworkConfig({
        network_port: port,
        network_listen_ip: listenIp.trim() || "0.0.0.0",
        network_domains: domainList,
      });
      setPort(res.network_port);
      setListenIp(res.network_listen_ip);
      setDomains((res.network_domains ?? []).join("\n"));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      try {
        setHistory(await fetchNetworkConfigHistory());
      } catch {}
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
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Globe className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">{t("admin.security.networkTitle")}</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-3">
        {t("admin.security.networkDesc")}
      </p>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="netPort">{t("admin.security.netPort")}</Label>
              <Input
                id="netPort"
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value || "0", 10))}
                placeholder="443"
                className="font-mono"
                disabled={!canManage}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="netListenIp">{t("admin.security.netListenIp")}</Label>
              <Input
                id="netListenIp"
                value={listenIp}
                onChange={(e) => setListenIp(e.target.value)}
                placeholder="0.0.0.0"
                className="font-mono"
                disabled={!canManage}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="netDomains">{t("admin.security.netDomains")}</Label>
            <Textarea
              id="netDomains"
              rows={3}
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder={t("admin.security.netDomainsPlaceholder")}
              className="font-mono text-sm"
              disabled={!canManage}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </p>
          )}
          {saved && (
            <p className="text-sm text-emerald-600 flex items-center gap-1">
              <Check className="h-4 w-4" />
              {t("admin.security.saved")}
            </p>
          )}

          <Button onClick={openConfirm} disabled={saving || !canManage}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {t("admin.security.netSaveBtn")}
          </Button>

          {history.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground">
                <History className="h-3.5 w-3.5" />
                {t("admin.security.netHistory")}
              </h4>
              <ul className="space-y-1.5">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-start gap-2 text-xs text-muted-foreground px-2 py-1.5 rounded-md hover:bg-muted/60"
                  >
                    <span className="font-mono font-semibold text-foreground tabular-nums shrink-0">
                      {h.config_snapshot.network_port}
                    </span>
                    <span className="font-mono text-muted-foreground/70 shrink-0">
                      {h.config_snapshot.network_listen_ip}
                    </span>
                    <span className="flex-1 truncate">
                      {h.config_snapshot.network_domains.join(", ") || "—"}
                    </span>
                    {h.ip && (
                      <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0">
                        {h.ip}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 确认警告 Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmOpen(false)} />
          <div className="relative w-full max-w-md mx-4 rounded-lg border border-border bg-background shadow-lg p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-md bg-amber-500/10 text-amber-600 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {t("admin.security.netWarnTitle")}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {t("admin.security.netWarnDesc")}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                {t("admin.security.netWarnCancel")}
              </Button>
              <Button variant="destructive" onClick={confirmSave}>
                {t("admin.security.netWarnConfirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
