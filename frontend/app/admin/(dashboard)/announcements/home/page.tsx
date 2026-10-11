"use client";

/**
 * /admin/announcements/home - 主页公告管理
 * 页面只做组合；与信息通知共用 AnnouncementsManager，仅 category 不同
 */
import { useI18n } from "@/i18n/provider";
import { AnnouncementsManager } from "@/components/admin/announcements/AnnouncementsManager";

export default function HomeAnnouncementsPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.announcements.homeTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.announcements.homeDesc")}
        </p>
      </div>
      <AnnouncementsManager category="home" />
    </div>
  );
}
