"use client";

/**
 * NavDesktop - 桌面端顶部导航栏
 * - 固定 header，三列 grid（左Logo / 中导航居中 / 右操作区）
 * - 半透明背景 + 底部细线（克制科技风），始终可辨识
 * - 导航树：首页 → 活动 → 社区▾（折叠父菜单，鼠标悬停展开 / 触屏点击切换）→ 关于我们
 * - 桌面端显示主题切换、语言切换、通知、用户菜单
 * - 移动端汉堡按钮触发 NavMobile 抽屉（由本组件持有 mobileOpen 状态并下传）
 *
 * 配套组件：NavMobile.tsx（移动端右侧抽屉，由本组件渲染）
 */
import { useEffect, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import Menu from "@/assets/icons/navigation/menu.svg";
import ChevronDown from "@/assets/icons/navigation/chevron-down.svg";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { NavDropdownBar } from "@/components/layout/NavDropdown";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { NavMobile } from "@/components/layout/NavMobile";
import { UserMenu } from "@/components/layout/UserMenu";
import { BrandMark } from "@/components/shared/BrandMark";
import { cn } from "@/lib/utils";
import { navTransitionTypes } from "@/lib/navTransition";

/** 一级导航项（「社区」为折叠父菜单，单独渲染） */
const navItems = [
  { key: "nav.home", href: "" },
  { key: "nav.events", href: "/events" },
] as const;

/** 「社区」折叠父菜单的子项 */
const communityItems = [
  { key: "nav.memo", href: "/memo" },
  { key: "nav.blog", href: "/blog" },
  { key: "nav.projects", href: "/projects" },
] as const;

/** 末尾一级导航项 */
const tailItems = [{ key: "nav.about", href: "/about" }] as const;

/** 鼠标移出「社区」后延迟收起，避免斜向移向面板时误关 */
const COMMUNITY_CLOSE_DELAY_MS = 120;

/** 「社区」面板：自左上角弹性缩放展开，子项依次错开淡入；收起时快速淡出 */
const communityMenuVariants: Variants = {
  closed: {
    opacity: 0,
    scale: 0.95,
    y: -6,
    transition: { duration: 0.12, ease: "easeIn" },
  },
  open: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 520, damping: 32, staggerChildren: 0.04, delayChildren: 0.03 },
  },
};

const communityItemVariants: Variants = {
  closed: { opacity: 0, x: -6 },
  open: { opacity: 1, x: 0, transition: { duration: 0.18, ease: "easeOut" } },
};

export function NavDesktop() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  /** 「社区」折叠菜单开关（默认收起） */
  const [communityOpen, setCommunityOpen] = useState(false);
  const communityRef = useRef<HTMLDivElement>(null);
  /** 最近一次按下「社区」按钮的指针类型：区分鼠标点击（保持展开）与触屏 / 键盘（切换） */
  const lastPointerType = useRef<string | null>(null);

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

  /** 任一子页面激活 → 父项「社区」高亮 */
  const communityActive = communityItems.some((item) => isActive(item.href));

  /** 路由变化时收起折叠菜单 */
  useEffect(() => {
    setCommunityOpen(false);
  }, [pathname]);

  /** 点击「社区」以外的区域或按 ESC 时收起折叠菜单 */
  useEffect(() => {
    if (!communityOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (communityRef.current && !communityRef.current.contains(e.target as Node)) {
        setCommunityOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCommunityOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [communityOpen]);

  /** 鼠标悬停展开、移出延迟收起（仅 mouse 指针；触屏 / 键盘仍走点击切换，避免悬停与点击互相抵消） */
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverClose = () => {
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  };
  const onCommunityPointerEnter = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    cancelHoverClose();
    setCommunityOpen(true);
  };
  const onCommunityPointerLeave = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    cancelHoverClose();
    hoverCloseTimer.current = setTimeout(() => setCommunityOpen(false), COMMUNITY_CLOSE_DELAY_MS);
  };
  useEffect(() => cancelHoverClose, []);

  const linkClass = (active: boolean) =>
    cn(
      "px-3 py-2 rounded-lg text-sm transition-colors",
      active
        ? "text-foreground bg-secondary font-medium"
        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
    );

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
                  className={linkClass(isActive(item.href))}
                >
                  {t(item.key)}
                </Link>
              ))}

              {/* 社区：折叠父菜单（鼠标悬停展开；触屏 / 键盘点击父标题切换） */}
              <div
                ref={communityRef}
                className="relative"
                onPointerEnter={onCommunityPointerEnter}
                onPointerLeave={onCommunityPointerLeave}
              >
                <button
                  type="button"
                  onPointerDown={(e) => {
                    lastPointerType.current = e.pointerType;
                  }}
                  onClick={() => {
                    // 鼠标点击时菜单已由悬停展开，保持展开而非切换收起；键盘回车 / 触屏仍切换
                    if (lastPointerType.current === "mouse") setCommunityOpen(true);
                    else setCommunityOpen((v) => !v);
                    lastPointerType.current = null;
                  }}
                  aria-expanded={communityOpen}
                  aria-haspopup="menu"
                  className={cn("inline-flex items-center gap-1", linkClass(communityActive || communityOpen))}
                >
                  {t("nav.community")}
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200 ease-out",
                      communityOpen && "rotate-180"
                    )}
                  />
                </button>
                <AnimatePresence>
                  {communityOpen && (
                    // pt-1.5 透明桥接按钮与面板之间的空隙，鼠标经过不触发移出
                    <div className="absolute left-0 top-full pt-1.5">
                      <motion.div
                        variants={communityMenuVariants}
                        initial="closed"
                        animate="open"
                        exit="closed"
                        style={{ transformOrigin: "top left" }}
                        className="min-w-[10rem] rounded-lg border border-border bg-popover p-1 shadow-md"
                        role="menu"
                      >
                        {communityItems.map((item) => (
                          <motion.div key={item.key} variants={communityItemVariants}>
                            <Link
                              href={localePath(item.href)}
                              transitionTypes={navTransitionTypes(pathname, locale, item.href)}
                              role="menuitem"
                              aria-current={isActive(item.href) ? "page" : undefined}
                              onClick={() => setCommunityOpen(false)}
                              className={cn(
                                "block px-3 py-2 rounded-md text-sm transition-colors",
                                isActive(item.href)
                                  ? "text-foreground bg-secondary font-medium"
                                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                              )}
                            >
                              {t(item.key)}
                            </Link>
                          </motion.div>
                        ))}
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              {tailItems.map((item) => (
                <Link
                  key={item.key}
                  href={localePath(item.href)}
                  transitionTypes={navTransitionTypes(pathname, locale, item.href)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={linkClass(isActive(item.href))}
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
