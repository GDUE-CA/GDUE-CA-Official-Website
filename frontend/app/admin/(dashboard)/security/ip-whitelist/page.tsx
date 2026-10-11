"use client";

/**
 * /admin/security/ip-whitelist - IP 白名单管理
 * 可信 IP 豁免网络层限制；可选绑定账号实现自动登录（opt-in）
 */
import { IpRulesManager } from "@/components/admin/security/IpRulesManager";

export default function IpWhitelistPage() {
  return <IpRulesManager type="whitelist" />;
}
