"use client";

/**
 * NavDesktop - 桌面端顶部导航栏
 * - 固定 header，三列 grid（左Logo / 中导航居中 / 右操作区）
 * - 半透明背景 + 底部细线（克制科技风），始终可辨识
 * - 桌面端显示主题切换、语言切换、报名 CTA、管理员入口
 * - 移动端汉堡按钮触发 NavMobile 抽屉（由本组件持有 mobileOpen 状态并下传）
 *
 * 配套组件：NavMobile.tsx（移动端右侧抽屉，由本组件渲染）
 */
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Menu } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { NavDropdownBar } from "@/components/layout/NavDropdown";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { NavMobile } from "@/components/layout/NavMobile";
import { UserMenu } from "@/components/layout/UserMenu";
import { BrandMark } from "@/components/shared/BrandMark";
import { cn } from "@/lib/utils";
import { navTransitionTypes } from "@/lib/navTransition";

/** 导航项配置（不含「报名」—— 报名在桌面 CTA 与移动抽屉底部） */
const navItems = [
  { key: "nav.home", href: "" },
  { key: "nav.events", href: "/events" },
  { key: "nav.blog", href: "/blog" },
  { key: "nav.memo", href: "/memo" },
  { key: "nav.projects", href: "/projects" },
  { key: "nav.about", href: "/about" },
  { key: "nav.contact", href: "/contact" },
] as const;

export function NavDesktop() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  /** 构建带语言前缀的路径 */
  function localePath(href: string) {
    return `/${locale}${href}`;
  }

  /** 判断当前路由是否激活 */
  function isActive(href: string) {
    const fullHref = localePath(href);
    if (href === "") {
      return pathname === `/${locale}`;
    }
    return pathname.startsWith(fullHref);
  }

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        // 常驻导航栏：页面过渡时单独成组保持静止（见 globals.css persistent-nav）
        style={{ viewTransitionName: "persistent-nav" }}
        className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/85 backdrop-blur-md"
      >
        <nav className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* 三列 grid：左Logo / 中导航（真正居中）/ 右操作区 */}
          <div className="grid h-16 grid-cols-2 md:grid-cols-[1fr_auto_1fr] items-center">
            <Link
              href={localePath("")}
              transitionTypes={navTransitionTypes(pathname, locale, "")}
              className="justify-self-start rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrandMark hideWordmarkOnMobile />
            </Link>

            {/* 桌面端导航 - 居中 */}
            <div className="hidden md:flex items-center gap-1 justify-self-center">
              {navItems.map((item) => (
                <Link
                  key={item.key}
                  href={localePath(item.href)}
                  transitionTypes={navTransitionTypes(pathname, locale, item.href)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive(item.href)
                      ? "text-foreground bg-secondary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  {t(item.key)}
                </Link>
              ))}
            </div>

            {/* 右侧操作区 */}
            <div className="flex items-center gap-2 justify-self-end">
              <div className="hidden md:flex items-center gap-1">
                <NavDropdownBar />
                <NotificationBell />
              </div>
              <Button asChild size="sm" className="hidden md:inline-flex">
                <Link
                  href={localePath("/join")}
                  transitionTypes={navTransitionTypes(pathname, locale, "/join")}
                >
                  {t("nav.join")}
                </Link>
              </Button>
              {/* 用户头像下拉菜单：桌面端可见 */}
              <div className="hidden md:inline-flex items-center">
                <UserMenu />
              </div>
              {/* 移动端汉堡菜单按钮 */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden h-11 w-11"
                onClick={() => setMobileOpen(true)}
                aria-label={t("nav.menu")}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </nav>
      </motion.header>

      {/* 移动端右侧抽屉（状态由桌面端汉堡按钮触发） */}
      <NavMobile open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
