"use client";

/**
 * /admin/blog/comments - 评论管理
 * 页面只做组合；列表与操作在 components/admin/blog/CommentsManager.tsx
 */
import { useI18n } from "@/i18n/provider";
import { CommentsManager } from "@/components/admin/blog/CommentsManager";

export default function BlogCommentsPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.comments.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.comments.desc")}
        </p>
      </div>
      <CommentsManager />
    </div>
  );
}
