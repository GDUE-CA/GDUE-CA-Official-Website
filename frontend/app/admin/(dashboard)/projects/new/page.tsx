"use client";

/**
 * /admin/projects/new - 新建项目
 * 编辑器在 components/admin/projects/ProjectEditor.tsx（无 projectId = 新建模式）
 */
import { useI18n } from "@/i18n/provider";
import { ProjectEditor } from "@/components/admin/projects/ProjectEditor";

export default function NewProjectPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.projects.newTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.projects.desc")}
        </p>
      </div>
      <ProjectEditor />
    </div>
  );
}
