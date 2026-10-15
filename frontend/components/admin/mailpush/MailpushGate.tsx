"use client";

/**
 * /admin/mailpush 邮件与推送门禁页（V0.5.5 §3.3）
 *
 * 门禁状态完全跟随后端 SystemSetting.mail_system_ready（公开接口读取）：
 * - false（默认）：页面顶部黄色醒目警告横幅（文案与导航 tooltip 完全一致）+ 空态；
 * - true：中性占位（邮件业务在后续版本接入）。
 * 禁止前端写死永久禁用；接口失败时按默认 false 处理。
 */
import { useEffect, useState } from "react";
import AlertTriangle from "@/assets/icons/status/alert-triangle.svg";
import Mail from "@/assets/icons/status/mail.svg";
import { useI18n } from "@/i18n/provider";
import { fetchPublicSettings } from "@/lib/api/system";

export function MailpushGate() {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchPublicSettings()
      .then((s) => setReady(s.mail_system_ready))
      .catch(() => setReady(false))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="space-y-6">
      {/* 未就绪：黄色醒目警告横幅，顶部常驻 */}
      {loaded && !ready && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-400/15 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <span className="leading-relaxed font-medium">
            {t("admin.mailpush.warning")}
          </span>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("admin.mailpush.title")}
        </h1>
      </div>

      {/* 空态：就绪/未就绪两套文案 */}
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-6 py-20 text-center">
        <div
          className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${
            ready ? "bg-primary/10 text-primary" : "bg-yellow-400/15 text-yellow-600 dark:text-yellow-400"
          }`}
        >
          <Mail className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-semibold mb-2">
          {ready ? t("admin.mailpush.ready") : t("admin.mailpush.empty")}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground leading-relaxed">
          {ready ? t("admin.mailpush.readyHint") : t("admin.mailpush.emptyHint")}
        </p>
      </div>
    </div>
  );
}
