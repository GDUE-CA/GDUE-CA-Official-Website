"use client";

/**
 * /admin/review - 统一审核中心
 * 报名审核 / Bug 反馈 / 重置密码 / 找回账号人工审核；
 * 左侧侧边菜单为唯一导航入口（?tab= 深链直达），按有效权限显隐面板
 */
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { RegistrationsTab } from "@/components/admin/review/RegistrationsTab";
import { BugsTab } from "@/components/admin/review/BugsTab";
import { PasswordResetsTab } from "@/components/admin/review/PasswordResetsTab";
import { RecoveryReviewsTab } from "@/components/admin/review/RecoveryReviewsTab";
import { useEffectivePermissions } from "@/lib/permissions";

type ReviewTabKey = "registrations" | "bugs" | "resets" | "recovery";

function ReviewPageInner() {
  const { t } = useI18n();
  const search = useSearchParams();
  const { ready, can } = useEffectivePermissions();

  const allowedTabs = useMemo(() => {
    const list: ReviewTabKey[] = [];
    if (can("review.registrations", "view")) list.push("registrations");
    if (can("review.bugs", "view")) list.push("bugs");
    if (can("review.resets", "view")) list.push("resets", "recovery");
    return list;
  }, [can]);

  const requested = search.get("tab") as ReviewTabKey | null;
  const active: ReviewTabKey | null = ready
    ? requested && allowedTabs.includes(requested)
      ? requested
      : allowedTabs[0] ?? null
    : null;

  if (!ready) {
    return <div className="text-muted-foreground">{t("common.loading")}</div>;
  }

  if (!active) {
    return (
      <div className="py-12 text-center text-muted-foreground">{t("admin.review.noAccess")}</div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.review.title")}</h1>
      {active === "registrations" && <RegistrationsTab />}
      {active === "bugs" && <BugsTab />}
      {active === "resets" && <PasswordResetsTab />}
      {active === "recovery" && <RecoveryReviewsTab />}
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewPageInner />
    </Suspense>
  );
}
