/**
 * 审核中心 - 找回账号人工审核 Tab（V0.5.8 §5.4）
 *
 * 展示忘记密码·人工审核工单（校内账号 / 社会外部账号双表单）：
 * 身份证仅脱敏展示（后端已 mask）；旧密码仅展示瞬时哈希比对结果（明文绝不入库）；
 * 通过动作 = 发一次性恢复码到联系邮箱 / 将联系邮箱绑定为账号新邮箱（结果邮件通知）；
 * 驳回需填理由（邮件通知用户）；未匹配到账号的工单不可通过。
 */
"use client";

import { useEffect, useState } from "react";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Check from "@/assets/icons/action/check.svg";
import X from "@/assets/icons/action/x.svg";
import Mail from "@/assets/icons/status/mail.svg";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminListCard, type AdminListCardField } from "../shared/AdminListCard";
import { StatusBadge } from "./StatusBadge";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import { useEffectivePermissions } from "@/lib/permissions";
import {
  listRecoveryReviews,
  approveRecoveryReview,
  rejectRecoveryReview,
} from "@/lib/api/recoveryReview";
import type { ManualReviewItem, ManualReviewApprovePayload } from "@/types/api";

export function RecoveryReviewsTab() {
  const { t } = useI18n();
  const { can } = useEffectivePermissions();
  const canManage = can("review.resets", "manage");

  const [items, setItems] = useState<ManualReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const [approving, setApproving] = useState<ManualReviewItem | null>(null);
  const [approveAction, setApproveAction] =
    useState<ManualReviewApprovePayload["action"]>("send_recovery_code");
  const [approveNote, setApproveNote] = useState("");
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveLoading, setApproveLoading] = useState(false);

  const [rejecting, setRejecting] = useState<ManualReviewItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await listRecoveryReviews(
        filter === "pending" ? { status_filter: "pending" } : undefined
      );
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  function statusTone(s: string) {
    if (s === "pending") return "warning" as const;
    if (s === "handled") return "success" as const;
    return "danger" as const;
  }

  function openApprove(item: ManualReviewItem) {
    setApproving(item);
    setApproveAction("send_recovery_code");
    setApproveNote("");
    setApproveError(null);
  }

  function openReject(item: ManualReviewItem) {
    setRejecting(item);
    setRejectReason("");
    setRejectError(null);
  }

  async function handleApprove() {
    if (!approving) return;
    setApproveLoading(true);
    setApproveError(null);
    try {
      await approveRecoveryReview(approving.id, {
        action: approveAction,
        admin_note: approveNote.trim() || undefined,
      });
      setApproving(null);
      await load();
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setApproveLoading(false);
    }
  }

  async function handleReject() {
    if (!rejecting) return;
    if (!rejectReason.trim()) {
      setRejectError(t("admin.recoveryReviews.rejectReasonRequired"));
      return;
    }
    setRejectLoading(true);
    setRejectError(null);
    try {
      await rejectRecoveryReview(rejecting.id, rejectReason.trim());
      setRejecting(null);
      await load();
    } catch (e) {
      setRejectError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setRejectLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "pending" | "all")}
        >
          <option value="pending">{t("admin.recoveryReviews.filterPending")}</option>
          <option value="all">{t("admin.recoveryReviews.filterAll")}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("admin.recoveryReviews.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <AdminListCard
              key={item.id}
              title={
                <span className="inline-flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{item.contact_email}</span>
                </span>
              }
              meta={
                <>
                  <StatusBadge tone={item.kind === "school" ? "info" : "neutral"}>
                    {t(`admin.recoveryReviews.kind.${item.kind}`)}
                  </StatusBadge>
                  {item.old_password_matched !== null && (
                    <StatusBadge tone={item.old_password_matched ? "success" : "neutral"}>
                      {t("admin.recoveryReviews.colOldPassword")}：
                      {item.old_password_matched
                        ? t("admin.recoveryReviews.oldPasswordMatched")
                        : t("admin.recoveryReviews.oldPasswordNotMatched")}
                    </StatusBadge>
                  )}
                </>
              }
              badge={
                <StatusBadge tone={statusTone(item.status)}>
                  {t(`admin.recoveryReviews.statuses.${item.status}`)}
                </StatusBadge>
              }
              contentClassName="space-y-3"
              actions={
                item.status === "pending" && canManage ? (
                  <>
                    <Button
                      size="sm"
                      disabled={!item.matched_user_id}
                      title={
                        !item.matched_user_id
                          ? t("admin.recoveryReviews.noMatch")
                          : undefined
                      }
                      onClick={() => openApprove(item)}
                    >
                      <Check className="h-4 w-4" />
                      {t("admin.recoveryReviews.approve")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openReject(item)}>
                      <X className="h-4 w-4" />
                      {t("admin.recoveryReviews.reject")}
                    </Button>
                  </>
                ) : undefined
              }
              fields={(
                [
                item.real_name
                  ? { label: t("admin.recoveryReviews.colRealName"), value: item.real_name }
                  : null,
                item.student_id
                  ? {
                      label: t("admin.recoveryReviews.colStudentId"),
                      value: item.student_id,
                      mono: true,
                    }
                  : null,
                item.id_card_masked
                  ? {
                      label: t("admin.recoveryReviews.colIdCard"),
                      value: item.id_card_masked,
                      mono: true,
                    }
                  : null,
                item.college
                  ? { label: t("admin.recoveryReviews.colCollege"), value: item.college }
                  : null,
                item.major
                  ? { label: t("admin.recoveryReviews.colMajor"), value: item.major }
                  : null,
                item.class_name
                  ? { label: t("admin.recoveryReviews.colClassName"), value: item.class_name }
                  : null,
                item.username_hint
                  ? {
                      label: t("admin.recoveryReviews.colUsernameHint"),
                      value: item.username_hint,
                    }
                  : null,
                {
                  label: t("admin.recoveryReviews.colMatchedUser"),
                  value: item.matched_username ?? (
                    <span className="text-muted-foreground">
                      {t("admin.recoveryReviews.noMatch")}
                    </span>
                  ),
                  mono: !!item.matched_username,
                },
                item.register_time_hint
                  ? {
                      label: t("admin.recoveryReviews.colRegisterTime"),
                      value: item.register_time_hint,
                    }
                  : null,
                item.submit_ip
                  ? {
                      label: t("admin.recoveryReviews.colSubmitIp"),
                      value: item.submit_ip,
                      mono: true,
                    }
                  : null,
                {
                  label: t("admin.recoveryReviews.colCreatedAt"),
                  value: <FormattedUserActionTime utcIso={item.created_at} />,
                },
                item.status !== "pending" && item.handled_action
                  ? {
                      label: t("admin.recoveryReviews.handledActionLabel"),
                      value: t(`admin.recoveryReviews.handledAction.${item.handled_action}`),
                    }
                  : null,
                item.status !== "pending" && item.handled_at
                  ? {
                      label: t("admin.recoveryReviews.handledAt"),
                      value: <FormattedUserActionTime utcIso={item.handled_at} />,
                    }
                  : null,
                item.status !== "pending" && item.admin_note
                  ? { label: t("admin.recoveryReviews.adminNote"), value: item.admin_note }
                  : null,
                ] as (AdminListCardField | null)[]
              ).filter((f): f is AdminListCardField => f !== null)}
            />
          ))}
        </div>
      )}

      {/* 通过审核弹窗：选择执行动作 */}
      <Dialog open={!!approving} onOpenChange={(open) => !open && setApproving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.recoveryReviews.approveTitle")}</DialogTitle>
            <DialogDescription>{t("admin.recoveryReviews.approveDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="approve-action"
                  className="mt-0.5 accent-primary"
                  checked={approveAction === "send_recovery_code"}
                  onChange={() => setApproveAction("send_recovery_code")}
                />
                {t("admin.recoveryReviews.approveActionCode")}
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="approve-action"
                  className="mt-0.5 accent-primary"
                  checked={approveAction === "bind_contact_email"}
                  onChange={() => setApproveAction("bind_contact_email")}
                />
                {t("admin.recoveryReviews.approveActionBind")}
              </label>
            </div>
            <Textarea
              placeholder={t("admin.recoveryReviews.approveNotePlaceholder")}
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              rows={2}
            />
            {approveError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {approveError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setApproving(null)}>
                {t("common.cancel")}
              </Button>
              <Button disabled={approveLoading} onClick={handleApprove}>
                {approveLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("admin.recoveryReviews.approveConfirm")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 驳回弹窗：理由必填 */}
      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.recoveryReviews.rejectTitle")}</DialogTitle>
            <DialogDescription>{t("admin.recoveryReviews.rejectDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder={t("admin.recoveryReviews.rejectReasonPlaceholder")}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
            {rejectError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {rejectError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={rejectLoading}
                onClick={handleReject}
              >
                {rejectLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("admin.recoveryReviews.rejectConfirm")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
