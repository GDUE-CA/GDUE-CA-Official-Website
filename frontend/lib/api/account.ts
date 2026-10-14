/**
 * 账号自服务 API - 对应后端 app/api/account.py（/setting）
 *
 * 界面显示偏好、通知偏好、黑名单、OAuth 授权管理。
 */
import { apiFetch } from "./client";
import type {
  BlockCandidate,
  BlockedUser,
  DisplayPreference,
  DisplayPreferenceUpdate,
  NotificationPreference,
  NotificationPreferenceUpdate,
  OAuthGrant,
} from "@/types/api";

/* ---------- 界面显示偏好 ---------- */

export function fetchDisplayPreference() {
  return apiFetch<DisplayPreference>("/api/account/display", { withAuth: true });
}

export function updateDisplayPreference(payload: DisplayPreferenceUpdate) {
  return apiFetch<DisplayPreference>("/api/account/display", {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/* ---------- 通知偏好 ---------- */

export function fetchNotificationPreference() {
  return apiFetch<NotificationPreference>("/api/account/notifications", {
    withAuth: true,
  });
}

export function updateNotificationPreference(payload: NotificationPreferenceUpdate) {
  return apiFetch<NotificationPreference>("/api/account/notifications", {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/* ---------- 黑名单 ---------- */

export function fetchBlocks() {
  return apiFetch<BlockedUser[]>("/api/account/blocks", { withAuth: true });
}

export function searchBlockCandidates(q: string) {
  return apiFetch<BlockCandidate[]>(
    `/api/account/blocks/search?q=${encodeURIComponent(q)}`,
    { withAuth: true }
  );
}

export function blockUser(payload: { user_id?: number; username?: string }) {
  return apiFetch<{ ok: boolean }>("/api/account/blocks", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

export function unblockUser(blockedId: number) {
  return apiFetch<{ ok: boolean }>(`/api/account/blocks/${blockedId}`, {
    method: "DELETE",
    withAuth: true,
  });
}

/* ---------- OAuth 授权 ---------- */

export function fetchOAuthGrants() {
  return apiFetch<OAuthGrant[]>("/api/account/oauth-grants", { withAuth: true });
}

export function revokeOAuthGrant(grantId: number) {
  return apiFetch<{ ok: boolean }>(`/api/account/oauth-grants/${grantId}`, {
    method: "DELETE",
    withAuth: true,
  });
}

/* ---------- 会话（Cookie 清理：销毁全部会话含当前） ---------- */

/** 销毁当前用户全部会话（含当前）并清除登录 Cookie，调用方随后清理本地存储并跳登录页 */
export function revokeAllSessions() {
  return apiFetch<{ ok: boolean; revoked: number }>(
    "/api/auth/sessions/revoke-all",
    { method: "POST", withAuth: true }
  );
}
