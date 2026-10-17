/**
 * SchoolVerify API - 对应后端 app/api/school_verify.py（Module D-1）
 *
 * 学校身份人工验证：四态流转（未提交/审核中/已通过/已驳回）。
 * 与社团报名流程完全隔离：验证通过才开启 identity_school_verified。
 */
import { apiFetch } from "./client";
import type {
  Paginated,
  SchoolVerifyApplication,
  SchoolVerifyReviewRequest,
  SchoolVerifyStatusOut,
  SchoolVerifySubmit,
  MySchoolVerify,
} from "@/types/api";

/* ---------- 用户接口 ---------- */

/** 当前用户学校验证状态 + 全部申请历史（含驳回记录） */
export function getSchoolVerifyStatus() {
  return apiFetch<SchoolVerifyStatusOut>("/api/setting/school-verify");
}

/** 提交学校验证申请（审核中重复提交后端 409；驳回后可重新提交） */
export function submitSchoolVerify(payload: SchoolVerifySubmit) {
  return apiFetch<MySchoolVerify>("/api/setting/school-verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ---------- 管理接口（review.school 权限） ---------- */

/** 审核队列：状态过滤 + 用户名/学号/姓名搜索 */
export function adminListSchoolVerify(params: {
  status?: "pending" | "approved" | "rejected";
  q?: string;
  page?: number;
  page_size?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiFetch<{ total: number; items: SchoolVerifyApplication[] }>(
    `/api/admin/school-verify/list${query ? `?${query}` : ""}`
  );
}

/** 审核：通过（开启学校身份并写外键）/ 驳回（不改用户主表；备注必填） */
export function adminReviewSchoolVerify(applicationId: number, payload: SchoolVerifyReviewRequest) {
  return apiFetch<SchoolVerifyApplication>(
    `/api/admin/school-verify/${applicationId}/review`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}
