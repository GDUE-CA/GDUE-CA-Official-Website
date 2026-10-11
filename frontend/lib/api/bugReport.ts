/**
 * Bug Report API - 对应后端 app/api/bug_report.py
 *
 * Bug 反馈的提交、列表、状态切换。
 */
import { apiFetch } from "./client";
import type { BugReport, BugReportCreate, SubmitReceipt } from "@/types/api";

export function submitBugReport(payload: BugReportCreate) {
  return apiFetch<SubmitReceipt>("/api/bugs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listBugReports(params?: { resolved?: boolean; keyword?: string; page?: number; per_page?: number }) {
  const qs = new URLSearchParams();
  if (params?.resolved !== undefined) qs.set("resolved", String(params.resolved));
  if (params?.keyword) qs.set("keyword", params.keyword);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const query = qs.toString();
  return apiFetch<BugReport[]>(`/api/bugs${query ? `?${query}` : ""}`, {
    withAuth: true,
  });
}

/** 后端 PATCH 用 Query 参数 resolved=true/false */
export function setBugResolved(id: number, resolved: boolean) {
  return apiFetch<{ ok: boolean }>(
    `/api/bugs/${id}?resolved=${String(resolved)}`,
    {
      method: "PATCH",
      withAuth: true,
    }
  );
}

/** 批量标记已解决 / 重新打开 */
export function batchUpdateBugs(ids: number[], resolved: boolean) {
  return apiFetch<{ updated: number }>("/api/bugs/batch", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify({ ids, resolved }),
  });
}
