"use client";

/**
 * SettingShell —— 个人设置整体框架（布局骨架由主题驱动）
 *
 * 规格第四部分：
 * - Apple 主题：桌面三栏（左一级分组+头像入口 / 中二级子项 / 右内容）
 * - 默认（微软）主题：桌面两栏（左侧全量分组导航 + 左下角账号入口 / 右侧内容）
 * - 移动端：iOS 堆栈导航（分组列表 → 推入子项列表 → 推入内容），两布局共用
 * - Tab 切换经 useDirtyGuard().guardNavigate 接管：有未保存修改时弹确认框
 *
 * 9 个子页路由不变，仅重组为 5 个分组：
 * 个人资料 / 本地化 / 外观 / 账号安全 / 通知
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  MapPin,
  CalendarClock,
  Palette,
  ShieldCheck,
  MonitorSmartphone,
  Link2,
  Bell,
  Globe,
  ChevronLeft,
  UserCircle,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { useDirtyGuard } from "@/components/setting/SettingGuardContext";
import { useTheme } from "@/components/theme/ThemeProvider";
import { BrandMark } from "@/components/shared/BrandMark";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface SubItem {
  key: string;
  href: string;
  icon: LucideIcon;
}
interface Group {
  key: string;
  icon: LucideIcon;
  items: SubItem[];
}

const GROUPS: Group[] = [
  {
    key: "setting.group.profile",
    icon: User,
    items: [
      { key: "setting.tabs.profile", href: "/setting/profile", icon: User },
      { key: "setting.tabs.privacy", href: "/setting/privacy", icon: Lock },
    ],
  },
  {
    key: "setting.group.localization",
    icon: Globe,
    items: [
      { key: "setting.tabs.localization", href: "/setting/localization", icon: Globe },
      { key: "setting.tabs.region", href: "/setting/region", icon: MapPin },
      { key: "setting.tabs.regionalFormat", href: "/setting/regional-format", icon: CalendarClock },
    ],
  },
  {
    key: "setting.group.appearance",
    icon: Palette,
    items: [{ key: "setting.tabs.appearance", href: "/setting/appearance", icon: Palette }],
  },
  {
    key: "setting.group.security",
    icon: ShieldCheck,
    items: [
      { key: "setting.tabs.security", href: "/setting/security", icon: ShieldCheck },
      { key: "setting.tabs.sessions", href: "/setting/sessions", icon: MonitorSmartphone },
      { key: "setting.tabs.connections", href: "/setting/connections", icon: Link2 },
    ],
  },
  {
    key: "setting.group.notifications",
    icon: Bell,
    items: [{ key: "setting.tabs.notifications", href: "/setting/notifications", icon: Bell }],
  },
];

export function SettingShell({ children }: { children: React.ReactNode }) {
  const { t, locale } = useI18n();
  const { layout } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { guardNavigate } = useDirtyGuard();
  const lp = useLocalizedPath();

  // 本地化所有 href
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.map((it) => ({ ...it, href: lp(it.href) })),
  }));
  const homeHref = `/${locale}`;

  /** 子项激活判断（基于 pathname 前缀） */
  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  /** pathname 推断的当前分组（含激活子项的分组） */
  function findActiveGroupKey(): string {
    const g = groups.find((grp) => grp.items.some((it) => isActive(it.href)));
    return g?.key ?? groups[0].key;
  }

  // 桌面端选中分组：pathname 变化时跟随当前页所属分组；用户点 col1 时临时切换
  const [selectedGroupKey, setSelectedGroupKey] = useState(findActiveGroupKey());
  // 移动端堆栈层级：0=分组列表，1=某分组的子项列表
  const [mobileLevel, setMobileLevel] = useState<0 | 1>(0);
  const [mobileGroupKey, setMobileGroupKey] = useState(findActiveGroupKey());

  // pathname 变化（进入内容页）→ 同步选中分组 + 重置移动堆栈
  useEffect(() => {
    const key = findActiveGroupKey();
    setSelectedGroupKey(key);
    setMobileLevel(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const selectedGroup =
    groups.find((g) => g.key === selectedGroupKey) ?? groups[0];

  /** 导航点击接管：有未保存修改时 preventDefault 并弹确认框 */
  function handleNavClick(
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) {
    if (pathname === href) return;
    e.preventDefault();
    guardNavigate(() => router.push(href));
  }

  /** 桌面 col1 点击分组：选中分组；若仅 1 子项则直接导航 */
  function handleGroupClick(g: (typeof groups)[number]) {
    setSelectedGroupKey(g.key);
    if (g.items.length === 1) {
      const first = g.items[0];
      if (first && !isActive(first.href)) {
        guardNavigate(() => router.push(first.href));
      }
    }
  }

  /** 移动端是否在内容页（pathname 匹配某子项） */
  const inContentPage = groups.some((g) =>
    g.items.some((it) => isActive(it.href))
  );

  const session = getSession();

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

      {/* ============ 桌面端（md+）：Apple 三栏 / 微软两栏 ============ */}
      {layout === "apple" ? (
      <div className="hidden md:flex min-h-[calc(100vh-3rem)]">
        {/* col1: 一级分组 + 左上角头像入口 */}
        <aside className="w-52 shrink-0 border-r border-border bg-sidebar p-3 flex flex-col">
          {/* 左上角头像 + 用户名入口（点击进个人资料）；分组间垂直留白分隔，不画分割横线 */}
          <Link
            href={lp("/setting/profile")}
            onClick={(e) => handleNavClick(e, lp("/setting/profile"))}
            title={session?.username ?? undefined}
            className="flex items-center gap-3 w-full px-[14px] py-[10px] rounded-sm hover:bg-sidebar-accent transition-all duration-[180ms] ease-in-out mb-3"
          >
            {session ? (
              <UserCircle className="h-8 w-8 shrink-0 text-muted-foreground" />
            ) : (
              <UserCircle className="h-8 w-8 shrink-0 text-muted-foreground" />
            )}
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[10px] text-muted-foreground">
                {t("admin.dashboard.welcome")}
              </div>
              <div className="font-medium text-foreground truncate">
                {session?.username ?? "—"}
              </div>
            </div>
          </Link>
          <nav className="space-y-1 flex-1" aria-label={t("nav.settings")}>
            {groups.map((g) => {
              const active = g.key === selectedGroupKey;
              const isCurrentPageGroup = g.key === findActiveGroupKey();
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => handleGroupClick(g)}
                  title={t(g.key)}
                  className={cn(
                    "inline-flex items-center justify-start gap-3 whitespace-nowrap rounded-sm text-[15px] leading-[1.2] transition-all duration-[180ms] ease-in-out w-full px-[14px] py-[10px] cursor-pointer",
                    active
                      ? "bg-primary text-primary-foreground font-semibold"
                      : isCurrentPageGroup
                        ? "bg-sidebar-accent text-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-accent-foreground"
                  )}
                >
                  <g.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t(g.key)}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* col2: 当前分组的二级子项 */}
        <aside className="w-56 shrink-0 border-r border-border bg-sidebar p-3">
          <div className="mb-2 px-[14px] text-xs font-medium text-muted-foreground/80">
            {t(selectedGroup.key)}
          </div>
          <nav className="space-y-1">
            {selectedGroup.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item.href)}
                  aria-current={active ? "page" : undefined}
                  title={t(item.key)}
                  className={cn(
                    "inline-flex items-center justify-start gap-3 whitespace-nowrap rounded-sm text-[15px] leading-[1.2] transition-all duration-[180ms] ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
                    "hover:bg-sidebar-accent hover:text-accent-foreground",
                    "w-full px-[14px] py-[10px]",
                    active
                      ? "bg-primary text-primary-foreground font-semibold hover:bg-primary/90 hover:text-primary-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="truncate">{t(item.key)}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* col3: 内容区（页面内容外边距固定 24px） */}
        <main className="flex-1 min-w-0 p-6 overflow-y-auto">
          <div className="max-w-2xl mx-auto">{children}</div>
        </main>
      </div>
      ) : (
      /* ============ 微软两栏：左侧全量分组导航 + 左下角账号入口 / 右侧内容 ============ */
      <div className="hidden md:flex min-h-[calc(100vh-3rem)]">
        <aside className="w-64 shrink-0 border-r border-border bg-sidebar p-3 flex flex-col">
          <nav className="space-y-4 flex-1" aria-label={t("nav.settings")}>
            {groups.map((g) => (
              <div key={g.key}>
                {/* 组标题小字；分组间垂直留白分隔，不画分割横线 */}
                <div
                  className="px-[14px] mb-1 text-xs font-medium text-muted-foreground/80 truncate"
                  title={t(g.key)}
                >
                  {t(g.key)}
                </div>
                <div className="space-y-1">
                  {g.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={(e) => handleNavClick(e, item.href)}
                        aria-current={active ? "page" : undefined}
                        title={t(item.key)}
                        className={cn(
                          "inline-flex items-center justify-start gap-3 whitespace-nowrap rounded-sm text-[15px] leading-[1.2] transition-all duration-[180ms] ease-in-out w-full px-[14px] py-[10px]",
                          active
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-muted-foreground hover:bg-sidebar-accent hover:text-accent-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{t(item.key)}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          {/* 左下角账号入口（微软设计：左下角头像+登录用户，点头像跳转个人设置） */}
          <Link
            href={lp("/setting/profile")}
            onClick={(e) => handleNavClick(e, lp("/setting/profile"))}
            title={session?.username ?? undefined}
            className="mt-3 flex items-center gap-3 w-full px-[14px] py-[10px] rounded-sm hover:bg-sidebar-accent transition-all duration-[180ms] ease-in-out"
          >
            <UserCircle className="h-8 w-8 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[10px] text-muted-foreground">
                {t("admin.dashboard.welcome")}
              </div>
              <div className="font-medium text-foreground truncate">
                {session?.username ?? "—"}
              </div>
            </div>
          </Link>
        </aside>

        {/* 内容区（页面内容外边距固定 24px） */}
        <main className="flex-1 min-w-0 p-6 overflow-y-auto">
          <div className="max-w-2xl mx-auto">{children}</div>
        </main>
      </div>
      )}

      {/* ============ 移动端 iOS 堆栈（<md） ============ */}
      <div className="md:hidden min-h-[calc(100vh-3rem)] relative overflow-hidden">
        {/* 内容页：pathname 匹配某子项时显示 */}
        {inContentPage && (
          <div className="flex flex-col h-[calc(100vh-3rem)]">
            {/* 内容页顶部返回条 */}
            <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur flex items-center px-2 h-11">
              <button
                type="button"
                onClick={() => {
                  setMobileLevel(0);
                  router.push(lp("/setting"));
                }}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline px-2 py-1"
              >
                <ChevronLeft className="h-4 w-4" />
                {t("nav.settings")}
              </button>
            </div>
            <main className="flex-1 overflow-y-auto p-4">
              {children}
            </main>
          </div>
        )}

        {/* 堆栈导航：未在内容页时显示分组/子项列表 */}
        {!inContentPage && (
          <div className="relative h-[calc(100vh-3rem)] overflow-hidden">
            <AnimatePresence initial={false}>
              {mobileLevel === 0 ? (
                <motion.nav
                  key="level0"
                  initial={{ x: 0 }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
                  className="absolute inset-0 overflow-y-auto p-2"
                  aria-label={t("nav.settings")}
                >
                  {groups.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => {
                        setMobileGroupKey(g.key);
                        setMobileLevel(1);
                      }}
                      className="flex items-center gap-3 w-full px-3 py-3 rounded-md hover:bg-muted transition-colors text-left border-b border-border/50"
                    >
                      <g.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 font-medium text-foreground">
                        {t(g.key)}
                      </span>
                      <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                    </button>
                  ))}
                </motion.nav>
              ) : (
                <motion.nav
                  key="level1"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
                  className="absolute inset-0 overflow-y-auto p-2"
                >
                  <button
                    type="button"
                    onClick={() => setMobileLevel(0)}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline px-2 py-2 mb-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t(
                      groups.find((g) => g.key === mobileGroupKey)?.key ??
                        "nav.settings"
                    )}
                  </button>
                  {(groups.find((g) => g.key === mobileGroupKey)?.items ?? []).map(
                    (item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={(e) => handleNavClick(e, item.href)}
                        className="flex items-center gap-3 w-full px-3 py-3 rounded-md hover:bg-muted transition-colors border-b border-border/50"
                      >
                        <item.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 text-foreground">
                          {t(item.key)}
                        </span>
                        <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                      </Link>
                    )
                  )}
                </motion.nav>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
