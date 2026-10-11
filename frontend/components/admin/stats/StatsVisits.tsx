"use client";

/**
 * 访问统计（/admin/stats/visits）
 * 复用概览页同一数据源 /api/admin-stats/access：独立 IP 数、总事件数
 * + 来源明细表（IP、地区徽章、来源构成、次数、最近访问）。
 */
import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetchAccessStats } from "@/lib/api/adminStats";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import type { AccessStats, IpSourceStat } from "@/types/api";

/** 地区徽章配色 */
const REGION_BADGE: Record<string, string> = {
  loopback: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  internal: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  public: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  invalid: "bg-muted text-muted-foreground",
};

export function StatsVisits() {
  const { t } = useI18n();
  const [stats, setStats] = useState<AccessStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchAccessStats());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function regionBadge(r: string) {
    // 复用概览页的地区文案键（accessRegionLoopback 等）
    const regionKeys: Record<string, string> = {
      loopback: "admin.dashboard.accessRegionLoopback",
      internal: "admin.dashboard.accessRegionInternal",
      public: "admin.dashboard.accessRegionPublic",
      invalid: "admin.dashboard.accessRegionInvalid",
    };
    return (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${REGION_BADGE[r] ?? REGION_BADGE.invalid}`}>
        {t(regionKeys[r] ?? regionKeys.invalid)}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("admin.stats.visits.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.stats.visits.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" />
          {t("common.refresh")}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="py-5 text-center">
                <p className="text-3xl font-bold">{stats.unique_ips}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("admin.dashboard.accessUniqueIps")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-5 text-center">
                <p className="text-3xl font-bold">{stats.total_events}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("admin.dashboard.accessEvents")}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="py-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-3">IP</th>
                    <th className="py-2 pr-3">{t("admin.dashboard.accessColRegion")}</th>
                    <th className="py-2 pr-3">{t("admin.dashboard.accessColSource")}</th>
                    <th className="py-2 pr-3 text-right">{t("admin.dashboard.accessColCount")}</th>
                    <th className="py-2 text-right">{t("admin.dashboard.accessColLastSeen")}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_ips.map((row: IpSourceStat) => (
                    <tr key={row.ip} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{row.ip}</td>
                      <td className="py-2 pr-3">{regionBadge(row.region)}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {[
                          row.admin_actions > 0 && `${t("admin.dashboard.accessSourceAdmin")}×${row.admin_actions}`,
                          row.registrations > 0 && `${t("admin.dashboard.accessSourceRegistrations")}×${row.registrations}`,
                          row.bugs > 0 && `${t("admin.dashboard.accessSourceBugs")}×${row.bugs}`,
                        ].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-medium">{row.total}</td>
                      <td className="py-2 text-right text-xs text-muted-foreground">
                        {row.last_seen ? <FormattedUserActionTime utcIso={row.last_seen} /> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
