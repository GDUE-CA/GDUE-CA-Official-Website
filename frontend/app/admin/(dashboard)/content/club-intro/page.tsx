"use client";

/**
 * /admin/content/club-intro - 社团介绍（Markdown 内容块）
 * 页面只做组合；编辑器在 components/admin/content/ContentBlockEditor.tsx
 */
import { useI18n } from "@/i18n/provider";
import { ContentBlockEditor } from "@/components/admin/content/ContentBlockEditor";

export default function ClubIntroPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.content.clubIntroTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.content.clubIntroDesc")}
        </p>
      </div>
      <ContentBlockEditor ck="club_intro" />
    </div>
  );
}
