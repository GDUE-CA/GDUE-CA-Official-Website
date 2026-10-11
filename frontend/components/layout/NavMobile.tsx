"use client";

/**
 * NavMobile - 移动端右侧抽屉导航
 * - 由 NavDesktop 持有 open 状态并通过 props 传入
 * - 抽屉内含导航链接、设置折叠面板（主题/语言切换）、底部报名与管理员入口
 * - 支持滑动关闭、Escape 关闭、浏览器返回键关闭
 * - 主题在打开时从 <html> 同步一次，避免与桌面端 ThemeToggle 状态分离
 *
 * 配套组件：NavDesktop.tsx（桌面端 header，持有 open 状态）
 */
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sun, Moon, ChevronDown } from "lucide-react";
import { locales, localeNames, type Locale } from "@/lib/i18n";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/layout/UserMenu";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { cn } from "@/lib/utils";
import { navTransitionTypes } from "@/lib/navTransition";

/** 导航项配置（与 NavDesktop 保持一致；不抽到第三个文件以遵守「仅 2 个导航栏 tsx」约束） */
const navItems = [
  { key: "nav.home", href: "" },
  { key: "nav.events", href: "/events" },
  { key: "nav.blog", href: "/blog" },
  { key: "nav.memo", href: "/memo" },
  { key: "nav.projects", href: "/projects" },
  { key: "nav.about", href: "/about" },
  { key: "nav.contact", href: "/contact" },
] as const;

export function NavMobile({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  /** 当前主题（打开抽屉时从 <html> 同步） */
  const [theme, setTheme] = useState<"light" | "dark">("light");
  /** 设置折叠面板开关 */
  const [settingsOpen, setSettingsOpen] = useState(false);

  const skipHistoryCleanup = useRef(false);
  /** 设置按钮 ref：展开时自动滚到可视区 */
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

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

  /** 抽屉打开时锁滚动 + 同步主题 + 重置折叠面板 */
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (open) {
      setTheme(
        document.documentElement.classList.contains("dark") ? "dark" : "light"
      );
      setSettingsOpen(false);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /** Escape 键关闭菜单 */
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  /** 挂载时清理历史残留 */
  useEffect(() => {
    if (window.history.state?.drawerOpen) {
      const rest = { ...window.history.state };
      delete rest.drawerOpen;
      window.history.replaceState(rest, "");
    }
  }, []);

  /** 浏览器返回键适配 */
  useEffect(() => {
    if (!open) return;
    window.history.pushState(
      { ...(window.history.state ?? {}), drawerOpen: true },
      "",
      window.location.href
    );
    const onPopState = () => onClose();
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!skipHistoryCleanup.current && window.history.state?.drawerOpen) {
        window.history.back();
      }
      skipHistoryCleanup.current = false;
    };
  }, [open, onClose]);

  /** 抽屉内链接点击：跳过历史清理并关闭抽屉 */
  function handleDrawerNavigate() {
    skipHistoryCleanup.current = true;
    onClose();
  }

  /** 设置按钮点击：切换折叠面板，并在展开时滚动保证按钮可见 */
  function toggleSettings() {
    setSettingsOpen((v) => {
      const next = !v;
      if (next) {
        requestAnimationFrame(() => {
          settingsBtnRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
      }
      return next;
    });
  }

  /** 设置主题 */
  function applyThemeMode(mode: "light" | "dark") {
    document.documentElement.classList.toggle("dark", mode === "dark");
    window.localStorage.setItem("gdueca-theme", mode);
    setTheme(mode);
  }

  /** 语言切换：替换路径中的语言前缀 */
  function switchLocale(target: Locale) {
    if (target === locale) return;
    handleDrawerNavigate();
    const segments = pathname.split("/");
    segments[1] = target;
    router.push(segments.join("/"));
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ top: 0, left: 0, right: 0.5, bottom: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 80 || info.velocity.x > 400) {
                onClose();
              }
            }}
            className="md:hidden fixed top-0 right-0 bottom-0 z-[61] w-72 max-w-[80vw] bg-background border-l border-border shadow-xl flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.menu")}
          >
            {/* 头部 */}
            <div className="flex h-16 items-center justify-between px-5 border-b border-border shrink-0">
              <span className="font-display font-bold text-base">
                {t("nav.menu")}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* 导航链接 + 设置（设置和面板在同一个 wrapper，从按钮下方自然向下展开） */}
            <nav className="flex flex-col gap-1 p-4 flex-1 overflow-y-auto">
              {navItems.map((item) => (
                <Link
                  key={item.key}
                  href={localePath(item.href)}
                  transitionTypes={navTransitionTypes(pathname, locale, item.href)}
                  onClick={handleDrawerNavigate}
                  className={cn(
                    "px-4 py-3 rounded-md text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "text-primary bg-secondary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {t(item.key)}
                </Link>
              ))}

              {/* 设置按钮 + 折叠面板 —— 同一个 wrapper，视觉上是 nav list 的最后一个 item */}
              <div className="flex flex-col gap-1">
                <button
                  ref={settingsBtnRef}
                  type="button"
                  onClick={toggleSettings}
                  aria-expanded={settingsOpen}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 rounded-md text-sm font-medium transition-colors",
                    settingsOpen
                      ? "text-primary bg-secondary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <span>{t("nav.settings")}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-all",
                      settingsOpen && "rotate-180"
                    )}
                  />
                </button>

                {/* 折叠面板 —— 与全站伸缩菜单同速（150ms 默认贝塞尔曲线） */}
                <div
                  id="nav-mobile-settings-panel"
                  aria-hidden={!settingsOpen}
                  className={cn(
                    "grid transition-[grid-template-rows] motion-reduce:transition-none",
                    settingsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden min-h-0">
                    <div className="ml-2 pl-3 border-l-2 border-border space-y-3 py-2">
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {t("nav.theme")}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            tabIndex={settingsOpen ? undefined : -1}
                            onClick={() => applyThemeMode("light")}
                            className={cn(
                              "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                              theme === "light"
                                ? "border-primary bg-secondary text-primary"
                                : "border-border text-muted-foreground hover:bg-muted"
                            )}
                          >
                            <Sun className="h-3.5 w-3.5" />
                            {t("common.themeLight")}
                          </button>
                          <button
                            type="button"
                            tabIndex={settingsOpen ? undefined : -1}
                            onClick={() => applyThemeMode("dark")}
                            className={cn(
                              "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                              theme === "dark"
                                ? "border-primary bg-secondary text-primary"
                                : "border-border text-muted-foreground hover:bg-muted"
                            )}
                          >
                            <Moon className="h-3.5 w-3.5" />
                            {t("common.themeDark")}
                          </button>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {t("nav.language")}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {locales.map((loc) => (
                            <button
                              key={loc}
                              type="button"
                              tabIndex={settingsOpen ? undefined : -1}
                              onClick={() => switchLocale(loc)}
                              className={cn(
                                "rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                                locale === loc
                                  ? "border-primary bg-secondary text-primary"
                                  : "border-border text-muted-foreground hover:bg-muted"
                              )}
                            >
                              {localeNames[loc]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </nav>

            {/* 底部 CTA + 通知 + 用户菜单 */}
            <div className="p-4 border-t border-border shrink-0 flex items-center gap-2">
              <Button asChild className="flex-1">
                <Link
                  href={localePath("/join")}
                  transitionTypes={navTransitionTypes(pathname, locale, "/join")}
                  onClick={handleDrawerNavigate}
                >
                  {t("nav.join")}
                </Link>
              </Button>
              <NotificationBell />
              <UserMenu />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
