"use client";

/**
 * /admin/recruitment - 招新管理
 * 页面只做组合；双 Tab 业务组件在 components/admin/recruitment/RecruitmentManager.tsx
 */
import { useI18n } from "@/i18n/provider";
import { RecruitmentManager } from "@/components/admin/recruitment/RecruitmentManager";

export default function RecruitmentPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.recruitment.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.recruitment.desc")}
        </p>
      </div>
      <RecruitmentManager />
    </div>
  );
}
