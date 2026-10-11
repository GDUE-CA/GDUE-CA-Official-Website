/**
 * System Settings API - 对应后端 app/api/system.py
 *
 * 站点设置读写、IP 黑名单管理、网络配置变更历史。
 */
import { apiFetch } from "./client";
import type { NetworkConfigHistory, PublicSystemSettings, SystemSettings } from "@/types/api";

/** 公开站点信息（站点名、页脚、备案、系统时区等；不含安全配置） */
export function fetchPublicSettings() {
  return apiFetch<PublicSystemSettings>("/api/system/settings");
}

/** 完整系统配置（含 IP 黑名单 / 域名 / 网络配置，需 admin） */
export function fetchSystemSettings() {
  return apiFetch<SystemSettings>("/api/system/settings/admin", { withAuth: true });
}

export function updateSystemSettings(payload: Partial<SystemSettings>) {
  return apiFetch<SystemSettings>("/api/system/settings", {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** 后端 IP 黑名单接口用 QUERY 参数 ?ip=xxx */
export function addIpBlacklist(ip: string) {
  return apiFetch<{ blacklist: string[] }>(
    `/api/system/ip-blacklist?ip=${encodeURIComponent(ip)}`,
    {
      method: "POST",
      withAuth: true,
    }
  );
}

export function removeIpBlacklist(ip: string) {
  return apiFetch<{ blacklist: string[] }>(
    `/api/system/ip-blacklist?ip=${encodeURIComponent(ip)}`,
    {
      method: "DELETE",
      withAuth: true,
    }
  );
}

/** 网络配置变更历史（最近 5 条） */
export function fetchNetworkConfigHistory() {
  return apiFetch<NetworkConfigHistory[]>(
    "/api/system/network-config/history",
    { withAuth: true }
  );
}
