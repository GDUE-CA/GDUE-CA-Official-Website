"use client";

/**
 * 活动详情组件（供 /admin/activities/[id]/detail 使用）
 *
 * - 统计卡片：读取统计快照（404 = 暂无）；「生成统计快照」触发 finalize（仅已结束活动）
 * - 报名明细：搜索 / 状态筛选 / 服务端分页 / 状态徽章（色调对齐审核中心）
 * - 导出：CSV / Excel（Blob 下载），携带当前状态筛选
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  BarChart3,
  Calculator,
  Download,
  ClipboardList,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/admin/review/StatusBadge";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import { ApiError } from "@/lib/api/client";
import {
  adminGetActivityStatistics,
  adminFinalizeActivity,
  adminListActivityRegistrations,
  adminExportActivityRegistrations,
} from "@/lib/api/activityStats";
import type {
  ActivityStatistics,
  Registration,
  RegistrationStatus,
} from "@/types/api";

const PAGE_SIZE = 20;
const STATUSES: RegistrationStatus[] = ["pending", "approved", "rejected", "checked_in"];

export function ActivityDetail({ activityId }: { activityId: number }) {
  const { t } = useI18n();

  // 统计快照
  const [stats, setStats] = useState<ActivityStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsEmpty, setStatsEmpty] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeNotice, setFinalizeNotice] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    setStatsEmpty(false);
    try {
      setStats(await adminGetActivityStatistics(activityId));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setStats(null);
        setStatsEmpty(true);
      } else {
        setStats(null);
        setStatsError(e instanceof Error ? e.message : "Load failed");
      }
    } finally {
      setStatsLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  /** 生成/刷新统计快照（仅已结束活动；后端会校验并返回错误） */
  async function handleFinalize() {
    if (!confirm(t("admin.activityDetail.finalizeConfirm"))) return;
    setFinalizing(true);
    setFinalizeNotice(null);
    setStatsError(null);
    try {
      setStats(await adminFinalizeActivity(activityId));
      setStatsEmpty(false);
      setFinalizeNotice(t("admin.activityDetail.finalizeDone"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Finalize failed";
      // 后端明确提示活动尚未结束时，用本地化文案替代
      if (msg.includes("尚未结束") || /not\s*(yet\s*)?ended/i.test(msg)) {
        setStatsError(t("admin.activityDetail.errNotEnded"));
      } else {
        setStatsError(msg);
      }
    } finally {
      setFinalizing(false);
    }
  }

  /** 导出报名明细（携带当前状态筛选）；返回是否成功 */
  async function handleExport(format: "csv" | "xlsx", statusFilter: string): Promise<boolean> {
    try {
      const blob = await adminExportActivityRegistrations(
        activityId,
        format,
        (statusFilter || undefined) as RegistrationStatus | undefined
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `activity_${activityId}_registrations.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      alert(
        `${t("admin.activityDetail.exportFailed")}: ${
          e instanceof Error ? e.message : "Export failed"
        }`
      );
      return false;
    }
  }

  const statTiles: { key: string; label: string; value: number | undefined }[] = stats
    ? [
        { key: "total", label: t("admin.activityDetail.statTotal"), value: stats.total },
        { key: "pending", label: t("admin.activityDetail.statPending"), value: stats.pending },
        { key: "approved", label: t("admin.activityDetail.statApproved"), value: stats.approved },
        { key: "rejected", label: t("admin.activityDetail.statRejected"), value: stats.rejected },
        { key: "checked_in", label: t("admin.activityDetail.statCheckedIn"), value: stats.checked_in },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {t("admin.activityDetail.statisticsTitle")}
            </CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
              {stats?.generated_at && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  {t("admin.activityDetail.statGeneratedAt")}:
                  <FormattedUserActionTime utcIso={stats.generated_at} />
                </span>
              )}
              <Button size="sm" variant="outline" onClick={handleFinalize} disabled={finalizing}>
                {finalizing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Calculator className="h-4 w-4 mr-1" />
                )}
                {t("admin.activityDetail.finalizeBtn")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : statsError ? (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {statsError}
            </p>
          ) : statsEmpty || !stats ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t("admin.activityDetail.statisticsEmpty")}
            </p>
          ) : (
            <>
              {finalizeNotice && (
                <p className="text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-md mb-3">
                  {finalizeNotice}
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {statTiles.map((tile) => (
                  <div
                    key={tile.key}
                    className="rounded-md bg-muted/40 px-4 py-3 text-center"
                  >
                    <div className="text-2xl font-bold">{tile.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{tile.label}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 报名明细 */}
      <RegistrationsSection activityId={activityId} onExport={handleExport} />
    </div>
  );
}

/* ---------------- 报名明细列表 ---------------- */

function RegistrationsSection({
  activityId,
  onExport,
}: {
  activityId: number;
  onExport: (format: "csv" | "xlsx", statusFilter: string) => Promise<boolean>;
}) {
  const { t } = useI18n();

  const [items, setItems] = useState<Registration[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);

  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | RegistrationStatus>("");
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListActivityRegistrations(activityId, {
        status_filter: statusFilter || undefined,
        q: query || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [activityId, statusFilter, query, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(q);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  async function handleExport(format: "csv" | "xlsx") {
    setExportDone(false);
    const ok = await onExport(format, statusFilter);
    setExportDone(ok);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            {t("admin.activityDetail.registrationsTitle")}（{total}）
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
              <Download className="h-4 w-4 mr-1" />
              {t("admin.activityDetail.exportCsv")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}>
              <Download className="h-4 w-4 mr-1" />
              {t("admin.activityDetail.exportXlsx")}
            </Button>
          </div>
        </div>
        {/* 筛选栏 */}
        <div className="flex items-center gap-2 flex-wrap pt-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "" | RegistrationStatus);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            aria-label={t("admin.registrations.filterStatus")}
          >
            <option value="">{t("admin.activityDetail.regFilterAll")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.registrations.statuses.${s}`)}
              </option>
            ))}
          </select>
          <Input
            placeholder={t("admin.activityDetail.regSearchPlaceholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          {exportDone && (
            <span className="text-xs text-emerald-600">
              {t("admin.activityDetail.exportDone")}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-8 text-center">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {t("admin.activityDetail.regEmpty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("admin.activityDetail.regColName")}</th>
                  <th className="px-3 py-2">{t("admin.activityDetail.regColStudentId")}</th>
                  <th className="px-3 py-2 hidden md:table-cell">{t("admin.activityDetail.regColCollege")}</th>
                  <th className="px-3 py-2 hidden lg:table-cell">{t("admin.activityDetail.regColMajor")}</th>
                  <th className="px-3 py-2">{t("admin.activityDetail.regColPhone")}</th>
                  <th className="px-3 py-2 hidden lg:table-cell">{t("admin.activityDetail.regColEmail")}</th>
                  <th className="px-3 py-2">{t("admin.activityDetail.regColStatus")}</th>
                  <th className="px-3 py-2 hidden xl:table-cell">{t("admin.activityDetail.regColRemark")}</th>
                  <th className="px-3 py-2 hidden sm:table-cell">{t("admin.activityDetail.regColCheckedInAt")}</th>
                  <th className="px-3 py-2 hidden sm:table-cell">{t("admin.activityDetail.regColSubmittedAt")}</th>
                  <th className="px-3 py-2 hidden xl:table-cell">{t("admin.activityDetail.regColSubmitIp")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      {r.name}
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{r.receipt_code}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.student_id}</td>
                    <td className="px-3 py-2 hidden md:table-cell">{r.college}</td>
                    <td className="px-3 py-2 hidden lg:table-cell">{r.major}</td>
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {r.phone_cc} {r.phone_number}
                    </td>
                    <td className="px-3 py-2 text-xs hidden lg:table-cell">{r.email ?? "—"}</td>
                    <td className="px-3 py-2">
                      {/* 状态徽章色调对齐审核中心 */}
                      <StatusBadge
                        tone={
                          r.status === "pending" ? "warning"
                          : r.status === "approved" ? "success"
                          : r.status === "rejected" ? "danger"
                          : "info"
                        }
                      >
                        {t(`admin.registrations.statuses.${r.status}`)}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate hidden xl:table-cell">
                      {r.remark ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                      {r.checked_in_at ? (
                        <FormattedUserActionTime utcIso={r.checked_in_at} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                      <FormattedUserActionTime utcIso={r.submitted_at} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs hidden xl:table-cell">
                      {r.submit_ip ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页（服务端分页） */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {t("admin.security.pageInfo")
                .replace("{page}", String(page))
                .replace("{total}", String(totalPages))}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("admin.security.prev")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                {t("admin.security.next")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
