"use client";

/**
 * 学校身份验证审核管理（/admin/school-verify，Module D-1，review.school 权限）
 * 待审/全部筛选 + 搜索 + 分页 + 通过/驳回（驳回必填备注）。
 * 通过：开启 identity_school_verified 并写入学校外键；驳回：不改用户主表。
 * 审核完成由后端发送站内信。对应后端 /api/admin/school-verify*。
 */
import { useCallback, useEffect, useState } from "react";
import Check from "@/assets/icons/action/check.svg";
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
import {
  adminListSchoolVerify,
  adminReviewSchoolVerify,
} from "@/lib/api/schoolVerify";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import type { SchoolVerifyApplication } from "@/types/api";

const STATUS_FILTERS = ["pending", "approved", "rejected", "all"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  if (status === "approved") return <Badge>{t("setting.school.statusApproved")}</Badge>;
  if (status === "rejected") return <Badge variant="destructive">{t("setting.school.statusRejected")}</Badge>;
  return <Badge variant="secondary">{t("setting.school.statusPending")}</Badge>;
}

export function SchoolVerifyReviewManager() {
  const { t } = useI18n();
  const [items, setItems] = useState<SchoolVerifyApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 驳回弹窗
  const [rejectTarget, setRejectTarget] = useState<SchoolVerifyApplication | null>(null);
  const [rejectRemark, setRejectRemark] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListSchoolVerify({
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

  async function handleApprove(r: SchoolVerifyApplication) {
    const name = r.display_name || r.username || `#${r.user_id}`;
    if (!window.confirm(t("admin.schoolVerify.approveConfirm", { name }))) return;
    setBusyId(r.id);
    setError(null);
    try {
      await adminReviewSchoolVerify(r.id, { action: "approved" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (!rejectRemark.trim()) {
      setError(t("admin.schoolVerify.rejectRemarkRequired"));
      return;
    }
    setBusyId(rejectTarget.id);
    setError(null);
    try {
      await adminReviewSchoolVerify(rejectTarget.id, {
        action: "rejected",
        admin_remark: rejectRemark.trim(),
      });
      setRejectTarget(null);
      setRejectRemark("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t("admin.schoolVerify.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.schoolVerify.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" />
          {t("common.refresh")}
        </Button>
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
              {t(`admin.schoolVerify.filter.${s}`)}
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
            placeholder={t("admin.schoolVerify.searchPlaceholder")}
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
            {t("admin.schoolVerify.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {r.display_name || r.username || `#${r.user_id}`}
                    </span>
                    <span className="text-xs text-muted-foreground">@{r.username}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    <FormattedUserActionTime utcIso={r.created_at} />
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                  <p><span className="text-muted-foreground">{t("setting.school.studentId")}：</span>{r.student_id}</p>
                  <p><span className="text-muted-foreground">{t("profile.schoolCollege")}：</span>{r.college_name ?? "-"}</p>
                  <p><span className="text-muted-foreground">{t("profile.schoolMajor")}：</span>{r.major_name ?? "-"}</p>
                  <p><span className="text-muted-foreground">{t("profile.schoolGrade")}：</span>{r.grade_year ?? "-"}</p>
                  <p><span className="text-muted-foreground">{t("profile.schoolClass")}：</span>{r.class_display_name ?? "-"}</p>
                  {r.attach_url && (
                    <p className="truncate">
                      <a href={r.attach_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {t("setting.school.attach")}
                      </a>
                    </p>
                  )}
                </div>
                {r.remark && (
                  <p className="text-sm text-muted-foreground">
                    {t("setting.school.remark")}：{r.remark}
                  </p>
                )}
                {r.status === "approved" && r.admin_remark && (
                  <p className="text-sm text-muted-foreground">
                    {t("admin.schoolVerify.remarkLabel")}：{r.admin_remark}
                  </p>
                )}
                {r.status === "rejected" && (
                  <p className="text-sm text-destructive">
                    {t("setting.school.rejectionReason")}：{r.admin_remark || "-"}
                  </p>
                )}
                {r.status === "pending" && (
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === r.id}
                      onClick={() => {
                        setRejectTarget(r);
                        setRejectRemark("");
                      }}
                    >
                      <X className="h-4 w-4" />
                      {t("admin.schoolVerify.reject")}
                    </Button>
                    <Button size="sm" disabled={busyId === r.id} onClick={() => handleApprove(r)}>
                      {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {t("admin.schoolVerify.approve")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t("admin.schoolVerify.total", { total })}
          </p>
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

      {/* 驳回弹窗（备注必填） */}
      <Dialog open={rejectTarget !== null} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.schoolVerify.rejectTitle")}</DialogTitle>
            <DialogDescription>{t("admin.schoolVerify.rejectHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sv-reject-remark">{t("admin.schoolVerify.remarkLabel")}</Label>
              <Textarea
                id="sv-reject-remark"
                value={rejectRemark}
                onChange={(e) => setRejectRemark(e.target.value)}
                rows={3}
                maxLength={1000}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectTarget(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={busyId !== null}>
                {t("admin.schoolVerify.rejectConfirm")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
