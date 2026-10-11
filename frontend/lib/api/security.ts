/**
 * Security API - 对应后端 app/api/security.py
 *
 * IP 黑白名单 CRUD、封禁状态查询、网络配置读写。
 */
import { apiFetch } from "./client";
import type {
  BanStatus,
  IpRule,
  IpRuleCreate,
  NetworkConfig,
} from "@/types/api";

/** 当前 IP 封禁状态（公开接口，无需登录） */
export function fetchBanStatus() {
  return apiFetch<BanStatus>("/api/security/ban-status");
}

/** 列出 IP 规则（可选 type 过滤、q 搜索） */
export function fetchIpRules(params?: { type?: "whitelist" | "blacklist"; q?: string }) {
  const qs = new URLSearchParams();
  if (params?.type) qs.set("type", params.type);
  if (params?.q) qs.set("q", params.q);
  const query = qs.toString();
  return apiFetch<IpRule[]>(
    `/api/security/ip-rules${query ? `?${query}` : ""}`,
    { withAuth: true }
  );
}

/** 创建 IP 规则 */
export function createIpRule(payload: IpRuleCreate) {
  return apiFetch<IpRule>("/api/security/ip-rules", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/** 删除 IP 规则 */
export function deleteIpRule(ruleId: number) {
  return apiFetch<null>(`/api/security/ip-rules/${ruleId}`, {
    method: "DELETE",
    withAuth: true,
  });
}

/** 读取网络配置（监听端口 / IP / 域名） */
export function fetchNetworkConfig() {
  return apiFetch<NetworkConfig>("/api/security/network", { withAuth: true });
}

/** 修改网络配置 */
export function updateNetworkConfig(payload: Partial<NetworkConfig>) {
  return apiFetch<NetworkConfig>("/api/security/network", {
    method: "PUT",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}
