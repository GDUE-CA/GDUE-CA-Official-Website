"use client";

/**
 * SettingShell —— 个人设置整体框架
 *
 * - 顶部细条：BrandMark 回首页 + 「返回官网」
 * - 桌面端：左侧 w-56 Tab 导航（ghost 风格，激活高亮）+ 右侧内容区 max-w-2xl
 * - 移动端：侧栏隐藏，内容区顶部 sticky 横向滚动 Tab 条
 * - Tab 切换经 useDirtyGuard().guardNavigate 接管：有未保存修改时弹确认框
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  User,
  MapPin,
  CalendarClock,
  Palette,
  ShieldCheck,
  MonitorSmartphone,
  Link2,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useDirtyGuard } from "@/components/setting/SettingGuardContext";
import { BrandMark } from "@/components/shared/BrandMark";
import { cn } from "@/lib/utils";

interface TabItem {
  key: string;
  href: string;
  icon: LucideIcon;
}

const TABS: TabItem[] = [
  { key: "setting.tabs.profile", href: "/setting/profile", icon: User },
  { key: "setting.tabs.region", href: "/setting/region", icon: MapPin },
  { key: "setting.tabs.regionalFormat", href: "/setting/regional-format", icon: CalendarClock },
  { key: "setting.tabs.appearance", href: "/setting/appearance", icon: Palette },
  { key: "setting.tabs.security", href: "/setting/security", icon: ShieldCheck },
  { key: "setting.tabs.sessions", href: "/setting/sessions", icon: MonitorSmartphone },
  { key: "setting.tabs.connections", href: "/setting/connections", icon: Link2 },
  { key: "setting.tabs.notifications", href: "/setting/notifications", icon: Bell },
];

export function SettingShell({ children }: { children: React.ReactNode }) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const { guardNavigate } = useDirtyGuard();

  const homeHref = `/${locale}`;

  /** 导航点击接管：有未保存修改时 preventDefault 并弹确认框 */
  function handleNavClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (pathname === href) return;
    e.preventDefault();
    guardNavigate(() => router.push(href));
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部细条 */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-border">
        <Link href={homeHref} aria-label={t("nav.home")}>
          <BrandMark />
        </Link>
        <Link
          href={homeHref}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("admin.login.backToSite")}
        </Link>
      </header>

      {/* 移动端：sticky 横向滚动 Tab 条 */}
      <div className="md:hidden sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <nav className="flex gap-1 overflow-x-auto px-2" aria-label={t("nav.settings")}>
          {TABS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm border-b-2 transition-colors cursor-pointer",
                  active
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex">
        {/* 桌面端：左侧 Tab 导航 */}
        <aside className="hidden md:block w-56 shrink-0 border-r border-border p-3">
          <nav className="space-y-1" aria-label={t("nav.settings")}>
            {TABS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item.href)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // 对齐 admin 侧边栏 renderNavItem 的 Button ghost + size-sm 完整类名
                    "inline-flex items-center justify-start gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
                    "hover:bg-accent hover:text-accent-foreground",
                    "w-full px-3 h-8",
                    active
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* 内容区 */}
        <main className="flex-1 min-w-0 p-4 md:p-8">
          <div className="max-w-2xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
