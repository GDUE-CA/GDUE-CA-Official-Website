/**
 * Recruitment API - 对应后端 app/api/recruitment.py
 *
 * 招新信息 CMS + 社团报名数据查询/导出（复用 Registration, registration_type=CLUB）。
 */
import { apiFetch, secureFetch, ApiError } from "./client";
import type {
  Paginated,
  RecruitmentInfo,
  RecruitmentInfoCreate,
  RecruitmentInfoUpdate,
  Registration,
  RegistrationStatus,
} from "@/types/api";

/** 公开：当前生效中的招新信息 */
export function listPublicRecruitment() {
  return apiFetch<RecruitmentInfo[]>(`/api/recruitment`);
}

/** 管理：招新信息分页列表 */
export function adminListRecruitmentInfos(params: {
  enabled?: boolean;
  q?: string;
  page?: number;
  page_size?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.enabled !== undefined) qs.set("enabled", String(params.enabled));
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiFetch<Paginated<RecruitmentInfo>>(
    `/api/admin/recruitment/infos${query ? `?${query}` : ""}`,
    { withAuth: true }
  );
}

export function adminGetRecruitmentInfo(id: number) {
  return apiFetch<RecruitmentInfo>(`/api/admin/recruitment/infos/${id}`, { withAuth: true });
}

export function adminCreateRecruitmentInfo(payload: RecruitmentInfoCreate) {
  return apiFetch<RecruitmentInfo>("/api/admin/recruitment/infos", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminUpdateRecruitmentInfo(id: number, payload: RecruitmentInfoUpdate) {
  return apiFetch<RecruitmentInfo>(`/api/admin/recruitment/infos/${id}`, {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function adminDeleteRecruitmentInfo(id: number) {
  return apiFetch<void>(`/api/admin/recruitment/infos/${id}`, {
    method: "DELETE",
    withAuth: true,
  });
}

/** 管理：社团报名数据列表 */
export function adminListClubRegistrations(params: {
  status_filter?: RegistrationStatus;
  position?: string;
  q?: string;
  page?: number;
  page_size?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.status_filter) qs.set("status_filter", params.status_filter);
  if (params.position) qs.set("position", params.position);
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiFetch<Paginated<Registration>>(
    `/api/admin/recruitment/registrations${query ? `?${query}` : ""}`,
    { withAuth: true }
  );
}

/** 管理：社团报名数据导出（Blob 下载） */
export async function adminExportClubRegistrations(
  format: "csv" | "xlsx",
  params: {
    status_filter?: RegistrationStatus;
    position?: string;
    q?: string;
  } = {}
): Promise<Blob> {
  const qs = new URLSearchParams();
  qs.set("format", format);
  if (params.status_filter) qs.set("status_filter", params.status_filter);
  if (params.position) qs.set("position", params.position);
  if (params.q) qs.set("q", params.q);
  const res = await secureFetch(`/api/admin/recruitment/registrations/export?${qs.toString()}`);
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, detail, typeof detail === "string" ? detail : "导出失败");
  }
  return res.blob();
}
