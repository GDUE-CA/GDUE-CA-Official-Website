"use client";

/**
 * /admin/blog/[id]/edit - 编辑博客文章
 * 页面只做组合；编辑器在 components/admin/blog/BlogEditor.tsx
 */
import { useParams } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { BlogEditor } from "@/components/admin/blog/BlogEditor";

export default function EditBlogPostPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const postId = Number(params?.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.blog.editTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.blog.editDesc")}
        </p>
      </div>
      {Number.isFinite(postId) && postId > 0 ? (
        <BlogEditor postId={postId} />
      ) : (
        <p className="text-sm text-destructive">{t("admin.blog.errNotFound")}</p>
      )}
    </div>
  );
}
