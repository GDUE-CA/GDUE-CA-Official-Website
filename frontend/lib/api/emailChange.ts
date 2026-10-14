/**
 * Email Change API - 对应后端 app/api/email_change.py
 *
 * 更换绑定邮箱三条路径 + 后台人工审核：
 * - 路径A（旧邮箱可用）：send-codes 两码同发 + confirm（旧码/新码/当前密码）
 * - 路径B（旧邮箱失效）：四项核验 → 新邮箱验证码 → confirm
 * - 路径C（人工申请）：manual-request → 后台 approve/reject → exempt 豁免换绑
 */
import { apiFetch } from "./client";
import { getFingerprint, FINGERPRINT_HEADER } from "@/lib/fingerprint";
import type {
  EmailChangeExemptConfirmPayload,
  EmailChangeLostOldConfirmPayload,
  EmailChangeLostOldVerifyPayload,
  EmailChangeManualRequestPayload,
  EmailChangeNormalConfirmPayload,
  EmailChangeOpResult,
  EmailChangeRequestRow,
  EmailChangeSendCodesPayload,
  EmailChangeStatus,
  EmailChangeStatusOut,
} from "@/types/api";

/** 全部写操作附加浏览器指纹（审计必填字段） */
async function fpHeaders(): Promise<Record<string, string>> {
  const fp = await getFingerprint().catch(() => "err:00000000");
  return { [FINGERPRINT_HEADER]: fp };
}

/* ---------- 用户端 ---------- */

/** 换绑板块状态（含 pending 申请 / 最近驳回 / 豁免标记） */
export function fetchEmailChangeStatus(): Promise<EmailChangeStatusOut> {
  return apiFetch<EmailChangeStatusOut>("/api/auth/email-change/status", {
    withAuth: true,
  });
}

/** 路径A 第一步：向旧邮箱 + 新邮箱各发一份验证码 */
export async function sendEmailChangeCodes(
  payload: EmailChangeSendCodesPayload
): Promise<EmailChangeOpResult> {
  return apiFetch<EmailChangeOpResult>("/api/auth/email-change/normal/send-codes", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
    headers: await fpHeaders(),
  });
}

/** 路径A 第二步：旧码 + 新码 + 当前密码三项全过才换绑（不强制下线） */
export async function confirmEmailChangeNormal(
  payload: EmailChangeNormalConfirmPayload
): Promise<EmailChangeOpResult> {
  return apiFetch<EmailChangeOpResult>("/api/auth/email-change/normal/confirm", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
    headers: await fpHeaders(),
  });
}

/** 路径B 第一步：四项身份核验（全部匹配才通过，任一错统一模糊拒绝） */
export async function verifyLostOldIdentity(
  payload: EmailChangeLostOldVerifyPayload
): Promise<EmailChangeOpResult> {
  return apiFetch<EmailChangeOpResult>("/api/auth/email-change/lost-old/verify", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
    headers: await fpHeaders(),
  });
}

/** 路径B 第二步：核验通过后仅向新邮箱发码 */
export async function sendLostOldCode(
  payload: { new_email: string }
): Promise<EmailChangeOpResult> {
  return apiFetch<EmailChangeOpResult>("/api/auth/email-change/lost-old/send-code", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
    headers: await fpHeaders(),
  });
}

/** 路径B 第三步：新邮箱验证码确认换绑 */
export async function confirmLostOld(
  payload: EmailChangeLostOldConfirmPayload
): Promise<EmailChangeOpResult> {
  return apiFetch<EmailChangeOpResult>("/api/auth/email-change/lost-old/confirm", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
    headers: await fpHeaders(),
  });
}

/** 路径C：提交更改绑定邮箱人工申请（pending 期间自助入口全部禁用） */
export async function submitEmailChangeManualRequest(
  payload: EmailChangeManualRequestPayload
): Promise<EmailChangeOpResult> {
  return apiFetch<EmailChangeOpResult>("/api/auth/email-change/manual-request", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
    headers: await fpHeaders(),
  });
}

/** 人工审核豁免模式：跳过全部身份校验，一次性标记换绑（成功即清除标记） */
export async function confirmExemptEmailChange(
  payload: EmailChangeExemptConfirmPayload
): Promise<EmailChangeOpResult> {
  return apiFetch<EmailChangeOpResult>("/api/auth/email-change/exempt/confirm", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
    headers: await fpHeaders(),
  });
}

/* ---------- 后台审核（review.emails 权限） ---------- */

/** 人工申请列表（?status= 可选筛选） */
export function listEmailChangeRequests(
  status?: EmailChangeStatus
): Promise<EmailChangeRequestRow[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<EmailChangeRequestRow[]>(
    `/api/auth/email-change/requests${qs}`,
    { withAuth: true }
  );
}

/** 同意申请：仅打一次性豁免标记，最终换绑由用户本人确认提交 */
export async function approveEmailChangeRequest(requestId: number): Promise<EmailChangeOpResult> {
  return apiFetch<EmailChangeOpResult>(
    `/api/auth/email-change/requests/${requestId}/approve`,
    { method: "POST", withAuth: true, headers: await fpHeaders() }
  );
}

/** 驳回申请：理由必填非空 */
export async function rejectEmailChangeRequest(
  requestId: number,
  reason: string
): Promise<EmailChangeOpResult> {
  return apiFetch<EmailChangeOpResult>(
    `/api/auth/email-change/requests/${requestId}/reject`,
    {
      method: "POST",
      withAuth: true,
      body: JSON.stringify({ reason }),
      headers: await fpHeaders(),
    }
  );
}
