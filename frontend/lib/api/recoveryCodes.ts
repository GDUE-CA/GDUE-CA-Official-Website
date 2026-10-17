/**
 * Recovery Codes API - 对应后端 app/api/recovery_codes.py（用户端部分）
 *
 * 一次性安全恢复码（/api/auth/recovery-codes，V0.5.8 §4 账号兜底找回密钥）：
 * 生成明文仅此一次返回，库中只存 SHA-256；一次性使用，可多次生成、可手动作废旧码。
 * 找回端 /api/auth/forgot-password/recovery-reset 由忘记密码页调用（lib/api/auth.ts）。
 */
import { apiFetch } from "./client";
import type { RecoveryCodeCreateResult, RecoveryCodeItem } from "@/types/api";

/** 生成新恢复码：明文仅此响应返回一次（限流 5 次/小时） */
export function generateRecoveryCode() {
  return apiFetch<RecoveryCodeCreateResult>("/api/auth/recovery-codes", {
    method: "POST",
    withAuth: true,
  });
}

/** 本账号全部恢复码元数据（含已使用 / 已作废，前端分状态展示） */
export function listRecoveryCodes() {
  return apiFetch<RecoveryCodeItem[]>("/api/auth/recovery-codes", {
    withAuth: true,
  });
}

/** 手动作废旧码（仅本人；已使用的码不可再作废，后端 400） */
export function revokeRecoveryCode(id: number) {
  return apiFetch<void>(`/api/auth/recovery-codes/${id}`, {
    method: "DELETE",
    withAuth: true,
  });
}
