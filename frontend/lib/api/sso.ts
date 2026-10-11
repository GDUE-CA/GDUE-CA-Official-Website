/**
 * SSO API - 对应后端 app/api/sso.py
 *
 * 自建 SSO 授权服务器：授权端点 /token 端点由第三方应用服务器端调用，
 * 前端仅实现管理端受信应用 CRUD（client_secret 明文仅创建/重置时一次性返回）。
 */
import { apiFetch } from "./client";
import type { SsoClient, SsoClientCreate, SsoClientUpdate } from "@/types/api";

/** 管理：受信应用列表 */
export function adminListSsoClients() {
  return apiFetch<SsoClient[]>("/api/admin/sso/clients");
}

/** 管理：创建受信应用（client_id 自动生成；响应含一次性明文 secret） */
export function adminCreateSsoClient(payload: SsoClientCreate) {
  return apiFetch<SsoClient>("/api/admin/sso/clients", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** 管理：更新受信应用（名称 / 回调白名单 / 启停） */
export function adminUpdateSsoClient(id: number, payload: SsoClientUpdate) {
  return apiFetch<SsoClient>(`/api/admin/sso/clients/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** 管理：重置 client_secret（明文仅本次返回） */
export function adminResetSsoClientSecret(id: number) {
  return apiFetch<SsoClient>(`/api/admin/sso/clients/${id}/reset-secret`, {
    method: "POST",
  });
}

/** 管理：删除受信应用 */
export function adminDeleteSsoClient(id: number) {
  return apiFetch<{ ok: boolean }>(`/api/admin/sso/clients/${id}`, {
    method: "DELETE",
  });
}
