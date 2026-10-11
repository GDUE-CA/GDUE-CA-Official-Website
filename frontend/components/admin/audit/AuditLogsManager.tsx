"use client";

/**
 * 操作日志（/admin/audit-logs）
 * 只读检索：action 前缀筛选 + 关键词搜索 + 目标/用户/日期筛选 + 分页 + CSV 导出，
 * trace_id 一键复制（审计不可修改/删除）。
 * 对应后端 /api/admin/audit-logs。
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, Loader2, RefreshCw, Search } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { adminExportAuditLogs, adminListAuditLogs, type AuditLogFilters } from "@/lib/api/auditLogs";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import type { AuditLogInfo } from "@/types/api";

/** 常用动作前缀快捷筛选（动作字符串本身即数据，不做翻译） */
const ACTION_FILTERS = ["", "login", "activity.", "review.", "media.", "oauth.", "sso."];
const PAGE_SIZE = 30;

export function AuditLogsManager() {
  const { t } = useI18n();
  const [items, setItems] = useState<AuditLogInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [target, setTarget] = useState("");
  const [userId, setUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 当前筛选（列表与导出共用） */
  function currentFilters(): AuditLogFilters {
    const user_id = userId.trim() === "" ? undefined : Number(userId);
    return {
      action: action || undefined,
      q: q.trim() || undefined,
      target: target.trim() || undefined,
      user_id: user_id !== undefined && Number.isFinite(user_id) ? user_id : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    };
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListAuditLogs({
        ...currentFilters(),
        page,
        page_size: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, q, target, userId, dateFrom, dateTo, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  /** CSV 导出：当前筛选直接下载 */
  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const blob = await adminExportAuditLogs(currentFilters());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit_logs.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setExporting(false);
    }
  }

  /** trace_id 一键复制（拿完整 id 去日志里 grep） */
  async function copyTrace(r: AuditLogInfo) {
    if (!r.trace_id) return;
    try {
      await navigator.clipboard.writeText(r.trace_id);
      setCopiedId(r.id);
      setTimeout(() => setCopiedId((v) => (v === r.id ? null : v)), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("admin.auditLogs.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.auditLogs.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t("admin.auditLogs.export")}
          </Button>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {/* 动作筛选 + 搜索 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-md border border-input overflow-hidden">
          {ACTION_FILTERS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAction(a);
                setPage(1);
              }}
              className={`px-3 h-9 text-sm transition-colors ${
                action === a
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-muted-foreground"
              }`}
            >
              {a === "" ? t("admin.auditLogs.filterAll") : a}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={t("admin.auditLogs.searchPlaceholder")}
            className="pl-8"
          />
        </div>
      </div>

      {/* 目标 / 用户 / 日期筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setPage(1);
          }}
          placeholder={t("admin.auditLogs.targetPlaceholder")}
          className="w-44"
        />
        <Input
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value.replace(/[^0-9]/g, ""));
            setPage(1);
          }}
          placeholder={t("admin.auditLogs.userIdPlaceholder")}
          inputMode="numeric"
          className="w-28"
        />
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          aria-label={t("admin.auditLogs.dateFrom")}
          className="w-40"
        />
        <span className="text-muted-foreground text-sm">—</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          aria-label={t("admin.auditLogs.dateTo")}
          className="w-40"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("admin.auditLogs.empty")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-3">{t("admin.auditLogs.time")}</th>
                  <th className="py-2 pr-3">{t("admin.auditLogs.user")}</th>
                  <th className="py-2 pr-3">{t("admin.auditLogs.action")}</th>
                  <th className="py-2 pr-3">{t("admin.auditLogs.detail")}</th>
                  <th className="py-2 pr-3">{t("admin.auditLogs.ip")}</th>
                  <th className="py-2">{t("admin.auditLogs.trace")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                      <FormattedUserActionTime utcIso={r.created_at} />
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {r.username ? `@${r.username}` : "—"}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.action}</td>
                    <td className="py-2 pr-3 text-xs max-w-72 break-all">
                      {r.detail || r.target || "—"}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.ip || "—"}</td>
                    <td className="py-2">
                      {r.trace_id ? (
                        <button
                          type="button"
                          onClick={() => copyTrace(r)}
                          title={r.trace_id}
                          className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {copiedId === r.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          {r.trace_id.slice(0, 12)}
                        </button>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("common.prevPage")}
          </Button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            {t("common.nextPage")}
          </Button>
        </div>
      )}
    </div>
  );
}
