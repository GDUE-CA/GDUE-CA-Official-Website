"use client";

/**
 * 社团报名审核管理（/admin/club-apply，Module D-2，recruitment 权限）
 * 待审/全部筛选 + 搜索 + 分页 + 接纳/拒绝（拒绝必填备注）+ csv/xlsx 导出。
 * 注意：审核动作不会改动用户的学校身份字段（与学校验证流程完全隔离）。
 * 审核完成由后端发送站内信。对应后端 /api/admin/club-apply*。
 */
import { useCallback, useEffect, useState } from "react";
import Check from "@/assets/icons/action/check.svg";
import Download from "@/assets/icons/action/download.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import RefreshCw from "@/assets/icons/action/refresh-cw.svg";
import Search from "@/assets/icons/action/search.svg";
import X from "@/assets/icons/action/x.svg";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminListCard } from "../shared/AdminListCard";
import {
  adminExportClubApplies,
  adminListClubApplies,
  adminReviewClubApply,
} from "@/lib/api/clubApply";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import type { ClubApplyRecord, ClubApplyStatus } from "@/types/api";

const STATUS_FILTERS: (ClubApplyStatus | "all")[] = ["pending", "accept", "reject", "all"];
const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: ClubApplyStatus }) {
  const { t } = useI18n();
  if (status === "accept") return <Badge>{t("admin.clubApply.statusAccept")}</Badge>;
  if (status === "reject") return <Badge variant="destructive">{t("admin.clubApply.statusReject")}</Badge>;
  return <Badge variant="secondary">{t("admin.clubApply.statusPending")}</Badge>;
}

export function ClubApplyReviewManager() {
  const { t } = useI18n();
  const [items, setItems] = useState<ClubApplyRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ClubApplyStatus | "all">("pending");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 拒绝弹窗
  const [rejectTarget, setRejectTarget] = useState<ClubApplyRecord | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListClubApplies({
        status: statusFilter === "all" ? undefined : statusFilter,
        q: q.trim() || undefined,
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
  }, [statusFilter, q, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAccept(r: ClubApplyRecord) {
    const name = r.real_name || r.display_name || r.username || `#${r.user_id}`;
    if (!window.confirm(t("admin.clubApply.acceptConfirm", { name }))) return;
    setBusyId(r.id);
    setError(null);
    try {
      await adminReviewClubApply(r.id, { action: "accept" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (!rejectNote.trim()) {
      setError(t("admin.clubApply.rejectNoteRequired"));
      return;
    }
    setBusyId(rejectTarget.id);
    setError(null);
    try {
      await adminReviewClubApply(rejectTarget.id, {
        action: "reject",
        admin_note: rejectNote.trim(),
      });
      setRejectTarget(null);
      setRejectNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleExport(format: "csv" | "xlsx") {
    setExporting(true);
    setError(null);
    try {
      await adminExportClubApplies(
        format,
        statusFilter === "all" ? undefined : statusFilter
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setExporting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t("admin.clubApply.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.clubApply.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={exporting} onClick={() => handleExport("csv")}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" disabled={exporting} onClick={() => handleExport("xlsx")}>
            <Download className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {/* 筛选 + 搜索 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-input overflow-hidden">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              className={`px-3 h-9 text-sm transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-muted-foreground"
              }`}
            >
              {t(`admin.clubApply.filter.${s}`)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={t("admin.clubApply.searchPlaceholder")}
            className="pl-8"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("admin.clubApply.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <AdminListCard
              key={r.id}
              title={
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{r.real_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.username ? `@${r.username}` : `#${r.user_id}`}
                  </span>
                  <Badge variant="outline">
                    {t("admin.clubApply.typeSchool")}
                  </Badge>
                  <StatusBadge status={r.status} />
                </span>
              }
              badge={
                <span className="text-xs text-muted-foreground">
                  <FormattedUserActionTime utcIso={r.created_at} />
                </span>
              }
              footerClassName="border-t-0 pt-1 justify-end"
              actions={
                r.status === "pending" ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === r.id}
                      onClick={() => {
                        setRejectTarget(r);
                        setRejectNote("");
                      }}
                    >
                      <X className="h-4 w-4" />
                      {t("admin.clubApply.reject")}
                    </Button>
                    <Button size="sm" disabled={busyId === r.id} onClick={() => handleAccept(r)}>
                      {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {t("admin.clubApply.accept")}
                    </Button>
                  </>
                ) : undefined
              }
            >
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                <p><span className="text-muted-foreground">{t("admin.clubApply.phone")}：</span>{r.phone}</p>
                {r.email && (
                  <p className="truncate"><span className="text-muted-foreground">Email：</span>{r.email}</p>
                )}
                <p><span className="text-muted-foreground">{t("setting.school.studentId")}：</span>{r.student_id ?? "-"}</p>
                <p><span className="text-muted-foreground">{t("profile.schoolCollege")}：</span>{r.college ?? "-"}</p>
                <p><span className="text-muted-foreground">{t("profile.schoolMajor")}：</span>{r.major ?? "-"}</p>
                <p><span className="text-muted-foreground">{t("admin.clubApply.enrollYear")}：</span>{r.enroll_year ?? "-"}</p>
                <p><span className="text-muted-foreground">{t("admin.clubApply.className")}：</span>{r.class_name ?? "-"}</p>
              </div>
              <p className="text-sm">
                <span className="text-muted-foreground">{t("admin.clubApply.departments")}：</span>
                {(r.departments ?? []).join("、") || "-"}
              </p>
              {r.intro && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                  {t("admin.clubApply.intro")}：{r.intro}
                </p>
              )}
              {r.status === "reject" && (
                <p className="text-sm text-destructive">
                  {t("admin.clubApply.adminNote")}：{r.admin_note || "-"}
                </p>
              )}
              {r.status === "accept" && r.admin_note && (
                <p className="text-sm text-muted-foreground">
                  {t("admin.clubApply.adminNote")}：{r.admin_note}
                </p>
              )}
            </AdminListCard>
          ))}
        </div>
      )}

      {/* 分页 */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{t("admin.clubApply.total", { total })}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t("common.prevPage")}
            </Button>
            <span className="px-2 py-1.5 text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("common.nextPage")}
            </Button>
          </div>
        </div>
      )}

      {/* 拒绝弹窗（备注必填） */}
      <Dialog open={rejectTarget !== null} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.clubApply.rejectTitle")}</DialogTitle>
            <DialogDescription>{t("admin.clubApply.rejectHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ca-reject-note">{t("admin.clubApply.adminNote")}</Label>
              <Textarea
                id="ca-reject-note"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={3}
                maxLength={1000}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectTarget(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={busyId !== null}>
                {t("admin.clubApply.rejectConfirm")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
