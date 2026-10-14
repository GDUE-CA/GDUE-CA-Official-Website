"use client";

/**
 * /admin/email-change-requests - 【人工账号申请】更改绑定邮箱申请列表
 *
 * 仅 review.emails 权限可见（super_admin/admin view+manage）。
 * - 同意：仅打一次性豁免标记（绝不直接替用户改邮箱），最终换绑由用户本人在设置页确认提交
 * - 驳回：理由必填非空；用户端展示理由并解除自助禁用
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Mail, X } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  approveEmailChangeRequest,
  listEmailChangeRequests,
  rejectEmailChangeRequest,
} from "@/lib/api/emailChange";
import { StatusBadge } from "@/components/admin/review/StatusBadge";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import { useEffectivePermissions } from "@/lib/permissions";
import type { EmailChangeRequestRow, EmailChangeStatus } from "@/types/api";

type RejectTarget = { id: number; username: string } | null;
type ApproveTarget = { id: number; username: string; new_email: string } | null;

function statusTone(s: EmailChangeStatus) {
  if (s === "pending") return "warning" as const;
  if (s === "approved") return "success" as const;
  return "danger" as const;
}

export default function EmailChangeRequestsPage() {
  const { t } = useI18n();
  const { ready, can } = useEffectivePermissions();
  const [items, setItems] = useState<EmailChangeRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [approveTarget, setApproveTarget] = useState<ApproveTarget>(null);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listEmailChangeRequests(filter === "pending" ? "pending" : undefined);
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function doApprove() {
    if (!approveTarget) return;
    setDialogBusy(true);
    setDialogError(null);
    try {
      await approveEmailChangeRequest(approveTarget.id);
      setApproveTarget(null);
      await load();
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : String(e));
    } finally {
      setDialogBusy(false);
    }
  }

  async function doReject() {
    if (!rejectTarget) return;
    setDialogBusy(true);
    setDialogError(null);
    try {
      await rejectEmailChangeRequest(rejectTarget.id, rejectReason.trim());
      setRejectTarget(null);
      setRejectReason("");
      await load();
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : String(e));
    } finally {
      setDialogBusy(false);
    }
  }

  if (!ready) {
    return <div className="text-muted-foreground">{t("common.loading")}</div>;
  }

  if (!can("review.emails", "view")) {
    return (
      <div className="py-12 text-center text-muted-foreground">{t("admin.review.noAccess")}</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{t("admin.emailChange.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.emailChange.desc")}</p>
        </div>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "pending" | "all")}
        >
          <option value="pending">{t("admin.emailChange.filterPending")}</option>
          <option value="all">{t("admin.emailChange.filterAll")}</option>
        </select>
      </div>

      {actionError && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{actionError}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("admin.emailChange.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{item.username}</span>
                    <span className="text-xs text-muted-foreground">UID {item.user_id}</span>
                  </div>
                  <StatusBadge tone={statusTone(item.status)}>
                    {t(`admin.emailChange.statuses.${item.status}`)}
                  </StatusBadge>
                </div>

                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">{t("admin.emailChange.colOldEmail")}：</span>
                    <span className="font-medium break-all">{item.old_email}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("admin.emailChange.colNewEmail")}：</span>
                    <span className="font-medium break-all">{item.new_email}</span>
                  </div>
                </div>

                {item.remark && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">{t("admin.emailChange.colRemark")}：</span>
                    <span className="whitespace-pre-line break-words">{item.remark}</span>
                  </div>
                )}

                <div className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    {t("admin.emailChange.colCreatedAt")}：
                    <FormattedUserActionTime utcIso={item.created_at} />
                  </div>
                  <div>
                    {t("admin.emailChange.colIp")}：{item.submit_ip ?? "-"}
                  </div>
                  <div className="sm:col-span-2 break-all">
                    {t("admin.emailChange.colFingerprint")}：
                    <span className="font-mono">{item.fingerprint ?? "-"}</span>
                  </div>
                </div>

                {item.status === "pending" ? (
                  <div className="flex gap-2 border-t border-border pt-3">
                    <Button
                      size="sm"
                      disabled={busyId === item.id}
                      onClick={() => {
                        setDialogError(null);
                        setApproveTarget({ id: item.id, username: item.username, new_email: item.new_email });
                      }}
                    >
                      <Check className="h-4 w-4" />
                      {t("admin.emailChange.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === item.id}
                      onClick={() => {
                        setDialogError(null);
                        setRejectReason("");
                        setRejectTarget({ id: item.id, username: item.username });
                      }}
                    >
                      <X className="h-4 w-4" />
                      {t("admin.emailChange.reject")}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                    <div>
                      {t("admin.emailChange.reviewedAt")}：
                      {item.reviewed_at ? (
                        <FormattedUserActionTime utcIso={item.reviewed_at} />
                      ) : (
                        "-"
                      )}
                      {item.reviewed_by != null && ` · UID ${item.reviewed_by}`}
                    </div>
                    {item.status === "rejected" && item.reject_reason && (
                      <div className="break-words">
                        {t("admin.emailChange.rejectReason")}：
                        <span className="text-destructive">{item.reject_reason}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 同意确认弹窗：明示同意 ≠ 替用户改邮箱，仅打一次性豁免标记 */}
      <Dialog open={!!approveTarget} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.emailChange.approveConfirm.title")}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {approveTarget &&
                t("admin.emailChange.approveConfirm.body", {
                  name: approveTarget.username,
                  email: approveTarget.new_email,
                })}
            </DialogDescription>
          </DialogHeader>
          {dialogError && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{dialogError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)} disabled={dialogBusy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={doApprove} disabled={dialogBusy}>
              {dialogBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("admin.emailChange.approve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 驳回弹窗：理由必填非空（空串禁用提交按钮） */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.emailChange.rejectConfirm.title")}</DialogTitle>
            <DialogDescription>
              {rejectTarget &&
                t("admin.emailChange.rejectConfirm.body", { name: rejectTarget.username })}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t("admin.emailChange.rejectReasonPlaceholder")}
            rows={3}
            maxLength={1000}
          />
          {dialogError && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{dialogError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={dialogBusy}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={doReject}
              disabled={dialogBusy || !rejectReason.trim()}
            >
              {dialogBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("admin.emailChange.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
