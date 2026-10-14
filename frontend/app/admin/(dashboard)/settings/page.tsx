"use client";

/**
 * /admin/settings - 系统设置
 * 字段对齐后端 SystemSettings：site_name/footer/icp_info/ip_blacklist[]/allowed_hosts[]/cors_origins[]
 * IP 黑名单接口用 ?ip=xxx query 参数
 */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimezoneSelect } from "@/components/layout/TimezoneSelect";
import {
  fetchNetworkConfigHistory,
  fetchSystemSettings,
  updateAdminTrustedIps,
  updateSystemSettings,
} from "@/lib/api/system";
import type { NetworkConfigHistory, SystemSettings } from "@/types/api";
import {
  notifyBackgroundTaskSubmitted,
  submitDbExport,
} from "@/lib/api/backgroundTasks";
import { Loader2, Check, QrCode, Globe, Clock, History, AlertTriangle, ShieldBan, ShieldCheck, ArrowUpRight, Timer, Database } from "lucide-react";

export default function SettingsPage() {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const [corsOrigins, setCorsOrigins] = useState("");
  const [allowedHosts, setAllowedHosts] = useState("");
  const [siteName, setSiteName] = useState("");
  const [footer, setFooter] = useState("");
  const [clubCheckinOpen, setClubCheckinOpen] = useState(false);
  const [systemTimezone, setSystemTimezone] = useState("Asia/Shanghai");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 网络配置
  const [networkPort, setNetworkPort] = useState(443);
  const [networkListenIp, setNetworkListenIp] = useState("0.0.0.0");
  const [networkDomainsInput, setNetworkDomainsInput] = useState("");
  const [networkConfirmOpen, setNetworkConfirmOpen] = useState(false);
  const [networkCountdown, setNetworkCountdown] = useState(60);
  const [networkApplying, setNetworkApplying] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [networkHistory, setNetworkHistory] = useState<NetworkConfigHistory[]>([]);

  // 会话超时
  const [sessionTimeout, setSessionTimeout] = useState(30);
  const SESSION_TIMEOUT_OPTIONS = [1, 2, 5, 10, 15, 20, 30, 60, 120];

  // 管理员可信 IP 白名单
  const [adminTrustedIpsInput, setAdminTrustedIpsInput] = useState("");
  const [trustedIpsSaving, setTrustedIpsSaving] = useState(false);
  const [trustedIpsSaved, setTrustedIpsSaved] = useState(false);
  const [trustedIpsError, setTrustedIpsError] = useState<string | null>(null);

  // 数据库导出（后台异步任务：提交即返回，进度在悬浮窗/通知中心查看）
  const [exporting, setExporting] = useState(false);
  const [exportSubmitted, setExportSubmitted] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  /** 提交一次完整数据库导出：HTTP 立刻返回 task_id，后台继续跑 */
  async function runDbExport() {
    if (exporting) return;
    setExporting(true);
    setExportSubmitted(false);
    setExportError(null);
    try {
      await submitDbExport();
      // 通知右下角悬浮窗立即开始轮询该任务
      notifyBackgroundTaskSubmitted();
      setExportSubmitted(true);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const s: SystemSettings = await fetchSystemSettings();
      setCorsOrigins((s.cors_origins ?? []).join("\n"));
      setAllowedHosts((s.allowed_hosts ?? []).join("\n"));
      setSiteName(s.site_name ?? "");
      setFooter(s.footer ?? "");
      setClubCheckinOpen(!!s.club_checkin_open);
      setSystemTimezone(s.sys_default_timezone ?? "Asia/Shanghai");
      setNetworkPort(s.network_port ?? 443);
      setNetworkListenIp(s.network_listen_ip ?? "0.0.0.0");
      setNetworkDomainsInput((s.network_domains ?? []).join("\n"));
      setSessionTimeout(s.session_idle_timeout_minutes ?? 30);
      setAdminTrustedIpsInput((s.admin_trusted_ips ?? []).join("\n"));
      try {
        setNetworkHistory(await fetchNetworkConfigHistory());
      } catch { /* 历史加载失败不阻断主流程 */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  // 切换社团报名签到开关（立即生效，无需保存）
  async function toggleClubCheckin() {
    try {
      const next = !clubCheckinOpen;
      await updateSystemSettings({ club_checkin_open: next });
      setClubCheckinOpen(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }

  // 切换系统时区（立即生效）
  async function changeSystemTimezone(tz: string) {
    try {
      // "auto" 不在系统时区场景使用；系统时区必须是具体 IANA 字符串
      const tzValue = tz === "auto" ? "Asia/Shanghai" : tz;
      const res = await updateSystemSettings({ sys_default_timezone: tzValue });
      setSystemTimezone(res.sys_default_timezone ?? "Asia/Shanghai");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }

  // ---------- 网络配置 ----------
  function validateNetworkInput(): string | null {
    if (!Number.isInteger(networkPort) || networkPort < 1 || networkPort > 65535) {
      return t("admin.settings.netInvalidPort");
    }
    if (networkListenIp.trim()) {
      // 简单格式校验（避免加 ipaddress 依赖）
      const ipRgx = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]{2,}$/;
      if (!ipRgx.test(networkListenIp.trim()) && networkListenIp !== "::" && networkListenIp !== "0.0.0.0") {
        return t("admin.settings.netInvalidIp");
      }
    }
    return null;
  }

  function openNetworkConfirm() {
    const err = validateNetworkInput();
    if (err) {
      setNetworkError(err);
      return;
    }
    setNetworkError(null);
    setNetworkStatus(null);
    setNetworkConfirmOpen(true);
  }

  async function confirmNetworkSave() {
    setNetworkConfirmOpen(false);
    setNetworkApplying(true);
    setNetworkStatus(t("admin.settings.netStatusApplying"));
    setNetworkError(null);
    setNetworkCountdown(60);

    const domains = networkDomainsInput
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      // 1) 保存到后端
      await updateSystemSettings({
        network_port: networkPort,
        network_listen_ip: networkListenIp.trim() || "0.0.0.0",
        network_domains: domains,
      });
      setNetworkStatus(t("admin.settings.netStatusVerifying"));

      // 2) 前端 60 秒倒计时（二次确认窗口）
      const interval = setInterval(() => {
        setNetworkCountdown((c) => {
          if (c <= 1) {
            clearInterval(interval);
            setNetworkStatus(t("admin.settings.netStatusConfirmed"));
            setNetworkApplying(false);
            // 刷新历史记录
            fetchNetworkConfigHistory()
              .then((h) => setNetworkHistory(h))
              .catch(() => {});
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (e) {
      setNetworkError(e instanceof Error ? e.message : "Save failed");
      setNetworkStatus(null);
      setNetworkApplying(false);
    }
  }

  function cancelNetworkSave() {
    // 60 秒验证期内用户主动取消 → 后端不回滚（方案 A：配置已存库但提示需运维重载）
    setNetworkConfirmOpen(false);
    setNetworkStatus(null);
    setNetworkError(null);
  }

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const corsList = corsOrigins.split("\n").map((s) => s.trim()).filter(Boolean);
      const hostsList = allowedHosts.split("\n").map((s) => s.trim()).filter(Boolean);
      await updateSystemSettings({
        site_name: siteName,
        footer: footer || null,
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

  // ---------- 管理员可信 IP 白名单 ----------
  // 原样提交全部行（含空行 / # 注释行），过滤与逐行校验由后端完成；非法行整体 400 并返回行号
  async function saveAdminTrustedIps() {
    setTrustedIpsSaving(true);
    setTrustedIpsError(null);
    setTrustedIpsSaved(false);
    try {
      const lines = adminTrustedIpsInput.split("\n");
      const res = await updateAdminTrustedIps(lines);
      setAdminTrustedIpsInput(res.admin_trusted_ips.join("\n"));
      setTrustedIpsSaved(true);
      setTimeout(() => setTrustedIpsSaved(false), 2500);
    } catch (e) {
      setTrustedIpsError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setTrustedIpsSaving(false);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.settings.title")}</h1>

      {/* IP 黑名单已迁移至 ip_rules 表（中间件只读该表）：此处仅跳转真入口，避免改到不生效的旧字段 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.settings.ipBlacklistMovedTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("admin.settings.ipBlacklistMovedDesc")}</p>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" asChild>
            <Link href={lp("/admin/security/ip-blacklist")}>
              <ShieldBan className="h-4 w-4 mr-1" />
              {t("admin.settings.gotoIpBlacklist")}
              <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.settings.clubCheckin")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("admin.settings.clubCheckinDesc")}</p>
        </CardHeader>
        <CardContent>
          <Button
            variant={clubCheckinOpen ? "default" : "outline"}
            className={clubCheckinOpen ? "" : "text-muted-foreground"}
            onClick={toggleClubCheckin}
          >
            <QrCode className="h-4 w-4 mr-1" />
            {clubCheckinOpen
              ? t("admin.activities.checkinOpen")
              : t("admin.activities.checkinClosed")}
          </Button>
        </CardContent>
      </Card>

      {/* 系统时区（Tier-0 时区系统；仅 admin/super_admin 可改） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.settings.systemTimezone")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("admin.settings.systemTimezoneDesc")}</p>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <TimezoneSelect
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={systemTimezone}
              onChange={changeSystemTimezone}
            />
          </div>
        </CardContent>
      </Card>

      {/* 全局登录空闲超时 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-4 w-4" />
            {t("admin.settings.sessionIdleTimeout")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t("admin.settings.sessionIdleTimeoutDesc")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xs space-y-2">
            <select
              value={sessionTimeout}
              onChange={(e) => setSessionTimeout(parseInt(e.target.value, 10))}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {SESSION_TIMEOUT_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v} {t("admin.settings.sessionIdleTimeoutMinutes")}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("admin.settings.sessionIdleTimeoutNote")}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await updateSystemSettings({ session_idle_timeout_minutes: sessionTimeout });
                setSaved(true);
                setTimeout(() => setSaved(false), 2500);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Save failed");
              }
            }}
          >
            {t("admin.activities.save")}
          </Button>
        </CardContent>
      </Card>

      {/* ===== 管理员可信 IP 白名单 ===== */}
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
          {trustedIpsError && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {trustedIpsError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button onClick={saveAdminTrustedIps} disabled={trustedIpsSaving}>
              {trustedIpsSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {t("admin.activities.save")}
            </Button>
            {trustedIpsSaved && (
              <p className="text-sm text-emerald-600 flex items-center gap-1">
                <Check className="h-4 w-4" />
                {t("admin.settings.saved")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">站点信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="siteName">站点名称</Label>
            <Input id="siteName" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="footer">页脚</Label>
            <Textarea id="footer" rows={2} value={footer} onChange={(e) => setFooter(e.target.value)} />
          </div>
        </CardContent>
      </Card>

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

      {/* ===== 网络配置 ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t("admin.settings.netTitle")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t("admin.settings.netDesc")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="netPort">{t("admin.settings.netPort")}</Label>
              <Input
                id="netPort"
                type="number"
                min={1}
                max={65535}
                value={networkPort}
                onChange={(e) => setNetworkPort(parseInt(e.target.value || "0", 10))}
                placeholder="443"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="netListenIp">{t("admin.settings.netListenIp")}</Label>
              <Input
                id="netListenIp"
                value={networkListenIp}
                onChange={(e) => setNetworkListenIp(e.target.value)}
                placeholder="0.0.0.0"
                className="font-mono"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="netDomains">{t("admin.settings.netDomains")}</Label>
            <Textarea
              id="netDomains"
              rows={3}
              value={networkDomainsInput}
              onChange={(e) => setNetworkDomainsInput(e.target.value)}
              placeholder={t("admin.settings.netDomainsPlaceholder")}
              className="font-mono text-sm"
            />
          </div>

          {networkError && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {networkError}
            </p>
          )}

          {/* 状态反馈区 */}
          {networkStatus && (
            <div className="flex items-center gap-2 text-sm bg-muted px-3 py-2 rounded-md">
              <Clock className="h-4 w-4 text-primary" />
              <span>{networkStatus}</span>
              {networkApplying && networkCountdown > 0 && (
                <span className="ml-auto font-mono tabular-nums text-primary font-semibold">
                  {networkCountdown}s
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="default"
              onClick={openNetworkConfirm}
              disabled={networkApplying}
            >
              {networkApplying && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {t("admin.settings.netSaveBtn")}
            </Button>
            {networkStatus === t("admin.settings.netStatusConfirmed") && (
              <span className="text-sm text-emerald-600 flex items-center gap-1">
                <Check className="h-4 w-4" />
                {t("admin.settings.netHintNeedReload")}
              </span>
            )}
          </div>

          {/* 变更历史 */}
          {networkHistory.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground">
                <History className="h-3.5 w-3.5" />
                {t("admin.settings.netHistory")}
              </h4>
              <ul className="space-y-1.5">
                {networkHistory.map((h) => (
                  <li key={h.id} className="flex items-start gap-2 text-xs text-muted-foreground px-2 py-1.5 rounded-md hover:bg-muted/60">
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

      {/* ===== 数据库维护（导出为后台异步任务，进度见右下角悬浮窗 / 通知中心） ===== */}
      <Card id="db-maintenance">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />
            {t("admin.settings.dbMaintenanceTitle")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("admin.settings.dbMaintenanceDesc")}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button onClick={runDbExport} disabled={exporting}>
              {exporting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {t("admin.settings.dbExportButton")}
            </Button>
          </div>
          {exportSubmitted && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <Check className="h-4 w-4" />
              {t("admin.settings.dbExportSubmitted")}
            </p>
          )}
          {exportError && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {exportError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("admin.settings.dbExportNote")}
          </p>
        </CardContent>
      </Card>

      {/* ===== 确认警告 Modal ===== */}
      {networkConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={cancelNetworkSave}
          />
          <div className="relative w-full max-w-md mx-4 rounded-lg border border-border bg-background shadow-lg p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-md bg-amber-500/10 text-amber-600 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {t("admin.settings.netWarnTitle")}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {t("admin.settings.netWarnDesc")}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelNetworkSave}>
                {t("admin.settings.netWarnCancel")}
              </Button>
              <Button variant="destructive" onClick={confirmNetworkSave}>
                {t("admin.settings.netWarnConfirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
