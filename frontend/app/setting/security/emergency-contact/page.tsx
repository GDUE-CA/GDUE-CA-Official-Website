"use client";

/**
 * /setting/security/emergency-contact —— 应急联系人（P1，占位页）
 */
import HeartPulse from "@/assets/icons/status/heart-pulse.svg";
import { useI18n } from "@/i18n/provider";
import { ComingSoonCard } from "@/components/setting/ComingSoonCard";

export default function SettingEmergencyContactPage() {
  const { t } = useI18n();
  return (
    <ComingSoonCard
      icon={HeartPulse}
      title={t("setting.security.emergencyTitle")}
      description={t("setting.security.emergencyHint")}
    />
  );
}
