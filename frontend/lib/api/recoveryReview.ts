/**
 * Recovery Review Admin API - 对应后端 app/api/recovery_review.py（管理端部分）
 *
 * 忘记密码·人工审核找回账号工单（/api/auth/password-recovery-reviews）：
 * 列表身份证仅脱敏展示；通过动作 = 发一次性恢复码到联系邮箱 / 将联系邮箱绑定为账号新邮箱；
 * 驳回需填理由，结果邮件通知用户。
 */
import { apiFetch } from "./client";
import type { ManualReviewApprovePayload, ManualReviewItem } from "@/types/api";

/** 工单列表（可按状态 / 双表单类型筛选；含 legacy 工单） */
export function listRecoveryReviews(params?: { status_filter?: string; kind?: string }) {
  const sp = new URLSearchParams();
  if (params?.status_filter) sp.set("status_filter", params.status_filter);
  if (params?.kind) sp.set("kind", params.kind);
  const qs = sp.toString();
  return apiFetch<ManualReviewItem[]>(
    `/api/auth/password-recovery-reviews${qs ? `?${qs}` : ""}`,
    { withAuth: true }
  );
}

/** 审核通过：按动作执行（发恢复码 / 绑定联系邮箱），结果邮件通知联系邮箱 */
export function approveRecoveryReview(id: number, payload: ManualReviewApprovePayload) {
  return apiFetch<{ ok: boolean; message?: string }>(
    `/api/auth/password-recovery-reviews/${id}/approve`,
    { method: "POST", withAuth: true, body: JSON.stringify(payload) }
  );
}

/** 审核驳回：理由必填，邮件通知用户 */
export function rejectRecoveryReview(id: number, reason: string) {
  return apiFetch<{ ok: boolean; message?: string }>(
    `/api/auth/password-recovery-reviews/${id}/reject`,
    { method: "POST", withAuth: true, body: JSON.stringify({ reason }) }
  );
}
