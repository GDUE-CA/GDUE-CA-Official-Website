/**
 * OAuth API - 对应后端 app/api/oauth.py
 *
 * 第三方登录：公开渠道开关 / 授权跳转（302 由浏览器处理，前端仅 window.location.href）
 * / 补资料读取与提交 / 管理端渠道配置 CRUD。
 */
import { apiFetch } from "./client";
import type {
  LoginResponse,
  OAuthChannel,
  OAuthChannelBrief,
  OAuthChannelUpdate,
  OAuthCompleteRequest,
  OAuthProvider,
  PendingOAuthProfile,
} from "@/types/api";

/* ---------- 公开接口 ---------- */

/** 公开：渠道开关列表（登录页按 enabled 显隐按钮，不含任何凭据） */
export function listPublicOAuthChannels() {
  return apiFetch<OAuthChannelBrief[]>("/api/oauth/channels");
}

/** 公开：读取补资料票据预填信息（票据在 HttpOnly Cookie，过期返回 401） */
export function getPendingOAuthProfile() {
  return apiFetch<PendingOAuthProfile>("/api/oauth/pending");
}

/** 公开：补资料提交（创建 member 账号并绑定第三方，返回登录态） */
export function completeOAuthProfile(payload: OAuthCompleteRequest) {
  return apiFetch<LoginResponse>("/api/oauth/complete", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ---------- 管理接口 ---------- */

/** 管理：4 渠道配置列表（secret 脱敏，仅展示掩码） */
export function adminListOAuthChannels() {
  return apiFetch<OAuthChannel[]>("/api/admin/oauth/channels");
}

/** 管理：更新渠道配置（secret 传明文重新加密，空串=清除，"***" 占位不覆盖） */
export function adminUpdateOAuthChannel(
  provider: OAuthProvider,
  payload: OAuthChannelUpdate
) {
  return apiFetch<OAuthChannel>(`/api/admin/oauth/channels/${provider}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
