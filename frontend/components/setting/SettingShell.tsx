"use client";

/**
 * SettingShell —— 个人设置整体框架（参考微信设置，2026-10 菜单重构版）
 *
 * 一级菜单（左栏，共 9 项）：
 *   个人资料 / 账号与安全 / 隐私设置 / 通知设置 / 界面与显示 /
 *   存储与缓存 / 授权管理 / 数据管理 / 关于本站
 * 管理员末尾额外显示「系统管理」分组（普通用户隐藏），子项跳转 /admin 后台。
 *
 * 布局规则：
 * - 桌面端：统一三栏（一级 → 二级 → 内容）；Microsoft / Apple 两种风格主题仅视觉差异
 * - 移动端：iOS 式层级跳转（一级列表 → 二级列表 → 内容；单子项分组点击直接进内容）
 * - Tab 切换经 useDirtyGuard().guardNavigate 接管：有未保存修改时弹确认框
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  ShieldCheck,
  Lock,
  Bell,
  Palette,
  HardDrive,
  KeyRound,
  Database,
  Info,
  Settings,
  LockKeyhole,
  Smartphone,
  Mail,
  MonitorSmartphone,
  HeartPulse,
  SlidersHorizontal,
  Ban,
  Download,
  UserX,
  LayoutDashboard,
  Users,
  UserCog,
  FileText,
  ScrollText,
  Megaphone,
  ChevronLeft,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { useDirtyGuard } from "@/components/setting/SettingGuardContext";
import { useTheme } from "@/components/theme/ThemeProvider";
import { BrandMark } from "@/components/shared/BrandMark";
import { getSession, isAdminRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface SubItem {
  key: string;
  href: string;
  icon: LucideIcon;
  /** 外链（跳出 /setting，前往 /admin 后台） */
  external?: boolean;
  /** 功能尚未上线（P1/P2），置灰展示 */
  disabled?: boolean;
}
interface Group {
  key: string;
  icon: LucideIcon;
  items: SubItem[];
  /** 管理员专属分组 */
  adminOnly?: boolean;
}

const GROUPS: Group[] = [
  {
    key: "setting.group.profile",
    icon: User,
    items: [{ key: "setting.tabs.profile", href: "/setting/profile", icon: User }],
  },
  {
    key: "setting.group.security",
    icon: ShieldCheck,
    items: [
      { key: "setting.tabs.password", href: "/setting/security", icon: LockKeyhole },
      { key: "setting.tabs.phone", href: "/setting/security/phone", icon: Smartphone },
      { key: "setting.tabs.email", href: "/setting/security/email", icon: Mail },
      { key: "setting.tabs.sessions", href: "/setting/sessions", icon: MonitorSmartphone },
      { key: "setting.tabs.totp", href: "/setting/security/totp", icon: ShieldCheck, disabled: true },
      {
        key: "setting.tabs.emergencyContact",
        href: "/setting/security/emergency-contact",
        icon: HeartPulse,
        disabled: true,
      },
    ],
  },
  {
    key: "setting.group.privacy",
    icon: Lock,
    items: [
      { key: "setting.tabs.privacy", href: "/setting/privacy", icon: SlidersHorizontal },
      { key: "setting.tabs.blocks", href: "/setting/privacy/blocks", icon: Ban },
    ],
  },
  {
    key: "setting.group.notifications",
    icon: Bell,
    items: [{ key: "setting.tabs.notifications", href: "/setting/notifications", icon: Bell }],
  },
  {
    key: "setting.group.display",
    icon: Palette,
    items: [{ key: "setting.tabs.display", href: "/setting/display", icon: Palette }],
  },
  {
    key: "setting.group.storage",
    icon: HardDrive,
    items: [{ key: "setting.tabs.storage", href: "/setting/storage", icon: HardDrive }],
  },
  {
    key: "setting.group.oauth",
    icon: KeyRound,
    items: [{ key: "setting.tabs.connections", href: "/setting/connections", icon: KeyRound }],
  },
  {
    key: "setting.group.data",
    icon: Database,
    items: [
      { key: "setting.tabs.dataExport", href: "/setting/data/export", icon: Download, disabled: true },
      { key: "setting.tabs.dataDelete", href: "/setting/data/delete", icon: UserX, disabled: true },
    ],
  },
  {
    key: "setting.group.about",
    icon: Info,
    items: [{ key: "setting.tabs.about", href: "/setting/about", icon: Info }],
  },
  // —— 管理员专属：系统管理（子项全部外链到独立后台 /admin） ——
  {
    key: "setting.group.system",
    icon: Settings,
    adminOnly: true,
    items: [
      { key: "setting.system.dashboard", href: "/admin/dashboard", icon: LayoutDashboard, external: true },
      { key: "setting.system.users", href: "/admin/users", icon: Users, external: true },
      { key: "setting.system.roles", href: "/admin/security/access-control", icon: UserCog, external: true },
      { key: "setting.system.content", href: "/admin/memo", icon: FileText, external: true },
      { key: "setting.system.config", href: "/admin/settings", icon: Settings, external: true },
      { key: "setting.system.audit", href: "/admin/audit-logs", icon: ScrollText, external: true },
      { key: "setting.system.announcements", href: "/admin/announcements", icon: Megaphone, external: true },
      { key: "setting.system.themes", href: "/admin/themes", icon: Palette, external: true },
    ],
  },
];

export function SettingShell({ children }: { children: React.ReactNode }) {
  const { t, locale } = useI18n();
  const { layout } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { guardNavigate } = useDirtyGuard();
  const lp = useLocalizedPath();

  const session = getSession();
  const adminVisible = isAdminRole(session?.role);

  // 本地化所有 href；按角色过滤管理员分组
  const groups = GROUPS.filter((g) => !g.adminOnly || adminVisible).map((g) => ({
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
  // 移动端堆栈层级：0=一级列表，1=某分组的二级列表
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

  /** 导航点击接管：有未保存修改时 preventDefault 并弹确认框；disabled 项直接拦截 */
  function handleNavClick(
    e: React.MouseEvent<HTMLAnchorElement>,
    item: SubItem | { href: string; disabled?: boolean; external?: boolean }
  ) {
    if (item.disabled) {
      e.preventDefault();
      return;
    }
    if (pathname === item.href) return;
    e.preventDefault();
    guardNavigate(() => router.push(item.href));
  }

  /** 移动端点击一级分组：单子项直接进内容页；多子项推入二级列表 */
  function handleMobileGroup(g: (typeof groups)[number]) {
    if (g.items.length === 1) {
      const first = g.items[0];
      if (!first.disabled && !isActive(first.href)) {
        guardNavigate(() => router.push(first.href));
      }
    } else {
      setMobileGroupKey(g.key);
      setMobileLevel(1);
    }
  }

  /** 桌面 col1 点击分组：选中分组；单子项分组同时直接导航 */
  function handleGroupClick(g: (typeof groups)[number]) {
    setSelectedGroupKey(g.key);
    if (g.items.length === 1) {
      const first = g.items[0];
      if (!first.disabled && !isActive(first.href)) {
        guardNavigate(() => router.push(first.href));
      }
    }
  }

  /** 移动端内容页返回：多子项分组回二级列表，其余回一级列表 */
  function handleMobileBackFromContent() {
    const g = groups.find((grp) => grp.items.some((it) => isActive(it.href)));
    if (g && g.items.length > 1) {
      setMobileGroupKey(g.key);
      setMobileLevel(1);
    } else {
      setMobileLevel(0);
      router.push(lp("/setting"));
    }
  }

  /** 移动端是否在内容页（pathname 匹配某子项） */
  const inContentPage = groups.some((g) =>
    g.items.some((it) => isActive(it.href))
  );

  const apple = layout === "apple";

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

      {/* ============ 桌面端（md+）：统一三栏，风格主题驱动视觉差异 ============ */}
      <div className="hidden md:flex min-h-[calc(100vh-3rem)]">
        {/* col1: 一级菜单 */}
        <aside
          className={cn(
            "shrink-0 border-r border-border bg-sidebar p-3 flex flex-col",
            apple ? "w-52" : "w-56"
          )}
        >
          <nav className="space-y-1 flex-1 overflow-y-auto" aria-label={t("nav.settings")}>
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
                    g.adminOnly && "mt-4 pt-3 border-t border-border/60",
                    apple && active && "bg-primary text-primary-foreground font-semibold",
                    apple &&
                      !active &&
                      (isCurrentPageGroup
                        ? "bg-sidebar-accent text-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-accent-foreground"),
                    !apple &&
                      (active
                        ? "bg-sidebar-accent text-foreground font-semibold border-l-2 border-primary -ml-px pl-[13px]"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-accent-foreground border-l-2 border-transparent -ml-px pl-[13px]")
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
        <aside
          className={cn(
            "shrink-0 border-r border-border bg-sidebar p-3",
            apple ? "w-56" : "w-60"
          )}
        >
          <div className="mb-2 px-[14px] text-xs font-medium text-muted-foreground/80 truncate">
            {t(selectedGroup.key)}
          </div>
          <nav className="space-y-1">
            {selectedGroup.items.map((item) => {
              const active = isActive(item.href);
              const linkCls = cn(
                "inline-flex items-center justify-start gap-3 whitespace-nowrap rounded-sm text-[15px] leading-[1.2] transition-all duration-[180ms] ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-full px-[14px] py-[10px] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
                item.disabled
                  ? "opacity-45 cursor-not-allowed text-muted-foreground"
                  : "cursor-pointer",
                apple &&
                  (active
                    ? "bg-primary text-primary-foreground font-semibold hover:bg-primary/90 hover:text-primary-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-accent-foreground"),
                !apple &&
                  (active
                    ? "bg-sidebar-accent text-foreground font-medium border-l-2 border-primary -ml-px pl-[13px]"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 border-l-2 border-transparent -ml-px pl-[13px]")
              );
              const inner = (
                <>
                  <item.icon className="h-4 w-4" />
                  <span className="truncate flex-1 text-left">{t(item.key)}</span>
                  {item.disabled && (
                    <span className="text-[10px] rounded bg-muted px-1.5 py-0.5">
                      {t("setting.soonBadge")}
                    </span>
                  )}
                  {item.external && <ExternalLink className="h-3 w-3 opacity-60" />}
                </>
              );
              return item.disabled ? (
                <span key={item.href} title={t("setting.comingSoon")} className={linkCls} aria-disabled>
                  {inner}
                </span>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item)}
                  aria-current={active ? "page" : undefined}
                  title={t(item.key)}
                  className={linkCls}
                >
                  {inner}
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

      {/* ============ 移动端（<md）iOS 堆栈 ============ */}
      <div className="md:hidden min-h-[calc(100vh-3rem)] relative overflow-hidden">
        {/* 内容页：pathname 匹配某子项时显示 */}
        {inContentPage && (
          <div className="flex flex-col h-[calc(100vh-3rem)]">
            {/* 内容页顶部返回条 */}
            <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur flex items-center px-2 h-11">
              <button
                type="button"
                onClick={handleMobileBackFromContent}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline px-2 py-1 max-w-[70%]"
              >
                <ChevronLeft className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {t(
                    groups.find((grp) => grp.items.some((it) => isActive(it.href)))?.key ??
                      "nav.settings"
                  )}
                </span>
              </button>
            </div>
            <main className="flex-1 overflow-y-auto p-4">{children}</main>
          </div>
        )}

        {/* 堆栈导航：未在内容页时显示一级/二级列表 */}
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
                  {groups.map((g, idx) => (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => handleMobileGroup(g)}
                      className={cn(
                        "flex items-center gap-3 w-full px-3 py-3 hover:bg-muted transition-colors text-left border-b border-border/50",
                        g.adminOnly &&
                          idx > 0 &&
                          !groups[idx - 1]?.adminOnly &&
                          "mt-4 pt-5 border-t-2 border-border/60"
                      )}
                    >
                      <g.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 font-medium text-foreground">{t(g.key)}</span>
                      {g.items.length === 1 && g.items[0]?.disabled ? (
                        <span className="text-[10px] text-muted-foreground rounded bg-muted px-1.5 py-0.5">
                          {t("setting.soonBadge")}
                        </span>
                      ) : (
                        <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                      )}
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
                    {t("nav.settings")}
                  </button>
                  <div className="px-3 pb-1 text-xs font-medium text-muted-foreground/80">
                    {t(mobileGroupKey)}
                  </div>
                  {(groups.find((g) => g.key === mobileGroupKey)?.items ?? []).map((item) =>
                    item.disabled ? (
                      <span
                        key={item.href}
                        aria-disabled
                        className="flex items-center gap-3 w-full px-3 py-3 opacity-45 border-b border-border/50"
                      >
                        <item.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 text-muted-foreground">{t(item.key)}</span>
                        <span className="text-[10px] rounded bg-muted px-1.5 py-0.5">
                          {t("setting.soonBadge")}
                        </span>
                      </span>
                    ) : (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={(e) => handleNavClick(e, item)}
                        className="flex items-center gap-3 w-full px-3 py-3 rounded-md hover:bg-muted transition-colors border-b border-border/50"
                      >
                        <item.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 text-foreground">{t(item.key)}</span>
                        {item.external ? (
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                        )}
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
