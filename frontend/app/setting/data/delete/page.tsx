"use client";

/**
 * /setting/data/delete —— 账号注销（P2：二次确认 + 冷静期，占位页）
 */
import { UserX } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { ComingSoonCard } from "@/components/setting/ComingSoonCard";

export default function SettingDataDeletePage() {
  const { t } = useI18n();
  return (
    <ComingSoonCard
      icon={UserX}
      title={t("setting.data.deleteTitle")}
      description={t("setting.data.deleteHint")}
    />
  );
}
