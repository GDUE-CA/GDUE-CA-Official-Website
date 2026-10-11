/**
 * Registration API - 对应后端 app/api/register.py
 *
 * 活动报名与社团报名的提交、列表、状态更新、导出。
 */
import { apiFetch, API_BASE_URL } from "./client";
import type {
  SubmitReceipt,
  Registration,
  RegistrationCreate,
  ManualRegistrationCreate,
  RegistrationStatus,
  RegistrationType,
} from "@/types/api";

/** 活动报名：POST /api/registrations/for/{activityId} */
export function submitRegistration(activityId: number, payload: RegistrationCreate) {
  return apiFetch<SubmitReceipt>(`/api/registrations/for/${activityId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** 社团报名（意向部门入会）：POST /api/registrations/club */
export function submitClubRegistration(payload: RegistrationCreate) {
  return apiFetch<SubmitReceipt>("/api/registrations/club", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listRegistrations(params?: {
  activity_id?: number;
  status?: RegistrationStatus;
  registration_type?: RegistrationType;
  page?: number;
  per_page?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.activity_id) qs.set("activity_id", String(params.activity_id));
  if (params?.status) qs.set("status", params.status);
  if (params?.registration_type) qs.set("registration_type", params.registration_type);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const query = qs.toString();
  return apiFetch<Registration[]>(
    `/api/registrations${query ? `?${query}` : ""}`,
    { withAuth: true }
  );
}

/** 后端 PATCH 用 Query 参数传递 status/remark，不是 body */
export function setRegistrationStatus(
  id: number,
  status: RegistrationStatus,
  remark?: string
) {
  const qs = new URLSearchParams();
  qs.set("status", status);
  if (remark !== undefined) qs.set("remark", remark);
  return apiFetch<Registration>(`/api/registrations/${id}?${qs.toString()}`, {
    method: "PATCH",
    withAuth: true,
  });
}

/** 管理员手动补录报名：不校验报名时间窗与人数上限，status 默认 approved */
export function createManualRegistration(payload: ManualRegistrationCreate) {
  return apiFetch<Registration>("/api/registrations/admin/manual", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** 批量审核（仅 通过 / 拒绝）：返回 { updated, skipped }，已签到记录会被跳过 */
export function batchSetRegistrationStatus(
  ids: number[],
  status: "approved" | "rejected"
) {
  return apiFetch<{ updated: number; skipped: number[] }>(
    "/api/registrations/batch",
    {
      method: "POST",
      withAuth: true,
      body: JSON.stringify({ ids, status }),
    }
  );
}

/** 触发文件下载：浏览器直接打开导出 URL（登录态 Cookie 自动携带，URL 中不含任何凭据） */
export function exportRegistrationsUrl(params: {
  activityId?: number;
  registrationType?: RegistrationType;
  fmt: "csv" | "xlsx";
}) {
  const qs = new URLSearchParams();
  if (params.activityId) qs.set("activity_id", String(params.activityId));
  if (params.registrationType) qs.set("registration_type", params.registrationType);
  qs.set("fmt", params.fmt);
  return `${API_BASE_URL}/api/registrations/export?${qs.toString()}`;
}
