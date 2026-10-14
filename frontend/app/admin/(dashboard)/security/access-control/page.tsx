"use client";

/**
 * /admin/security/access-control - 访问控制（Tab 合并 · 系统安全）
 * 四个 Tab：IP 黑名单 ｜ IP 白名单 ｜ 管理员可信 IP ｜ 域名白名单
 * - IP 白/黑名单：复用 IpRulesManager 组件（既有业务逻辑、防自锁保护原样保留）
 * - 管理员可信 IP：管理员账号登录来源白名单（admin_trusted_ips，自基础站点页迁入）
 * - 域名白名单：CORS Origins + Allowed Hosts（自基础站点页迁入）
 * 底层 access_control_rule 表与优先级规则不变：
 *   IP 黑名单(自动+手动) → IP 白名单总控 → Referer 域名校验
 * 网络配置（端口/监听 IP/绑定域名）网页编辑入口已下线，本页仅做配置排布，不改业务逻辑。
 */
import { useState, useEffect } from "react";
import { ShieldCheck, ShieldBan, Globe, KeyRound } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { IpRulesManager } from "@/components/admin/security/IpRulesManager";
import { TrustedAdminIpsPanel } from "@/components/admin/security/TrustedAdminIpsPanel";
import { DomainWhitelistPanel } from "@/components/admin/security/DomainWhitelistPanel";
import { cn } from "@/lib/utils";

type Tab = "blacklist" | "whitelist" | "trusted" | "domains";

const TAB_ORDER: Tab[] = ["blacklist", "whitelist", "trusted", "domains"];

export default function AccessControlPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("blacklist");

  // URL ?tab= 深链支持（用 window 读取避免 useSearchParams 的 Suspense 边界要求）
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q && (TAB_ORDER as string[]).includes(q)) {
      setTab(q as Tab);
    }
  }, []);

  const tabs: { key: Tab; label: string; icon: typeof ShieldCheck }[] = [
    { key: "blacklist", label: t("admin.security.blacklistTitle"), icon: ShieldBan },
    { key: "whitelist", label: t("admin.security.whitelistTitle"), icon: ShieldCheck },
    { key: "trusted", label: t("admin.settings.adminTrustedIpsTitle"), icon: KeyRound },
    { key: "domains", label: t("admin.settings.domainWhitelist"), icon: Globe },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          {t("admin.nav.security.access")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.security.accessDesc")}
        </p>
      </div>

      {/* Tab 切换条 */}
      <div className="border-b border-border">
        <nav className="flex gap-1 -mb-px overflow-x-auto" aria-label="Access control tabs">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                tab === tb.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <tb.icon className="h-4 w-4" />
              {tb.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab 内容 */}
      <div>
        {tab === "blacklist" && <IpRulesManager type="blacklist" />}
        {tab === "whitelist" && <IpRulesManager type="whitelist" />}
        {tab === "trusted" && <TrustedAdminIpsPanel />}
        {tab === "domains" && <DomainWhitelistPanel />}
      </div>
    </div>
  );
}
