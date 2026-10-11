"use client";

/**
 * 活动报名统计（/admin/stats/activities）
 * 展示活动结束后自动生成的报名统计快照：总数/待审/通过/拒绝/签到。
 */
import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { adminGetActivityLiveStats, adminGetActivityStats } from "@/lib/api/stats";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import type { ActivityLiveStatRow, ActivityStatRow } from "@/types/api";

export function StatsActivities() {
  const { t } = useI18n();
  const [rows, setRows] = useState<ActivityStatRow[] | null>(null);
  const [live, setLive] = useState<ActivityLiveStatRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [snap, lv] = await Promise.all([adminGetActivityStats(), adminGetActivityLiveStats()]);
      setRows(snap);
      setLive(lv);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("admin.stats.activities.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.stats.activities.subtitle")}</p>
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
      ) : (
        <>
          {/* 实时：全部活动当前报名计数 */}
          <div>
            <h2 className="text-base font-semibold mb-2">{t("admin.stats.activities.liveTitle")}</h2>
            {!live || live.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {t("admin.stats.activities.liveEmpty")}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="py-2 pr-3">{t("admin.stats.activities.name")}</th>
                        <th className="py-2 pr-3 text-right">{t("admin.stats.activities.total")}</th>
                        <th className="py-2 pr-3 text-right">{t("admin.stats.activities.pending")}</th>
                        <th className="py-2 pr-3 text-right">{t("admin.stats.activities.approved")}</th>
                        <th className="py-2 pr-3 text-right">{t("admin.stats.activities.rejected")}</th>
                        <th className="py-2 text-right">{t("admin.stats.activities.checkedIn")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {live.map((r) => (
                        <tr key={r.activity_id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">{r.activity_name}</td>
                          <td className="py-2 pr-3 text-right font-semibold">{r.total}</td>
                          <td className="py-2 pr-3 text-right text-muted-foreground">{r.pending}</td>
                          <td className="py-2 pr-3 text-right text-emerald-600 dark:text-emerald-400">{r.approved}</td>
                          <td className="py-2 pr-3 text-right text-destructive">{r.rejected}</td>
                          <td className="py-2 text-right text-sky-600 dark:text-sky-400">{r.checked_in}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>

          {/* 快照：已结束活动（后端自动生成） */}
          <div>
            <h2 className="text-base font-semibold mb-2">{t("admin.stats.activities.snapshotTitle")}</h2>
            {!rows || rows.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {t("admin.stats.activities.empty")}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="py-2 pr-3">{t("admin.stats.activities.name")}</th>
                        <th className="py-2 pr-3 text-right">{t("admin.stats.activities.total")}</th>
                        <th className="py-2 pr-3 text-right">{t("admin.stats.activities.pending")}</th>
                        <th className="py-2 pr-3 text-right">{t("admin.stats.activities.approved")}</th>
                        <th className="py-2 pr-3 text-right">{t("admin.stats.activities.rejected")}</th>
                        <th className="py-2 pr-3 text-right">{t("admin.stats.activities.checkedIn")}</th>
                        <th className="py-2 text-right">{t("admin.stats.activities.generatedAt")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.activity_id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">{r.activity_name}</td>
                          <td className="py-2 pr-3 text-right font-semibold">{r.total}</td>
                          <td className="py-2 pr-3 text-right text-muted-foreground">{r.pending}</td>
                          <td className="py-2 pr-3 text-right text-emerald-600 dark:text-emerald-400">{r.approved}</td>
                          <td className="py-2 pr-3 text-right text-destructive">{r.rejected}</td>
                          <td className="py-2 pr-3 text-right text-sky-600 dark:text-sky-400">{r.checked_in}</td>
                          <td className="py-2 text-right text-xs text-muted-foreground">
                            {r.generated_at ? <FormattedUserActionTime utcIso={r.generated_at} /> : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
