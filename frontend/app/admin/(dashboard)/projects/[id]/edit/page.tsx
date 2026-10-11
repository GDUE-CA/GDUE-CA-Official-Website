"use client";

/**
 * /admin/projects/[id]/edit - 编辑项目
 * 页面只做组合；编辑器在 components/admin/projects/ProjectEditor.tsx
 */
import { useParams } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { ProjectEditor } from "@/components/admin/projects/ProjectEditor";

export default function EditProjectPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const projectId = Number(params?.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.projects.editTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.projects.desc")}
        </p>
      </div>
      {Number.isFinite(projectId) && projectId > 0 ? (
        <ProjectEditor projectId={projectId} />
      ) : (
        <p className="text-sm text-destructive">{t("admin.projects.invalidId")}</p>
      )}
    </div>
  );
}
