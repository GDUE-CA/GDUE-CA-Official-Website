/**
 * System Reset API - 对应后端 app/api/system_reset.py（V0.5.7 最高危操作）
 *
 * 仅一个提交接口；执行过程为后台异步任务，进度/结果复用 backgroundTasks
 * 的 getBackgroundTask 轮询（category=system_reset），通知中心/悬浮窗同源可见。
 */
import { apiFetch } from "./client";
import type { BackgroundTaskSubmitResponse } from "@/types/api";

/** 固定英文确认文案（必须与后端 CONFIRM_TEXT 逐字一致，禁止修改） */
export const SYSTEM_RESET_CONFIRM_TEXT = "I confirm system reset";

/** 提交系统重置任务（confirm_text 必须逐字匹配；后端二次鉴权） */
export function submitSystemReset(confirmText: string) {
  return apiFetch<BackgroundTaskSubmitResponse>("/api/admin/system/reset", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify({ confirm_text: confirmText }),
  });
}
