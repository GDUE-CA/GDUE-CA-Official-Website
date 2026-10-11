"use client";

/**
 * /admin/members - 成员管理
 * 页面只做组合；列表与表单在 components/admin/members/MembersManager.tsx
 */
import { useI18n } from "@/i18n/provider";
import { MembersManager } from "@/components/admin/members/MembersManager";

export default function MembersPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.members.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.members.desc")}
        </p>
      </div>
      <MembersManager />
    </div>
  );
}
