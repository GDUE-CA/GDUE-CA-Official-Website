"use client";
/**
 * /admin/memo - 后台 Memo 管理页
 */
import { useI18n } from "@/i18n/provider";
import { MemoManager } from "@/components/admin/memo/MemoManager";

export default function AdminMemoPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.modules.memo.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.modules.memo.desc")}
        </p>
      </div>
      <MemoManager />
    </div>
  );
}
