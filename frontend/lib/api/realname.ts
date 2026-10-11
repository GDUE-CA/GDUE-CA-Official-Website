/**
 * Realname API - 对应后端 app/api/realname.py
 *
 * 实名验证：用户端状态查询 / 提交申请 / 凭证图片上传（≤5MB 仅 JPEG/PNG/WEBP）
 * + 管理端申请审核列表 / 通过 / 拒绝。
 */
import { apiFetch, secureFetch } from "./client";
import type {
  Paginated,
  RealnameRequest,
  RealnameStatus,
  RealnameStatusOut,
  RealnameSubmit,
} from "@/types/api";

/* ---------- 用户接口 ---------- */

/** 用户：当前账号实名状态 + 最近一次申请（含拒绝原因） */
export function getRealnameStatus() {
  return apiFetch<RealnameStatusOut>("/api/realname/status");
}

/** 用户：提交实名申请（待审核中重复提交后端 400） */
export function submitRealname(payload: RealnameSubmit) {
  return apiFetch<RealnameRequest>("/api/realname/submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** 用户：上传实名凭证图片（学生证 / 校园卡照片），返回可回填的 evidence_url */
export async function uploadRealnameEvidence(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  // 登录态走 HttpOnly Cookie；secureFetch 自动附加 CSRF 头
  const res = await secureFetch("/api/realname/evidence", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(
      (data as { detail?: string })?.detail ?? "凭证上传失败"
    );
  }
  const out = (await res.json()) as { url: string };
  return out.url;
}

/* ---------- 管理接口 ---------- */

/** 管理：实名申请分页列表（状态筛选 + 用户名/学号/姓名搜索） */
export function adminListRealnameRequests(
  params: {
    status?: RealnameStatus;
    q?: string;
    page?: number;
    page_size?: number;
  } = {}
) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiFetch<Paginated<RealnameRequest>>(
    `/api/admin/realname${query ? `?${query}` : ""}`
  );
}

/** 管理：通过申请（回写学号/真实姓名/手机号并标记账号已实名） */
export function adminApproveRealname(requestId: number) {
  return apiFetch<RealnameRequest>(
    `/api/admin/realname/${requestId}/approve`,
    { method: "POST" }
  );
}

/** 管理：拒绝申请（记录原因，用户可修改后重新提交） */
export function adminRejectRealname(requestId: number, note: string) {
  return apiFetch<RealnameRequest>(`/api/admin/realname/${requestId}/reject`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}
