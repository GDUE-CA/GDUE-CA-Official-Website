/**
 * Activity Admin API - 对应后端 app/api/activities.py admin_router
 *
 * 活动管理扩展：报名明细分页、finalize 统计、统计读取、导出 CSV/XLSX。
 */
import { apiFetch, secureFetch, ApiError } from "./client";
import type {
  Activity,
  ActivityStatistics,
  Paginated,
  Registration,
  RegistrationStatus,
} from "@/types/api";

/** 管理：活动报名明细（分页+筛选） */
export function adminListActivityRegistrations(
  activityId: number,
  params: {
    status_filter?: RegistrationStatus;
    q?: string;
    page?: number;
    page_size?: number;
  } = {}
) {
  const qs = new URLSearchParams();
  if (params.status_filter) qs.set("status_filter", params.status_filter);
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiFetch<Paginated<Registration>>(
    `/api/admin/activities/${activityId}/registrations${query ? `?${query}` : ""}`,
    { withAuth: true }
  );
}

/** 管理：finalize 已结束活动 → 生成/刷新统计快照 */
export function adminFinalizeActivity(activityId: number) {
  return apiFetch<ActivityStatistics>(
    `/api/admin/activities/${activityId}/finalize`,
    { method: "POST", withAuth: true }
  );
}

/** 管理：读取活动统计快照 */
export function adminGetActivityStatistics(activityId: number) {
  return apiFetch<ActivityStatistics>(
    `/api/admin/activities/${activityId}/statistics`,
    { withAuth: true }
  );
}

/** 管理：导出活动报名明细（Blob 下载） */
export async function adminExportActivityRegistrations(
  activityId: number,
  format: "csv" | "xlsx",
  status_filter?: RegistrationStatus
): Promise<Blob> {
  const qs = new URLSearchParams({ format });
  if (status_filter) qs.set("status_filter", status_filter);
  const res = await secureFetch(
    `/api/admin/activities/${activityId}/export?${qs.toString()}`
  );
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, detail, typeof detail === "string" ? detail : "导出失败");
  }
  return res.blob();
}

/** 重新导出 Activity 类型方便使用 */
export type { Activity };
