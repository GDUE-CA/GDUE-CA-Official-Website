"use client";

/**
 * 举报审核管理（/admin/audit/report，review.reports 权限）
 *
 * 需求5 §5.6：
 * - 筛选：举报类型 / 审核状态 / 提交时间区间
 * - 列表：类型、被举报资源预览、举报人、被举报对象、提交时间、状态
 * - 操作：查看详情（原始内容 + 举报理由）；驳回（备注，可站内信通知举报人）；
 *   通过（按类型选择处罚动作，用户类支持临时封禁天数）
 * - 通知：全局开关控制审核完成后是否发送站内信
 * 隐私隔离：仅具备 review.reports 权限的管理员可访问；被举报对象无法查看举报人信息。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Check from "@/assets/icons/action/check.svg";
import X from "@/assets/icons/action/x.svg";
import RefreshCw from "@/assets/icons/action/refresh-cw.svg";
import Eye from "@/assets/icons/status/eye.svg";
import ExternalLink from "@/assets/icons/navigation/external-link.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { useEffectivePermissions } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminListCard } from "../shared/AdminListCard";
import { StatusBadge, type StatusTone } from "../review/StatusBadge";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import {
  adminGetReport,
  adminGetReportNotifySetting,
  adminListReports,
  adminReviewReport,
  adminSetReportNotifySetting,
} from "@/lib/api/reports";
import type {
  ReportOut,
  ReportType,
  ReportStatus,
  ReportPenalty,
} from "@/types/api";

const PAGE_SIZE = 20;
const USER_PENALTIES: ReportPenalty[] = ["warning", "hide_profile", "ban_temp"];
const CONTENT_PENALTIES: ReportPenalty[] = ["hide_content"];

/** 状态徽章色调 */
function statusTone(s: ReportStatus): StatusTone {
  if (s === "approved") return "success";
  if (s === "rejected") return "danger";
  return "warning";
}

export function ReportAuditManager() {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const { ready, can } = useEffectivePermissions();
  const canManage = can("review.reports", "manage");

  const [items, setItems] = useState<ReportOut[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<ReportType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("pending");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 通知开关（全局）
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [notifySaving, setNotifySaving] = useState(false);

  // 详情弹窗
  const [detail, setDetail] = useState<ReportOut | null>(null);

  // 审核弹窗
  const [reviewItem, setReviewItem] = useState<ReportOut | null>(null);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [penalty, setPenalty] = useState<ReportPenalty>("warning");
  const [banDays, setBanDays] = useState(7);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListReports({
        report_type: typeFilter === "all" ? undefined : typeFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        start: start ? `${start}T00:00:00` : undefined,
        end: end ? `${end}T23:59:59` : undefined,
        page,
        per_page: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, start, end, page, t]);

  useEffect(() => {
    if (ready && can("review.reports", "view")) load();
  }, [ready, can, load]);

  useEffect(() => {
    if (ready && can("review.reports", "view")) {
      adminGetReportNotifySetting()
        .then((r) => setNotifyEnabled(r.notify_enabled))
        .catch(() => {});
    }
  }, [ready, can]);

  async function toggleNotify(next: boolean) {
    setNotifySaving(true);
    try {
      const r = await adminSetReportNotifySetting(next);
      setNotifyEnabled(r.notify_enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setNotifySaving(false);
    }
  }

  function openReview(r: ReportOut, action: "approved" | "rejected") {
    setReviewItem(r);
    setReviewAction(action);
    setComment("");
    setBanDays(7);
    setPenalty(r.report_type === "user" ? "warning" : "hide_content");
  }

  async function submitReview() {
    if (!reviewItem) return;
    setBusy(true);
    setError(null);
    try {
      await adminReviewReport(reviewItem.id, {
        status: reviewAction,
        admin_comment: comment.trim() || null,
        penalty: reviewAction === "approved" ? penalty : null,
        ban_days: reviewAction === "approved" && penalty === "ban_temp" ? banDays : null,
      });
      setReviewItem(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <div className="text-muted-foreground">{t("common.loading")}</div>;
  }
  if (!can("review.reports", "view")) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {t("admin.review.noAccess")}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const typeLabel = (tp: ReportType) => t(`report.types.${tp}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t("admin.reportAudit.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.reportAudit.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" />
          {t("common.refresh")}
        </Button>
      </div>

      {/* 通知开关 */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div>
            <p className="text-sm font-medium">{t("admin.reportAudit.notifyLabel")}</p>
            <p className="text-xs text-muted-foreground">{t("admin.reportAudit.notifyHint")}</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={notifyEnabled}
              disabled={!canManage || notifySaving}
              onChange={(e) => toggleNotify(e.target.checked)}
            />
            {notifyEnabled
              ? t("admin.reportAudit.notifyOn")
              : t("admin.reportAudit.notifyOff")}
          </label>
        </CardContent>
      </Card>

      {/* 筛选器 */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("admin.reportAudit.filterType")}</Label>
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v as ReportType | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.reportAudit.typeAll")}</SelectItem>
              <SelectItem value="user">{t("report.types.user")}</SelectItem>
              <SelectItem value="blog">{t("report.types.blog")}</SelectItem>
              <SelectItem value="post">{t("report.types.post")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("admin.reportAudit.filterStatus")}</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as ReportStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.reportAudit.statusAll")}</SelectItem>
              <SelectItem value="pending">{t("admin.reportAudit.statuses.pending")}</SelectItem>
              <SelectItem value="approved">{t("admin.reportAudit.statuses.approved")}</SelectItem>
              <SelectItem value="rejected">{t("admin.reportAudit.statuses.rejected")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("admin.reportAudit.startLabel")}</Label>
          <Input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setPage(1);
            }}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("admin.reportAudit.endLabel")}</Label>
          <Input
            type="date"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setPage(1);
            }}
            className="w-40"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setTypeFilter("all");
            setStatusFilter("pending");
            setStart("");
            setEnd("");
            setPage(1);
          }}
        >
          {t("admin.reportAudit.resetFilter")}
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {loading ? (
        <div className="text-muted-foreground">{t("common.loading")}</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("admin.reportAudit.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((r) => (
            <AdminListCard
              key={r.id}
              title={
                <span className="flex items-center gap-2 flex-wrap">
                  <StatusBadge tone="info">{typeLabel(r.report_type)}</StatusBadge>
                  <span className="text-sm">
                    {r.target_label || t("admin.reportAudit.noPreview")}
                  </span>
                </span>
              }
              badge={
                <StatusBadge tone={statusTone(r.status)}>
                  {t(`admin.reportAudit.statuses.${r.status}`)}
                </StatusBadge>
              }
              fields={[
                {
                  label: t("admin.reportAudit.colReporter"),
                  value:
                    r.reporter?.username ??
                    (r.reporter_ip
                      ? t("admin.reportAudit.anonymousIp", { ip: r.reporter_ip })
                      : t("admin.reportAudit.anonymous")),
                },
                {
                  label: t("admin.reportAudit.colTarget"),
                  value: r.target_username ? `@${r.target_username}` : `#${r.target_id}`,
                },
                {
                  label: t("admin.reportAudit.colCreatedAt"),
                  value: <FormattedUserActionTime utcIso={r.created_at} />,
                },
              ]}
              actions={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        setDetail(await adminGetReport(r.id));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : t("common.error"));
                      }
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    {t("admin.reportAudit.viewDetail")}
                  </Button>
                  {r.status === "pending" && canManage && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => openReview(r, "rejected")}
                      >
                        <X className="h-4 w-4 mr-1" />
                        {t("admin.reportAudit.reject")}
                      </Button>
                      <Button size="sm" disabled={busy} onClick={() => openReview(r, "approved")}>
                        <Check className="h-4 w-4 mr-1" />
                        {t("admin.reportAudit.approve")}
                      </Button>
                    </>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t("admin.reportAudit.total", { total })}
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

      {/* 详情弹窗：被举报原始内容 + 举报理由（举报人信息仅管理员可见） */}
      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.reportAudit.detailTitle")}</DialogTitle>
            <DialogDescription>{t("admin.reportAudit.detailHint")}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("admin.reportAudit.colType")}</p>
                <p>{typeLabel(detail.report_type)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.reportAudit.targetPreview")}
                </p>
                {detail.report_type === "user" && detail.target_username ? (
                  <Link
                    href={lp(`/u/${detail.target_username}`)}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {detail.target_label || `@${detail.target_username}`}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <p className="whitespace-pre-wrap text-foreground/90">
                    {detail.target_label || t("admin.reportAudit.noPreview")}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("admin.reportAudit.reasonLabel")}</p>
                <p className="whitespace-pre-wrap text-foreground/90">{detail.reason}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("admin.reportAudit.colReporter")}</p>
                <p>
                  {detail.reporter?.username ??
                    (detail.reporter_ip
                      ? t("admin.reportAudit.anonymousIp", { ip: detail.reporter_ip })
                      : t("admin.reportAudit.anonymous"))}
                </p>
              </div>
              {detail.admin_comment && (
                <div>
                  <p className="text-xs text-muted-foreground">{t("admin.reportAudit.adminComment")}</p>
                  <p className="whitespace-pre-wrap">{detail.admin_comment}</p>
                </div>
              )}
              {detail.penalty && (
                <div>
                  <p className="text-xs text-muted-foreground">{t("admin.reportAudit.penaltyLabel")}</p>
                  <p>{t(`admin.reportAudit.penalties.${detail.penalty}`)}</p>
                </div>
              )}
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setDetail(null)}>
                  {t("common.close")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 审核弹窗：驳回（备注）/ 通过（选择处罚动作） */}
      <Dialog open={reviewItem !== null} onOpenChange={(o) => !o && setReviewItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approved"
                ? t("admin.reportAudit.approveTitle")
                : t("admin.reportAudit.rejectTitle")}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === "approved"
                ? t("admin.reportAudit.approveHint")
                : t("admin.reportAudit.rejectHint")}
            </DialogDescription>
          </DialogHeader>
          {reviewItem && (
            <div className="space-y-4">
              {reviewAction === "approved" && (
                <>
                  <div className="space-y-2">
                    <Label>{t("admin.reportAudit.penaltyLabel")}</Label>
                    <Select
                      value={penalty}
                      onValueChange={(v) => setPenalty(v as ReportPenalty)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(reviewItem.report_type === "user"
                          ? USER_PENALTIES
                          : CONTENT_PENALTIES
                        ).map((p) => (
                          <SelectItem key={p} value={p}>
                            {t(`admin.reportAudit.penalties.${p}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {penalty === "ban_temp" && (
                    <div className="space-y-2">
                      <Label htmlFor="report-ban-days">{t("admin.reportAudit.banDaysLabel")}</Label>
                      <Input
                        id="report-ban-days"
                        type="number"
                        min={1}
                        max={30}
                        value={banDays}
                        onChange={(e) => setBanDays(Number(e.target.value))}
                        className="w-32"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("admin.reportAudit.banDaysHint")}
                      </p>
                    </div>
                  )}
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="report-admin-comment">{t("admin.reportAudit.adminComment")}</Label>
                <Textarea
                  id="report-admin-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder={t("admin.reportAudit.commentPlaceholder")}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReviewItem(null)} disabled={busy}>
                  {t("common.cancel")}
                </Button>
                <Button
                  variant={reviewAction === "approved" ? "default" : "destructive"}
                  onClick={submitReview}
                  disabled={busy}
                >
                  {reviewAction === "approved"
                    ? t("admin.reportAudit.approveConfirm")
                    : t("admin.reportAudit.rejectConfirm")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
