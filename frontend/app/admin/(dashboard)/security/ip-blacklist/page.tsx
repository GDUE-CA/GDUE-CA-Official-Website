"use client";

/**
 * /admin/security/ip-blacklist - IP 黑名单管理
 * 违规原因 + 封禁时长（临时倒计时 / 永久）；前端弹窗展示
 */
import { IpRulesManager } from "@/components/admin/security/IpRulesManager";

export default function IpBlacklistPage() {
  return <IpRulesManager type="blacklist" />;
}
