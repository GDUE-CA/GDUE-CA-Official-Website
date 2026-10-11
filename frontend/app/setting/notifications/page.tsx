"use client";

/**
 * /setting/notifications —— 通知偏好设置（占位页）
 */
import { Bell } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingNotificationsPage() {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <Bell className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-medium">{t("setting.tabs.notifications")}</p>
        <p className="text-sm text-muted-foreground">{t("setting.comingSoon")}</p>
      </CardContent>
    </Card>
  );
}
