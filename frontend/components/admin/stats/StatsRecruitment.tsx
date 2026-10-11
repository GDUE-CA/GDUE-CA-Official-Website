"use client";

/**
 * 招新统计（/admin/stats/recruitment）
 * 社团报名（registration_type=club）按意向部门 / 学院 / 状态聚合。
 */
import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminGetRecruitmentStats } from "@/lib/api/stats";
import type { RecruitmentGroupStat, RecruitmentStats } from "@/types/api";

/** 分组统计表 */
function GroupTable({ title, rows, emptyText }: { title: string; rows: RecruitmentGroupStat[]; emptyText: string }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="py-2">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3">{t("admin.stats.common.key")}</th>
                <th className="py-2 pr-3 text-right">{t("admin.stats.common.total")}</th>
                <th className="py-2 pr-3 text-right">{t("realname.statusPending")}</th>
                <th className="py-2 pr-3 text-right">{t("realname.statusApproved")}</th>
                <th className="py-2 text-right">{t("realname.statusRejected")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{r.key}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{r.total}</td>
                  <td className="py-2 pr-3 text-right text-muted-foreground">{r.pending}</td>
                  <td className="py-2 pr-3 text-right text-emerald-600 dark:text-emerald-400">{r.approved}</td>
                  <td className="py-2 text-right text-destructive">{r.rejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function StatsRecruitment() {
  const { t } = useI18n();
  const [stats, setStats] = useState<RecruitmentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setStats(await adminGetRecruitmentStats());
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
          <h1 className="text-xl font-semibold">{t("admin.stats.recruitment.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.stats.recruitment.subtitle")}</p>
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
          <Card>
            <CardContent className="py-5 text-center">
              <p className="text-3xl font-bold">{stats.total}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("admin.stats.recruitment.total")}</p>
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <GroupTable
              title={t("admin.stats.recruitment.byPosition")}
              rows={stats.by_position}
              emptyText={t("admin.stats.recruitment.empty")}
            />
            <GroupTable
              title={t("admin.stats.recruitment.byCollege")}
              rows={stats.by_college}
              emptyText={t("admin.stats.recruitment.empty")}
            />
          </div>
          <GroupTable
            title={t("admin.stats.recruitment.byStatus")}
            rows={stats.by_status}
            emptyText={t("admin.stats.recruitment.empty")}
          />
        </>
      ) : null}
    </div>
  );
}
