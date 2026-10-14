"use client";

/**
 * /setting/security/totp —— 两步验证 TOTP（P1，占位页）
 */
import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { ComingSoonCard } from "@/components/setting/ComingSoonCard";

export default function SettingTotpPage() {
  const { t } = useI18n();
  return (
    <ComingSoonCard
      icon={ShieldCheck}
      title={t("setting.security.totpTitle")}
      description={t("setting.security.totpHint")}
    />
  );
}
