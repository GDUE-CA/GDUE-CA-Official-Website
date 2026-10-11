"use client";

/**
 * 实名申请审核管理（/admin/realname-review）
 * 待审/全部筛选 + 搜索 + 分页 + 凭证图预览 + 通过/拒绝（拒绝需填原因）。
 * 对应后端 /api/admin/realname*。
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, Search, X } from "lucide-react";
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
  adminApproveRealname,
  adminListRealnameRequests,
  adminRejectRealname,
} from "@/lib/api/realname";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import type { RealnameRequest, RealnameStatus } from "@/types/api";

const STATUS_FILTERS: (RealnameStatus | "all")[] = ["pending", "approved", "rejected", "all"];
const PAGE_SIZE = 20;

/** 状态徽章 */
function StatusBadge({ status }: { status: RealnameStatus }) {
  const { t } = useI18n();
  const map: Record<RealnameStatus, { variant: "default" | "secondary" | "destructive"; label: string }> = {
    pending: { variant: "secondary", label: t("realname.statusPending") },
    approved: { variant: "default", label: t("realname.statusApproved") },
    rejected: { variant: "destructive", label: t("realname.statusRejected") },
  };
  const s = map[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function RealnameReviewManager() {
  const { t } = useI18n();
  const [items, setItems] = useState<RealnameRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<RealnameStatus | "all">("pending");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 拒绝弹窗
  const [rejectTarget, setRejectTarget] = useState<RealnameRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListRealnameRequests({
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

  async function handleApprove(r: RealnameRequest) {
    if (!window.confirm(t("admin.realname.approveConfirm", { name: r.real_name }))) return;
    setBusyId(r.id);
    setError(null);
    try {
      await adminApproveRealname(r.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget || !rejectNote.trim()) return;
    setBusyId(rejectTarget.id);
    setError(null);
    try {
      await adminRejectRealname(rejectTarget.id, rejectNote.trim());
      setRejectTarget(null);
      setRejectNote("");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("admin.realname.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.realname.subtitle")}</p>
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
              {t(`admin.realname.filter.${s}`)}
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
            placeholder={t("admin.realname.searchPlaceholder")}
            className="pl-8"
          />
        </div>
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
            {t("admin.realname.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.real_name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{r.student_id}</span>
                      <StatusBadge status={r.status} />
                      {r.username && (
                        <span className="text-xs text-muted-foreground">@{r.username}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("admin.realname.phone")}：{r.phone}
                      {" · "}
                      {t("realname.submittedAt")}：
                      <FormattedUserActionTime utcIso={r.submitted_at} />
                    </p>
                    {r.status === "rejected" && r.note && (
                      <p className="text-xs text-destructive">
                        {t("realname.rejectReason")}：{r.note}
                      </p>
                    )}
                    {r.evidence_url && (
                      <a
                        href={r.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-1"
                      >
                        {/* 凭证缩略图：点击原图新窗查看（学生证/校园卡） */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.evidence_url}
                          alt={t("admin.realname.evidence")}
                          className="h-20 rounded-md border object-cover hover:opacity-80 transition-opacity"
                        />
                      </a>
                    )}
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        disabled={busyId === r.id}
                        onClick={() => handleApprove(r)}
                      >
                        <Check className="h-4 w-4" />
                        {t("admin.realname.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.id}
                        onClick={() => {
                          setRejectTarget(r);
                          setRejectNote("");
                        }}
                      >
                        <X className="h-4 w-4 text-destructive" />
                        {t("admin.realname.reject")}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("common.nextPage")}
          </Button>
        </div>
      )}

      {/* 拒绝弹窗 */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.realname.rejectTitle")}</DialogTitle>
            <DialogDescription>{t("admin.realname.rejectHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reject-note">{t("realname.rejectReason")}</Label>
              <Textarea
                id="reject-note"
                rows={3}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                maxLength={500}
              />
            </div>
            <Button
              className="w-full"
              variant="destructive"
              onClick={handleReject}
              disabled={busyId !== null || !rejectNote.trim()}
            >
              {busyId !== null && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("admin.realname.reject")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
