"use client";

/**
 * NotificationSettings —— 通知设置（2026-10 重建）
 *
 * 三分类：
 * 1. 内容互动（点赞/评论/回复）—— 可自由开关
 * 2. 业务协作（任务分配/任务变更/站内公告）—— 可自由开关
 * 3. 账号安全（异地登录/凭据变更）—— 锁死置灰，恒为开启，后端同样强制
 *
 * 修改即时保存（PUT /api/account/notifications）。
 * 移动端提供「前往系统设置」入口（跳转浏览器/操作系统通知权限）。
 */
import { useEffect, useState } from "react";
import Bell from "@/assets/icons/status/bell.svg";
import Heart from "@/assets/icons/status/heart.svg";
import MessageSquare from "@/assets/icons/status/message-square.svg";
import Reply from "@/assets/icons/action/reply.svg";
import ClipboardList from "@/assets/icons/action/clipboard-list.svg";
import RefreshCw from "@/assets/icons/action/refresh-cw.svg";
import Megaphone from "@/assets/icons/status/megaphone.svg";
import ShieldAlert from "@/assets/icons/status/shield-alert.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import Smartphone from "@/assets/icons/status/smartphone.svg";
import Lock from "@/assets/icons/status/lock.svg";
import { useI18n } from "@/i18n/provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  fetchNotificationPreference,
  updateNotificationPreference,
} from "@/lib/api/account";
import type { NotificationPreference, NotificationPreferenceUpdate } from "@/types/api";
import { cn } from "@/lib/utils";

type ToggleKey =
  | "content_liked"
  | "content_commented"
  | "content_replied"
  | "biz_task_assigned"
  | "biz_task_changed"
  | "biz_announcement";

interface RowDef {
  key: ToggleKey;
  icon: typeof Bell;
  label: string;
}

const CONTENT_ROWS: RowDef[] = [
  { key: "content_liked", icon: Heart, label: "setting.notify.liked" },
  { key: "content_commented", icon: MessageSquare, label: "setting.notify.commented" },
  { key: "content_replied", icon: Reply, label: "setting.notify.replied" },
];

const BIZ_ROWS: RowDef[] = [
  { key: "biz_task_assigned", icon: ClipboardList, label: "setting.notify.taskAssigned" },
  { key: "biz_task_changed", icon: RefreshCw, label: "setting.notify.taskChanged" },
  { key: "biz_announcement", icon: Megaphone, label: "setting.notify.announcement" },
];

export function NotificationSettings() {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<NotificationPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedTip, setSavedTip] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setPrefs(await fetchNotificationPreference());
      } catch (err) {
        setError(err instanceof Error ? err.message : t("common.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(row: ToggleKey) {
    if (!prefs) return;
    const nextValue = !prefs[row];
    const optimistic = { ...prefs, [row]: nextValue };
    setPrefs(optimistic);
    setSavingKey(row);
    setError(null);
    try {
      const payload: NotificationPreferenceUpdate = { [row]: nextValue };
      const fresh = await updateNotificationPreference(payload);
      setPrefs(fresh);
      setSavedTip(true);
      setTimeout(() => setSavedTip(false), 2000);
    } catch (err) {
      // 回滚
      setPrefs(prefs);
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    } finally {
      setSavingKey(null);
    }
  }

  function goSystemSettings() {
    // 浏览器/操作系统没有统一的通知设置 URL；尝试打开浏览器站点设置（各浏览器支持不一）
    try {
      window.open("chrome://settings/content/notifications", "_blank", "noopener,noreferrer");
    } catch {
      /* 不支持时忽略 */
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!prefs) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-destructive">
          {error ?? t("common.loadFailed")}
        </CardContent>
      </Card>
    );
  }

  function Switch({
    checked,
    busy,
    disabled,
    onToggle,
  }: {
    checked: boolean;
    busy: boolean;
    disabled?: boolean;
    onToggle: () => void;
  }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled || busy}
        onClick={onToggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          disabled
            ? "bg-primary/40 cursor-not-allowed"
            : checked
              ? "bg-primary cursor-pointer"
              : "bg-muted-foreground/40 cursor-pointer"
        )}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 absolute left-1.5 text-white animate-spin" />
        ) : (
          <span
            className={cn(
              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
              checked ? "translate-x-5" : "translate-x-0.5"
            )}
          />
        )}
      </button>
    );
  }

  function ToggleRow({ row }: { row: RowDef }) {
    const Icon = row.icon;
    return (
      <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm">{t(row.label)}</span>
        </div>
        <Switch
          checked={prefs?.[row.key] ?? false}
          busy={savingKey === row.key}
          onToggle={() => void toggle(row.key)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. 内容互动 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.notify.groupContent")}</CardTitle>
        </CardHeader>
        <CardContent>
          {CONTENT_ROWS.map((row) => (
            <ToggleRow key={row.key} row={row} />
          ))}
        </CardContent>
      </Card>

      {/* 2. 业务协作 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.notify.groupBiz")}</CardTitle>
        </CardHeader>
        <CardContent>
          {BIZ_ROWS.map((row) => (
            <ToggleRow key={row.key} row={row} />
          ))}
        </CardContent>
      </Card>

      {/* 3. 账号安全（锁死） */}
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="h-4 w-4 text-primary" />
            {t("setting.notify.groupSecurity")}
          </CardTitle>
          <CardDescription className="flex items-start gap-1.5">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {t("setting.notify.securityLockedHint")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 py-3 border-b border-border">
            <div className="flex items-center gap-2.5 min-w-0">
              <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm">{t("setting.notify.newDevice")}</span>
            </div>
            <Switch checked busy={false} disabled onToggle={() => undefined} />
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <ShieldAlert className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm">{t("setting.notify.credentialChange")}</span>
            </div>
            <Switch checked busy={false} disabled onToggle={() => undefined} />
          </div>
        </CardContent>
      </Card>

      {/* 移动端：前往系统通知设置 */}
      <Card className="md:hidden">
        <CardHeader>
          <CardTitle className="text-base">{t("setting.notify.systemTitle")}</CardTitle>
          <CardDescription>{t("setting.notify.systemHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={goSystemSettings}
            className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
          >
            <Smartphone className="h-4 w-4" />
            {t("setting.notify.openSystemSettings")}
          </button>
        </CardContent>
      </Card>

      {savedTip && (
        <p className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-600 dark:bg-green-950/20">
          <CheckCircle2 className="h-4 w-4" />
          {t("setting.success")}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
