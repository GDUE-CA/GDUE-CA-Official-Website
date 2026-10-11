"use client";

/**
 * /admin/projects - 项目展示管理
 * 页面只做组合；列表与操作在 components/admin/projects/ProjectsManager.tsx
 */
import { useI18n } from "@/i18n/provider";
import { ProjectsManager } from "@/components/admin/projects/ProjectsManager";

export default function ProjectsPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.projects.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.projects.desc")}
        </p>
      </div>
      <ProjectsManager />
    </div>
  );
}
