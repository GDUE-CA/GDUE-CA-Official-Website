/**
 * Reports API - 对应后端 app/api/reports.py（V0.6.1 需求5）
 *
 * - 公开：提交举报（匿名 / 登录均可）
 * - 管理：列表（筛选）、详情、审核（通过 / 驳回 + 处罚）、通知开关
 */
import { apiFetch } from "./client";
import type {
  ReportListOut,
  ReportOut,
  ReportPenalty,
  ReportType,
  ReportStatus,
} from "@/types/api";

/** 公开：提交举报（user 类型可用 target_username；blog/post 用 target_id） */
export function submitReport(payload: {
  report_type: ReportType;
  target_id?: number;
  target_username?: string;
  reason: string;
}) {
  return apiFetch<{ ok: boolean; id: number }>("/api/reports", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** 管理：举报列表（按类型 / 状态 / 时间区间筛选） */
export function adminListReports(params: {
  report_type?: ReportType;
  status?: ReportStatus;
  start?: string;
  end?: string;
  page?: number;
  per_page?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.report_type) qs.set("report_type", params.report_type);
  if (params.status) qs.set("status", params.status);
  if (params.start) qs.set("start", params.start);
  if (params.end) qs.set("end", params.end);
  if (params.page) qs.set("page", String(params.page));
  if (params.per_page) qs.set("per_page", String(params.per_page));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<ReportListOut>(`/api/admin/reports${suffix}`);
}

/** 管理：举报详情（含被举报原始内容预览） */
export function adminGetReport(id: number) {
  return apiFetch<ReportOut>(`/api/admin/reports/${id}`);
}

/** 管理：审核举报（通过 + 处罚 / 驳回） */
export function adminReviewReport(
  id: number,
  payload: {
    status: "approved" | "rejected";
    admin_comment?: string | null;
    penalty?: ReportPenalty | null;
    ban_days?: number | null;
  }
) {
  return apiFetch<{ ok: boolean; status: ReportStatus }>(
    `/api/admin/reports/${id}/review`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

/** 管理：读取举报通知开关 */
export function adminGetReportNotifySetting() {
  return apiFetch<{ notify_enabled: boolean }>("/api/admin/reports/notify-setting");
}

/** 管理：设置举报通知开关 */
export function adminSetReportNotifySetting(notify_enabled: boolean) {
  return apiFetch<{ notify_enabled: boolean }>("/api/admin/reports/notify-setting", {
    method: "PUT",
    body: JSON.stringify({ notify_enabled }),
  });
}
