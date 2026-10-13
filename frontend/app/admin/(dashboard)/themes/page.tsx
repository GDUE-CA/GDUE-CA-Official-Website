"use client";

/**
 * /admin/themes - 界面主题管理
 * 页面只做组合；列表与操作在 components/admin/themes/ThemesManager.tsx
 */
import { useI18n } from "@/i18n/provider";
import { ThemesManager } from "@/components/admin/themes/ThemesManager";

export default function ThemesPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.themes.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.themes.desc")}
        </p>
      </div>
      <ThemesManager />
    </div>
  );
}
