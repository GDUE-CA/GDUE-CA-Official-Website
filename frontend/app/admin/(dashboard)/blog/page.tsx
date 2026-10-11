"use client";

/**
 * /admin/blog - 博客文章管理
 * 页面只做组合；列表与操作在 components/admin/blog/BlogManager.tsx
 */
import { useI18n } from "@/i18n/provider";
import { BlogManager } from "@/components/admin/blog/BlogManager";

export default function BlogPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.blog.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.blog.desc")}
        </p>
      </div>
      <BlogManager />
    </div>
  );
}
