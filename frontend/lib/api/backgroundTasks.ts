/**
 * Background Tasks API - 对应后端 app/api/background_tasks.py + app/api/db_maintenance.py
 *
 * 后台异步任务（当前为数据库全量导出）：
 * - submitDbExport：提交导出，HTTP 立刻返回 task_id，不阻塞；
 * - getBackgroundTask：单任务轮询（任务进入 success/failed 后调用方停止轮询）；
 * - listBackgroundTasks：通知中心 / 悬浮弹窗数据源（默认不含已手动关闭）；
 * - dismissBackgroundTask：用户手动关闭任务通知（任务记录仍保留，永不自动清除）。
 */
import { apiFetch } from "./client";
import type {
  BackgroundTask,
  BackgroundTaskListResponse,
  BackgroundTaskSubmitResponse,
} from "@/types/api";

/** 提交一次完整数据库导出（后台异步执行），立刻返回 task_id */
export function submitDbExport() {
  return apiFetch<BackgroundTaskSubmitResponse>("/api/admin/db/export", {
    method: "POST",
    withAuth: true,
  });
}

/** 单任务完整信息（800ms 轮询；success/failed 后停止） */
export function getBackgroundTask(taskId: string) {
  return apiFetch<BackgroundTask>(`/api/admin/background-task/${taskId}`, {
    withAuth: true,
  });
}

/** 任务列表（新的在前）；默认仅返回尚未手动关闭的任务 */
export function listBackgroundTasks(options?: {
  includeDismissed?: boolean;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (options?.includeDismissed) params.set("include_dismissed", "true");
  if (options?.limit) params.set("limit", String(options.limit));
  const qs = params.toString();
  return apiFetch<BackgroundTaskListResponse>(
    `/api/admin/background-tasks${qs ? `?${qs}` : ""}`,
    { withAuth: true }
  );
}

/** 手动关闭任务通知（幂等；关闭后从通知中心/悬浮弹窗消失，记录仍保留） */
export function dismissBackgroundTask(taskId: string) {
  return apiFetch<{ dismissed: boolean }>(
    `/api/admin/background-task/${taskId}/dismiss`,
    { method: "POST", withAuth: true }
  );
}

/** 提交导出后广播的自定义事件：悬浮弹窗监听并立即开始轮询 */
export const BG_TASK_SUBMITTED_EVENT = "gdueca:background-task-submitted";

export function notifyBackgroundTaskSubmitted() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BG_TASK_SUBMITTED_EVENT));
  }
}
