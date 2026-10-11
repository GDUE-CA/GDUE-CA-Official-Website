"use client";

/**
 * /admin/dashboard 仪表盘首页：展示活动/报名/Bug 概览统计
 * （/admin 根路径 307 重定向到此页，见上级 page.tsx）
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, ClipboardList, Bug, Clock, Globe } from "lucide-react";
import { listRegistrations } from "@/lib/api/register";
import { listBugReports } from "@/lib/api/bugReport";
import { fetchAccessStats, fetchOverview } from "@/lib/api/adminStats";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import type { Registration, BugReport, AccessStats, AdminOverview } from "@/types/api";

export default function AdminDashboardPage() {
  const { t, locale } = useI18n();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [access, setAccess] = useState<AccessStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 计数走聚合接口；明细只取最新 5 条（后端已按时间倒序 + per_page 截断）
    Promise.all([
      fetchOverview().catch(() => null),
      listRegistrations({ per_page: 5 }).catch(() => [] as Registration[]),
      listBugReports({ per_page: 5 }).catch(() => [] as BugReport[]),
      fetchAccessStats().catch(() => null),
    ]).then(([o, r, b, st]) => {
      setOverview(o);
      setRegistrations(r);
      setBugs(b);
      setAccess(st);
      setLoading(false);
    });
  }, []);

  const pending = overview?.registrations_pending ?? 0;
  const openBugs = overview?.bugs_open ?? 0;

  /** IP 地区分类 → 本地化标签 */
  function regionLabel(region: string): string {
    switch (region) {
      case "loopback":
        return t("admin.dashboard.accessRegionLoopback");
      case "internal":
        return t("admin.dashboard.accessRegionInternal");
      case "public":
        return t("admin.dashboard.accessRegionPublic");
      default:
        return t("admin.dashboard.accessRegionInvalid");
    }
  }

  /** IP 地区分类 → 徽章配色 */
  function regionBadgeClass(region: string): string {
    switch (region) {
      case "internal":
        return "bg-blue-500/10 text-blue-600";
      case "loopback":
        return "bg-muted text-muted-foreground";
      case "public":
        return "bg-emerald-500/10 text-emerald-600";
      default:
        return "bg-amber-500/10 text-amber-600";
    }
  }

  /** 可读属地：zh 系语言用 location_zh，其余用 location_en；特殊枚举走 i18n（同评论属地） */
  function locationLabel(s: { location_zh: string | null; location_en: string | null }): string {
    const raw = locale.startsWith("zh") ? s.location_zh : s.location_en;
    if (!raw) return t("admin.dashboard.accessRegionInvalid");
    if (raw === "local") return t("comments.locLocal");
    if (raw === "intranet") return t("comments.locIntranet");
    return raw;
  }

  const stats = [
    {
      label: t("admin.dashboard.statsActivities"),
      value: overview?.activities_total ?? 0,
      icon: CalendarDays,
      href: "/admin/activities",
      color: "bg-blue-500/10 text-blue-600",
    },
    {
      label: t("admin.dashboard.statsRegistrations"),
      value: overview?.registrations_total ?? 0,
      icon: ClipboardList,
      href: "/admin/review?tab=registrations",
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      label: t("admin.dashboard.statsPending"),
      value: pending,
      icon: Clock,
      href: "/admin/review?tab=registrations&status=pending",
      color: "bg-amber-500/10 text-amber-600",
    },
    {
      label: t("admin.dashboard.statsBugs"),
      value: openBugs,
      icon: Bug,
      href: "/admin/review?tab=bugs&status=open",
      color: "bg-rose-500/10 text-rose-600",
    },
  ];

  if (loading) {
    return (
      <div className="text-muted-foreground">{t("common.loading")}</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.dashboard.overview")}</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all">
              <CardContent className="p-5">
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${s.color} mb-3`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="text-3xl font-bold">{s.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.dashboard.registrations")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {registrations.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/60 last:border-0">
                <span className="font-medium truncate">{r.name}</span>
                <span className="text-xs text-muted-foreground">{new Date(r.submitted_at).toLocaleDateString()}</span>
              </div>
            ))}
            {registrations.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("admin.registrations.empty")}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.dashboard.bugs")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {bugs.slice(0, 5).map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/60 last:border-0">
                <span className="font-medium truncate">{b.description.slice(0, 60)}</span>
                <span className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</span>
              </div>
            ))}
            {bugs.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("admin.bugs.empty")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 访问来源：后台操作 + 游客表单提交的 IP 聚合、地区分类与 GeoIP 可读属地 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t("admin.dashboard.accessStatsTitle")}
          </CardTitle>
          {access && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                {t("admin.dashboard.accessUniqueIps")}：<span className="font-semibold text-foreground">{access.unique_ips}</span>
              </span>
              <span>
                {t("admin.dashboard.accessEvents")}：<span className="font-semibold text-foreground">{access.total_events}</span>
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!access || access.top_ips.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.dashboard.accessEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-4 font-medium">{t("admin.dashboard.accessColIp")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.dashboard.accessColRegion")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.dashboard.accessColSource")}</th>
                    <th className="py-2 pr-4 font-medium text-right">{t("admin.dashboard.accessColCount")}</th>
                    <th className="py-2 font-medium">{t("admin.dashboard.accessColLastSeen")}</th>
                  </tr>
                </thead>
                <tbody>
                  {access.top_ips.map((s) => (
                    <tr key={s.ip} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{s.ip}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${regionBadgeClass(s.region)}`}>
                          {regionLabel(s.region)}
                        </span>
                        <span className="ml-1.5 text-xs text-muted-foreground">{locationLabel(s)}</span>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                          {s.admin_actions > 0 && (
                            <span className="rounded bg-muted px-1.5 py-0.5">
                              {t("admin.dashboard.accessSourceAdmin")} ×{s.admin_actions}
                            </span>
                          )}
                          {s.registrations > 0 && (
                            <span className="rounded bg-muted px-1.5 py-0.5">
                              {t("admin.dashboard.accessSourceRegistrations")} ×{s.registrations}
                            </span>
                          )}
                          {s.bugs > 0 && (
                            <span className="rounded bg-muted px-1.5 py-0.5">
                              {t("admin.dashboard.accessSourceBugs")} ×{s.bugs}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right font-semibold">{s.total}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {s.last_seen ? (
                          <FormattedUserActionTime utcIso={s.last_seen} />
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
