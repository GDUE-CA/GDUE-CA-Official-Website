"use client";

/**
 * /admin/blog/tags - 博客标签管理
 * 页面只做组合；标签 CRUD 在 components/admin/blog/BlogTagsManager.tsx
 */
import { useI18n } from "@/i18n/provider";
import { BlogTagsManager } from "@/components/admin/blog/BlogTagsManager";

export default function BlogTagsPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.blog.tagsTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.blog.tagsDesc")}
        </p>
      </div>
      <BlogTagsManager />
    </div>
  );
}
