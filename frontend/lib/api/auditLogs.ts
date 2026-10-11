/**
 * AuditLogs API - 对应后端 app/api/audit.py
 *
 * 操作日志只读查询：分页 + action 前缀筛选 + 关键词搜索 + 日期/用户/目标筛选 + CSV 导出。
 */
import { apiFetch, secureFetch } from "./client";
import type { AuditLogInfo, Paginated } from "@/types/api";

export interface AuditLogFilters {
  action?: string;
  q?: string;
  user_id?: number;
  target?: string;
  date_from?: string;
  date_to?: string;
}

function buildQuery(params: AuditLogFilters & { page?: number; page_size?: number }): string {
  const qs = new URLSearchParams();
  if (params.action) qs.set("action", params.action);
  if (params.q) qs.set("q", params.q);
  if (params.user_id !== undefined) qs.set("user_id", String(params.user_id));
  if (params.target) qs.set("target", params.target);
  if (params.date_from) qs.set("date_from", params.date_from);
  if (params.date_to) qs.set("date_to", params.date_to);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  return qs.toString();
}

/** 管理：操作日志分页列表 */
export function adminListAuditLogs(
  params: AuditLogFilters & {
    page?: number;
    page_size?: number;
  } = {}
) {
  const query = buildQuery(params);
  return apiFetch<Paginated<AuditLogInfo>>(
    `/api/admin/audit-logs${query ? `?${query}` : ""}`
  );
}

/** 管理：操作日志 CSV 导出（与列表同一套筛选，上限 2000 行） */
export async function adminExportAuditLogs(params: AuditLogFilters = {}): Promise<Blob> {
  const query = buildQuery(params);
  const res = await secureFetch(`/api/admin/audit-logs/export${query ? `?${query}` : ""}`);
  if (!res.ok) {
    const { ApiError } = await import("./client");
    throw new ApiError(res.status, await res.text(), "导出失败");
  }
  return res.blob();
}
