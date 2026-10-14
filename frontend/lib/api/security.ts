/**
 * Security API - 对应后端 app/api/security.py
 *
 * IP 黑白名单 CRUD、封禁状态查询。
 * 网络配置（端口/监听 IP/绑定域名）的网页编辑入口已下线，
 * 后端接口保留读取存量配置，部署层（环境变量/Caddy/Nginx）管控监听参数。
 */
import { apiFetch } from "./client";
import type {
  BanStatus,
  IpRule,
  IpRuleCreate,
  BanEntry,
  BanResetRequest,
  BGConfirmRequest,
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

/* ---------- 登录防爆破封禁面板（后台，需 security manage 权限） ---------- */

/** 枚举全部封禁条目（Break-Glass + 普通账号两套策略合并） */
export function fetchBans() {
  return apiFetch<BanEntry[]>("/api/admin/security/bans", { withAuth: true });
}

/** 解除指定封禁（含永久封禁） */
export function unbanBan(
  policy: "break_glass" | "normal",
  account: string,
  dim: "IP" | "BrowserFingerprint",
  dimValue: string
) {
  const qs = new URLSearchParams({ policy, account, dim, dim_value: dimValue });
  return apiFetch<{ ok: boolean }>(`/api/admin/security/bans?${qs.toString()}`, {
    method: "DELETE",
    withAuth: true,
  });
}

/** 重置指定账号+维度的错误计数与惩罚阶段 */
export function resetBanStage(payload: BanResetRequest) {
  return apiFetch<{ ok: boolean }>("/api/admin/security/bans/reset", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}

/* ---------- Break-Glass 高危操作确认审计 ---------- */

/** BG 高危操作确认/取消 → 审计日志（确认与取消均记录） */
export function bgConfirm(payload: BGConfirmRequest) {
  return apiFetch<{ ok: boolean }>("/api/audit/bg-confirm", {
    method: "POST",
    withAuth: true,
    body: JSON.stringify(payload),
  });
}
