"use client";

/**
 * /admin/activities/[id]/detail - 活动详情（统计快照 + 报名明细）
 * 页面只做组合；业务组件在 components/admin/activities/ActivityDetail.tsx
 */
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { ActivityDetail } from "@/components/admin/activities/ActivityDetail";

export default function ActivityDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const raw = params?.id;
  const id = Number(Array.isArray(raw) ? raw[0] : raw);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/activities"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("admin.activities.title")}
        </Link>
        <h1 className="text-2xl font-bold mt-1">{t("admin.activityDetail.title")}</h1>
      </div>
      {Number.isFinite(id) && id > 0 ? (
        <ActivityDetail activityId={id} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("admin.activities.empty")}</p>
      )}
    </div>
  );
}
