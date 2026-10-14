/**
 * System Settings API - 对应后端 app/api/system.py
 *
 * 站点设置读写、IP 黑名单管理。
 * 网络配置变更历史随网络配置网页入口一并下线（后端接口保留，不再从前端调用）。
 */
import { apiFetch } from "./client";
import type { PublicSystemSettings, SystemSettings } from "@/types/api";

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

/**
 * 保存管理员可信 IP 白名单（IPv4 / IPv6 / 两种 CIDR 混合，每行一条）。
 * 传原始行数组（含空行 / # 注释行），后端过滤校验；任一行非法整体 400 拒绝并返回行号。
 */
export function updateAdminTrustedIps(ips: string[]) {
  return apiFetch<{ admin_trusted_ips: string[] }>(
    "/api/admin/config/admin-trusted-ips",
    {
      method: "PUT",
      withAuth: true,
      body: JSON.stringify({ ips }),
    }
  );
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

