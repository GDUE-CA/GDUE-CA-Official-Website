/**
 * Query API - 对应后端 app/api/query.py
 *
 * 回执码公开查询：报名 / Bug 提交后凭回执码查进度 + 公开签到。
 */
import { apiFetch } from "./client";
import type { ReceiptQueryResult } from "@/types/api";

/** 公开查询回执结果（无需登录） */
export function queryReceipt(receiptCode: string) {
  return apiFetch<ReceiptQueryResult>(
    `/api/query/${encodeURIComponent(receiptCode.trim())}`
  );
}

/** 公开签到：报名者凭回执码签到，状态变为已签到（无需登录） */
export function checkinReceipt(receiptCode: string) {
  return apiFetch<ReceiptQueryResult>(
    `/api/query/${encodeURIComponent(receiptCode.trim())}/checkin`,
    { method: "POST" }
  );
}
