"use client";

/**
 * /admin/review - 统一审核中心
 * 报名审核 / Bug 反馈 / 重置密码 三类业务按 Tab 分类展示；
 * Tab 状态持久化到 searchParams（?tab=）支持深链；按有效权限显隐 Tab
 */
import { Suspense, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { ReviewShell, type ReviewTabKey } from "@/components/admin/review/ReviewShell";
import { RegistrationsTab } from "@/components/admin/review/RegistrationsTab";
import { BugsTab } from "@/components/admin/review/BugsTab";
import { PasswordResetsTab } from "@/components/admin/review/PasswordResetsTab";
import { useEffectivePermissions } from "@/lib/permissions";

function ReviewPageInner() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { ready, can } = useEffectivePermissions();

  const allowedTabs = useMemo(() => {
    const list: ReviewTabKey[] = [];
    if (can("review.registrations", "view")) list.push("registrations");
    if (can("review.bugs", "view")) list.push("bugs");
    if (can("review.resets", "view")) list.push("resets");
    return list;
  }, [can]);

  const requested = search.get("tab") as ReviewTabKey | null;
  const active: ReviewTabKey | null = ready
    ? requested && allowedTabs.includes(requested)
      ? requested
      : allowedTabs[0] ?? null
    : null;

  /** 切换 Tab：写回 searchParams 持久化（深链可分享） */
  function switchTab(key: ReviewTabKey) {
    router.replace(`${pathname}?tab=${key}`, { scroll: false });
  }

  if (!ready) {
    return <div className="text-muted-foreground">{t("common.loading")}</div>;
  }

  if (!active) {
    return (
      <div className="py-12 text-center text-muted-foreground">{t("admin.review.noAccess")}</div>
    );
  }

  return (
    <ReviewShell
      title={t("admin.review.title")}
      active={active}
      onChange={switchTab}
      tabs={allowedTabs.map((key) => ({ key, label: t(`admin.review.tabs.${key}`) }))}
    >
      {active === "registrations" && <RegistrationsTab />}
      {active === "bugs" && <BugsTab />}
      {active === "resets" && <PasswordResetsTab />}
    </ReviewShell>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewPageInner />
    </Suspense>
  );
}
