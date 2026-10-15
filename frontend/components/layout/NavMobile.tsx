"use client";

/**
 * NavMobile - 移动端右侧抽屉导航
 * - 由 NavDesktop 持有 open 状态并通过 props 传入
 * - 顶部身份卡片（整块可点）两套状态：
 *   · 访客：灰色匿名头像 + 「访客」+ 提示「登录解锁全部个人功能」→ 点击跳登录页
 *   · 已登录：圆形头像 + 昵称 + @username + 身份徽章 + 个性签名 → 点击跳个人主页 /u/{username}
 * - 主导航：首页 / 活动 / 社区（折叠父项，默认收起）/ 关于我们
 * - 「快捷设置」折叠下拉（默认收起）：仅明暗主题切换 + 语言切换
 * - 底部：仅登录用户显示「前往设置」→ /setting；访客隐藏
 * - 抽屉内不放独立登录按钮、不放「提交」按钮（提交按钮固定于全局底栏）
 *
 * 配套组件：NavDesktop.tsx（桌面端 header，持有 open 状态）
 */
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import X from "@/assets/icons/action/x.svg";
import Sun from "@/assets/icons/status/sun.svg";
import Moon from "@/assets/icons/status/moon.svg";
import ChevronDown from "@/assets/icons/navigation/chevron-down.svg";
import UserCircle from "@/assets/icons/user/user-circle.svg";
import SettingsIcon from "@/assets/icons/navigation/settings.svg";
import { locales, localeDisplayName, type Locale } from "@/lib/i18n";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navTransitionTypes } from "@/lib/navTransition";
import { isLogged } from "@/lib/auth";
import { fetchMe } from "@/lib/api/auth";
import { API_BASE_URL, ApiError } from "@/lib/api/client";
import { applyThemeMode, getResolvedTheme } from "@/lib/theme";
import type { AdminUser } from "@/types/api";

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
const tailItems = [
  { key: "nav.about", href: "/about" },
  { key: "nav.submit", href: "/submit" },
] as const;

/** 拼接头像完整 URL（与 UserMenu 规则一致） */
function avatarFullUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const base = API_BASE_URL.replace(/\/+$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

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

  /** 当前颜色模式（打开抽屉时从 <html> 同步） */
  const [theme, setTheme] = useState<"light" | "dark">("light");
  /** 「快捷设置」折叠面板开关（默认收起） */
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 「社区」折叠父菜单开关（默认收起） */
  const [communityOpen, setCommunityOpen] = useState(false);

  /** 登录态与用户资料 */
  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState<AdminUser | null>(null);
  const [imgError, setImgError] = useState(false);

  const skipHistoryCleanup = useRef(false);

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

  /** 拉取登录态与用户资料（抽屉首次挂载时） */
  useEffect(() => {
    const logged = isLogged();
    setLoggedIn(logged);
    if (logged) {
      fetchMe()
        .then((p) => setProfile(p))
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) {
            setLoggedIn(false);
            setProfile(null);
          }
        });
    }
  }, []);

  /** 抽屉打开时锁滚动 + 同步主题 + 重置折叠面板 */
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (open) {
      setTheme(getResolvedTheme());
      setSettingsOpen(false);
      setCommunityOpen(false);
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

  /** 设置主题（写入 localStorage 并同步 <html>.dark） */
  function applyMode(mode: "light" | "dark") {
    applyThemeMode(mode);
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

  const avatarUrl = !imgError ? avatarFullUrl(profile?.avatar_url) : "";
  const displayName = profile?.display_name || profile?.username || "";
  const hasIdentityBadge = Boolean(
    profile?.identity_school_verified || profile?.club_position
  );

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
                className="h-11 w-11"
                onClick={onClose}
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* 主体（可滚动）：身份卡片 + 主导航 + 快捷设置 */}
            <nav className="flex flex-col gap-1 p-4 flex-1 overflow-y-auto">
              {/* ===== 顶部身份卡片（整块可点） ===== */}
              {loggedIn ? (
                <Link
                  href={localePath(`/u/${profile?.username ?? ""}`)}
                  onClick={handleDrawerNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3 min-h-[56px] transition-colors hover:bg-secondary",
                    !profile && "pointer-events-none opacity-70"
                  )}
                  aria-label={t("nav.personalSettings")}
                >
                  <span className="shrink-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="h-12 w-12 rounded-full object-cover bg-secondary"
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <UserCircle className="h-12 w-12 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-foreground">
                      {displayName || t("nav.accountMenu")}
                    </span>
                    {profile?.username && (
                      <span className="block truncate text-xs text-muted-foreground">
                        @{profile.username}
                      </span>
                    )}
                    {hasIdentityBadge && (
                      <span className="mt-1 inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                        {profile?.identity_school_verified
                          ? t("profile.tagSchool")
                          : t("profile.tagClub")}
                      </span>
                    )}
                    {profile?.bio && (
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {profile.bio}
                      </span>
                    )}
                  </span>
                </Link>
              ) : (
                <Link
                  href={localePath("/login")}
                  onClick={handleDrawerNavigate}
                  className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3 min-h-[56px] transition-colors hover:bg-secondary"
                >
                  <UserCircle className="h-12 w-12 text-muted-foreground/60 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-foreground">
                      {t("nav.guest")}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t("nav.guestHint")}
                    </span>
                  </span>
                </Link>
              )}

              {/* ===== 主导航列表 ===== */}
              {navItems.map((item) => (
                <Link
                  key={item.key}
                  href={localePath(item.href)}
                  transitionTypes={navTransitionTypes(pathname, locale, item.href)}
                  onClick={handleDrawerNavigate}
                  className={cn(
                    "px-4 py-3 min-h-11 rounded-md text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "text-primary bg-secondary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {t(item.key)}
                </Link>
              ))}

              {/* 「社区」折叠父项 */}
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setCommunityOpen((v) => !v)}
                  aria-expanded={communityOpen}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 min-h-11 rounded-md text-sm font-medium transition-colors",
                    communityActive
                      ? "text-primary bg-secondary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <span>{t("nav.community")}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      communityOpen && "rotate-180"
                    )}
                  />
                </button>
                <div
                  aria-hidden={!communityOpen}
                  className={cn(
                    "grid transition-[grid-template-rows] motion-reduce:transition-none",
                    communityOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden min-h-0">
                    <div className="ml-2 pl-3 border-l-2 border-border flex flex-col gap-1 py-1">
                      {communityItems.map((item) => (
                        <Link
                          key={item.key}
                          href={localePath(item.href)}
                          transitionTypes={navTransitionTypes(pathname, locale, item.href)}
                          tabIndex={communityOpen ? undefined : -1}
                          onClick={handleDrawerNavigate}
                          className={cn(
                            "px-3 py-2.5 min-h-11 flex items-center rounded-md text-sm transition-colors",
                            isActive(item.href)
                              ? "text-primary bg-secondary font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                        >
                          {t(item.key)}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {tailItems.map((item) => (
                <Link
                  key={item.key}
                  href={localePath(item.href)}
                  transitionTypes={navTransitionTypes(pathname, locale, item.href)}
                  onClick={handleDrawerNavigate}
                  className={cn(
                    "px-4 py-3 min-h-11 rounded-md text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "text-primary bg-secondary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {t(item.key)}
                </Link>
              ))}

              {/* ===== 分隔线 + 快捷设置折叠下拉 ===== */}
              <div className="border-t border-border my-1" />
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setSettingsOpen((v) => !v)}
                  aria-expanded={settingsOpen}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 min-h-11 rounded-md text-sm font-medium transition-colors",
                    settingsOpen
                      ? "text-primary bg-secondary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <span>{t("nav.quickSettings")}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      settingsOpen && "rotate-180"
                    )}
                  />
                </button>

                <div
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
                            onClick={() => applyMode("light")}
                            className={cn(
                              "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 min-h-11 text-xs font-medium transition-colors",
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
                            onClick={() => applyMode("dark")}
                            className={cn(
                              "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 min-h-11 text-xs font-medium transition-colors",
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
                                "rounded-md border px-3 py-2.5 min-h-11 text-xs font-medium transition-colors",
                                locale === loc
                                  ? "border-primary bg-secondary text-primary"
                                  : "border-border text-muted-foreground hover:bg-muted"
                              )}
                            >
                              {localeDisplayName(loc)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </nav>

            {/* ===== 底部：仅登录用户显示「前往设置」 ===== */}
            {loggedIn && (
              <div className="p-4 border-t border-border shrink-0">
                <Link
                  href={localePath("/setting")}
                  onClick={handleDrawerNavigate}
                  className="flex items-center gap-3 px-4 py-3 min-h-11 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
                >
                  <SettingsIcon className="h-4 w-4" />
                  {t("nav.goToSettings")}
                </Link>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
