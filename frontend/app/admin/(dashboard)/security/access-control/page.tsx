"use client";

/**
 * /admin/security/access-control - 访问控制（Tab 合并）
 * 三个 Tab：IP 白名单 ｜ IP 黑名单 ｜ 域名监听
 * - IP 白/黑名单：复用 IpRulesManager 组件（既有业务逻辑、防自锁保护原样保留）
 * - 域名监听：复用 NetworkConfigPanel（网络配置/绑定域名）
 * 底层 access_control_rule 表与优先级规则不变：
 *   IP 黑名单(自动+手动) → IP 白名单总控 → Referer 域名校验
 * 本页仅做页面排布合并，不改任何业务逻辑。
 */
import { useState, useEffect } from "react";
import { ShieldCheck, ShieldBan, Globe } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { IpRulesManager } from "@/components/admin/security/IpRulesManager";
import { NetworkConfigPanel } from "@/components/admin/security/NetworkConfigPanel";
import { cn } from "@/lib/utils";

type Tab = "whitelist" | "blacklist" | "domain";

const TAB_ORDER: Tab[] = ["whitelist", "blacklist", "domain"];

export default function AccessControlPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("whitelist");

  // URL ?tab= 深链支持（用 window 读取避免 useSearchParams 的 Suspense 边界要求）
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q && (TAB_ORDER as string[]).includes(q)) {
      setTab(q as Tab);
    }
  }, []);

  const tabs: { key: Tab; label: string; icon: typeof ShieldCheck }[] = [
    { key: "whitelist", label: t("admin.security.whitelistTitle"), icon: ShieldCheck },
    { key: "blacklist", label: t("admin.security.blacklistTitle"), icon: ShieldBan },
    { key: "domain", label: t("admin.security.networkTitle"), icon: Globe },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Globe className="h-6 w-6 text-primary" />
          {t("admin.nav.security.access")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.security.networkDesc")}
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
        {tab === "whitelist" && <IpRulesManager type="whitelist" />}
        {tab === "blacklist" && <IpRulesManager type="blacklist" />}
        {tab === "domain" && <NetworkConfigPanel />}
      </div>
    </div>
  );
}
