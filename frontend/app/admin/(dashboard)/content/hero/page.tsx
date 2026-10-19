"use client";

/**
 * /admin/content/hero - 首页标题管理（Hero 区块）
 * 页面只做组合；编辑逻辑集中在 HeroManager
 */
import { useI18n } from "@/i18n/provider";
import { HeroManager } from "@/components/admin/content/HeroManager";

export default function HeroPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.content.hero.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("admin.content.hero.desc")}</p>
      </div>
      <HeroManager />
    </div>
  );
}
