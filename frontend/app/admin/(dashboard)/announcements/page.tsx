"use client";

/**
 * /admin/announcements - 首页公告管理
 * 页面只做组合；列表与表单在 components/admin/announcements/AnnouncementsManager.tsx
 */
import { useI18n } from "@/i18n/provider";
import { AnnouncementsManager } from "@/components/admin/announcements/AnnouncementsManager";

export default function AnnouncementsPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.announcements.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.announcements.desc")}
        </p>
      </div>
      <AnnouncementsManager category="homepage" />
    </div>
  );
}
