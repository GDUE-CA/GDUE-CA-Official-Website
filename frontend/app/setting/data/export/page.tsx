"use client";

/**
 * /setting/data/export —— 导出我的全部个人数据（异步打包，后续迭代开放）
 */
import { Download } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { ComingSoonCard } from "@/components/setting/ComingSoonCard";

export default function SettingDataExportPage() {
  const { t } = useI18n();
  return (
    <ComingSoonCard
      icon={Download}
      title={t("setting.data.exportTitle")}
      description={t("setting.data.exportHint")}
    />
  );
}
