"use client";

/**
 * /setting/connections —— 第三方账号绑定（占位页）
 */
import { Link2 } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingConnectionsPage() {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <Link2 className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-medium">{t("setting.tabs.connections")}</p>
        <p className="text-sm text-muted-foreground">{t("setting.comingSoon")}</p>
      </CardContent>
    </Card>
  );
}
