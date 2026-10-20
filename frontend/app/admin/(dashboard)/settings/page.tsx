"use client";

/**
 * /admin/settings - 系统设置 · 基础站点
 *
 * 仅保留站点基础配置：
 *   社团报名签到 / 系统时区 / 全局登录空闲超时 / 站点信息（名称、页脚）/ 数据库维护
 *
 * 安全类配置已迁移至【系统安全 · 访问控制】/admin/security/access-control：
 *   IP 黑名单、管理员可信 IP 白名单、域名白名单（CORS Origins / Allowed Hosts）
 * 网络配置（后端端口 / 监听 IP / 绑定域名）已移除网页编辑入口：
 *   后端存量配置值保留读取，端口与监听地址交由部署层（环境变量 / Caddy / Nginx）管控。
 */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimezoneSelect } from "@/components/layout/TimezoneSelect";
import {
  fetchSystemSettings,
  updateSystemSettings,
} from "@/lib/api/system";
import type { SystemSettings } from "@/types/api";
import {
  notifyBackgroundTaskSubmitted,
  submitDbExport,
} from "@/lib/api/backgroundTasks";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Check from "@/assets/icons/action/check.svg";
import QrCode from "@/assets/icons/action/qr-code.svg";
import Timer from "@/assets/icons/status/timer.svg";
import Database from "@/assets/icons/status/database.svg";
import { DbBackupList } from "@/components/admin/settings/DbBackupList";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

/** 后端请求体字段名（data-field 对位，与 1001 data.errors[].field 一致） */
type SiteSettingField =
  | "site_name" | "footer";

export default function SettingsPage() {
  const { t } = useI18n();
  const [siteName, setSiteName] = useState("");
  const [footer, setFooter] = useState("");
  const [clubCheckinOpen, setClubCheckinOpen] = useState(false);
  const [systemTimezone, setSystemTimezone] = useState("Asia/Shanghai");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldErrors = useServerFieldErrors<SiteSettingField>({ fallback: t("admin.settings.saveError") });
  const fe = fieldErrors.errors;

  // 会话超时
  const [sessionTimeout, setSessionTimeout] = useState(30);
  const SESSION_TIMEOUT_OPTIONS = [1, 2, 5, 10, 15, 20, 30, 60, 120];

  // V0.5.9：SMTP/邮件通道配置状态（false 时页面顶部展示警告横幅）
  const [mailChannelConfigured, setMailChannelConfigured] = useState(true);

  // 数据库导出（后台异步任务：提交即返回，进度在悬浮窗/通知中心查看）
  const [exporting, setExporting] = useState(false);
  const [exportSubmitted, setExportSubmitted] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  /** 备份文件列表刷新计数：提交后 +1，任务预计完成时再 +1 */
  const [backupListTick, setBackupListTick] = useState(0);

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
      setBackupListTick((n) => n + 1);
      // SQLite 快照导出很快，3 秒后再自动刷新一次文件列表
      setTimeout(() => setBackupListTick((n) => n + 1), 3000);
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
      setSiteName(s.site_name ?? "");
      setFooter(s.footer ?? "");
      setClubCheckinOpen(!!s.club_checkin_open);
      setSystemTimezone(s.sys_default_timezone ?? "Asia/Shanghai");
      setSessionTimeout(s.session_idle_timeout_minutes ?? 30);
      setMailChannelConfigured(s.mail_channel_configured !== false);
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

  // 站点信息（站点名称、页脚）
  async function saveSiteInfo() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateSystemSettings({
        site_name: siteName,
        footer: footer || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(fieldErrors.capture(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.settings.title")}</h1>

      {/* V0.5.9：SMTP/邮件通道未配置警告横幅（验证码 / 通知邮件无法投递） */}
      {!mailChannelConfigured && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-400/15 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200"
        >
          <span className="font-medium">{t("admin.settings.mailNotConfigured")}</span>
          <span className="text-yellow-700/90 dark:text-yellow-200/80">
            {t("admin.settings.mailNotConfiguredDesc")}
          </span>
        </div>
      )}

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
            {t("common.save")}
          </Button>
        </CardContent>
      </Card>

      {/* 站点信息：站点名称、页脚（独立保存） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.settings.siteInfo")}</CardTitle>
        </CardHeader>
        <CardContent {...fieldErrors.rootProps} className="space-y-3">
          <div className="space-y-2" data-field="site_name">
            <Label htmlFor="siteName">{t("admin.settings.siteName")}</Label>
            <Input id="siteName" aria-invalid={!!fe.site_name} value={siteName} onChange={(e) => setSiteName(e.target.value)} />
            <FieldError>{fe.site_name}</FieldError>
          </div>
          <div className="space-y-2" data-field="footer">
            <Label htmlFor="footer">{t("admin.settings.footer")}</Label>
            <Textarea id="footer" aria-invalid={!!fe.footer} rows={2} value={footer} onChange={(e) => setFooter(e.target.value)} />
            <FieldError>{fe.footer}</FieldError>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && (
            <p className="text-sm text-emerald-600 flex items-center gap-1">
              <Check className="h-4 w-4" />
              {t("admin.settings.saved")}
            </p>
          )}
          <Button onClick={saveSiteInfo} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {t("common.save")}
          </Button>
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

          {/* 备份与恢复文件列表（系统重置的自动备份同样在此可见可下载） */}
          <DbBackupList refreshTick={backupListTick} />
        </CardContent>
      </Card>
    </div>
  );
}
