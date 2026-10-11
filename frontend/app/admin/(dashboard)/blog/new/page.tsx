"use client";

/**
 * /admin/blog/new - 新建博客文章
 * 页面只做组合；编辑器在 components/admin/blog/BlogEditor.tsx
 */
import { useI18n } from "@/i18n/provider";
import { BlogEditor } from "@/components/admin/blog/BlogEditor";

export default function NewBlogPostPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.blog.newTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.blog.newDesc")}
        </p>
      </div>
      <BlogEditor />
    </div>
  );
}
