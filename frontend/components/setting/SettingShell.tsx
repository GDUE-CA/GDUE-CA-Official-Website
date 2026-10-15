"use client";

/**
 * SettingShell —— 个人设置整体框架（参考微信设置，2026-10 菜单重构版）
 *
 * 一级菜单（左栏，共 9 项）：
 *   个人资料 / 账号与安全 / 隐私设置 / 通知设置 / 界面与显示 /
 *   存储与缓存 / 授权管理 / 数据管理 / 关于本站
 * 管理员末尾额外显示「系统管理」分组（普通用户隐藏），子项跳转 /admin 后台。
 *
 * 布局规则（v0.5.2 阶段 2：桌面端界面学 /admin，用户决策定稿）：
 * - 桌面端：Admin 式单侧边栏（一级分组点击垂直展开二级子项下拉，绝不新开第二列）+ 右侧内容区；
 *   Microsoft / Apple 两种风格主题仅视觉差异
 * - 移动端：iOS 式层级跳转（一级列表 → 二级列表 → 内容；单子项分组点击直接进内容），保持不变
 * - Tab 切换经 useDirtyGuard().guardNavigate 接管：有未保存修改时弹确认框
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import User from "@/assets/icons/user/user.svg";
import ShieldCheck from "@/assets/icons/status/shield-check.svg";
import Lock from "@/assets/icons/status/lock.svg";
import Bell from "@/assets/icons/status/bell.svg";
import Palette from "@/assets/icons/status/palette.svg";
import HardDrive from "@/assets/icons/status/hard-drive.svg";
import KeyRound from "@/assets/icons/status/key-round.svg";
import Database from "@/assets/icons/status/database.svg";
import Info from "@/assets/icons/status/info.svg";
import Settings from "@/assets/icons/navigation/settings.svg";
import LockKeyhole from "@/assets/icons/status/lock-keyhole.svg";
import Smartphone from "@/assets/icons/status/smartphone.svg";
import Mail from "@/assets/icons/status/mail.svg";
import MonitorSmartphone from "@/assets/icons/status/monitor-smartphone.svg";
import HeartPulse from "@/assets/icons/status/heart-pulse.svg";
import SlidersHorizontal from "@/assets/icons/action/sliders-horizontal.svg";
import Ban from "@/assets/icons/status/ban.svg";
import Download from "@/assets/icons/action/download.svg";
import UserX from "@/assets/icons/user/user-x.svg";
import LayoutDashboard from "@/assets/icons/navigation/layout-dashboard.svg";
import Users from "@/assets/icons/user/users.svg";
import UserCog from "@/assets/icons/user/user-cog.svg";
import FileText from "@/assets/icons/status/file-text.svg";
import ScrollText from "@/assets/icons/status/scroll-text.svg";
import Megaphone from "@/assets/icons/status/megaphone.svg";
import ChevronLeft from "@/assets/icons/navigation/chevron-left.svg";
import ChevronRight from "@/assets/icons/navigation/chevron-right.svg";
import ExternalLink from "@/assets/icons/navigation/external-link.svg";
import type { IconComponent } from "@/types/icons";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { useDirtyGuard } from "@/components/setting/SettingGuardContext";
import { useTheme } from "@/components/theme/ThemeProvider";
import { BrandMark } from "@/components/shared/BrandMark";
import { getSession, isAdminRole } from "@/lib/auth";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

interface SubItem {
  key: string;
  href: string;
  icon: IconComponent;
  /** 外链（跳出 /setting，前往 /admin 后台） */
  external?: boolean;
  /** 功能尚未上线（P1/P2），置灰展示 */
  disabled?: boolean;
}
interface Group {
  key: string;
  icon: IconComponent;
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

  // 桌面端当前下拉展开的一级分组 key（null=全部收起，手风琴式单开）；pathname 变化时跟随当前页所属分组
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(
    findActiveGroupKey()
  );
  // 移动端堆栈层级：0=一级列表，1=某分组的二级列表
  const [mobileLevel, setMobileLevel] = useState<0 | 1>(0);
  const [mobileGroupKey, setMobileGroupKey] = useState(findActiveGroupKey());

  // pathname 变化（进入内容页）→ 同步展开分组 + 重置移动堆栈
  useEffect(() => {
    const key = findActiveGroupKey();
    setExpandedGroupKey(key);
    setMobileLevel(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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

  /** 桌面端渲染二级子项（学 Admin renderSecondItem：下拉缩进列表内，垂直排列） */
  function renderDesktopItem(item: SubItem) {
    const active = isActive(item.href);
    const linkCls = cn(
      "inline-flex items-center justify-start gap-3 whitespace-nowrap rounded-sm text-[15px] leading-[1.2] font-medium transition-all duration-[180ms] ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-full px-[14px] py-[10px] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      item.disabled
        ? "opacity-45 cursor-not-allowed text-muted-foreground select-none"
        : "cursor-pointer hover:bg-sidebar-accent hover:text-accent-foreground",
      active &&
        !item.disabled &&
        "bg-primary text-primary-foreground font-semibold hover:bg-primary/90 hover:text-primary-foreground"
    );
    const inner = (
      <>
        <item.icon className="h-4 w-4" />
        <span className="truncate">{t(item.key)}</span>
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
  }

  /** 桌面端渲染一级分组（学 Admin renderFirstItem 展开模式）：
   * 多子项=点击展开/收起垂直下拉；单子项=直接链接（Admin「无二级直达」同款） */
  function renderDesktopGroup(g: (typeof groups)[number]) {
    const active = g.key === findActiveGroupKey();
    const isExpanded = expandedGroupKey === g.key;

    // 单子项分组：直接渲染为链接；子项置灰（P1/P2 未上线）时整体置灰不可点
    if (g.items.length === 1) {
      const item = g.items[0];
      const cls = cn(
        "inline-flex items-center justify-start gap-3 whitespace-nowrap rounded-sm text-[15px] leading-[1.2] font-semibold transition-all duration-[180ms] ease-in-out w-full px-[14px] py-[10px] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        g.adminOnly && "mt-4 pt-3 border-t border-border/60",
        item.disabled
          ? "opacity-45 cursor-not-allowed text-muted-foreground select-none"
          : "cursor-pointer hover:bg-sidebar-accent hover:text-accent-foreground",
        !item.disabled &&
          active &&
          "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
      );
      const inner = (
        <>
          <g.icon className="h-4 w-4" />
          <span className="truncate">{t(g.key)}</span>
          {item.external && <ExternalLink className="h-3 w-3 opacity-60" />}
        </>
      );
      return item.disabled ? (
        <span key={g.key} title={t("setting.comingSoon")} className={cls} aria-disabled>
          {inner}
        </span>
      ) : (
        <Link
          key={g.key}
          href={item.href}
          onClick={(e) => handleNavClick(e, item)}
          aria-current={active ? "page" : undefined}
          title={t(g.key)}
          className={cls}
        >
          {inner}
        </Link>
      );
    }

    // 多子项分组：点击展开/收起子菜单垂直向下（绝不新开第二列）
    return (
      <div key={g.key} className="space-y-0.5">
        <button
          type="button"
          title={t(g.key)}
          onClick={() => setExpandedGroupKey((v) => (v === g.key ? null : g.key))}
          className={cn(
            "inline-flex items-center justify-start gap-3 whitespace-nowrap rounded-sm text-[15px] leading-[1.2] font-semibold transition-all duration-[180ms] ease-in-out w-full px-[14px] py-[10px] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
            g.adminOnly && "mt-4 pt-3 border-t border-border/60",
            apple
              ? active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-accent-foreground"
              : active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-sidebar-accent hover:text-accent-foreground"
          )}
        >
          <g.icon className="h-4 w-4" />
          <span className="truncate">{t(g.key)}</span>
          <ChevronRight
            className={cn(
              "ml-auto h-4 w-4 transition-transform duration-[180ms]",
              isExpanded && "rotate-90"
            )}
          />
        </button>
        {/* 二级子项下拉：垂直向下展开（缩进 + 左侧竖线，学 Admin） */}
        {isExpanded && (
          <div className="pl-3 mt-0.5 space-y-0.5 border-l border-border ml-3">
            {g.items.map(renderDesktopItem)}
          </div>
        )}
      </div>
    );
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

      {/* ============ 桌面端（md+）：Admin 式单侧边栏（二级菜单内嵌下拉）+ 右侧内容区 ============ */}
      <div className="hidden md:flex min-h-[calc(100vh-3rem)]">
        {/* 左侧单一侧边栏：一级分组点击垂直展开二级子项，绝不新开第二列 */}
        <aside
          className={cn(
            "shrink-0 sticky top-12 h-[calc(100vh-3rem)] border-r border-border bg-sidebar flex flex-col",
            apple ? "w-52" : "w-64"
          )}
        >
          <nav
            className="flex-1 py-3 px-3 overflow-y-auto"
            aria-label={t("nav.settings")}
          >
            <div className="space-y-0.5">{groups.map(renderDesktopGroup)}</div>
          </nav>
        </aside>

        {/* 右侧内容区（页面内容外边距固定 24px） */}
        <main className="flex-1 min-w-0 p-6 overflow-y-auto">
          <div className="max-w-2xl mx-auto">{children}</div>
          {/* 项目版本号（页面底部，读取全局常量，禁止硬编码） */}
          <p className="mt-10 text-center text-xs text-muted-foreground/70 font-mono">
            {APP_VERSION}
          </p>
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
            <main className="flex-1 overflow-y-auto p-4">
              {children}
              {/* 项目版本号（页面底部） */}
              <p className="mt-10 pb-4 text-center text-xs text-muted-foreground/70 font-mono">
                {APP_VERSION}
              </p>
            </main>
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
