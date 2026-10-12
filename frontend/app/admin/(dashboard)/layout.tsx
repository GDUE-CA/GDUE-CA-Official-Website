"use client";

/**
 * /admin/(dashboard) 布局：侧边栏 + 顶栏 + 内容区
 * - 客户端组件，挂载时向后端校验登录态（/api/auth/me），禁止匿名访问：
 *   未登录 / 会话失效 → /admin/login；须改初始密码 → /admin/change-password；
 *   普通成员（无后台权限）→ 前台个人资料页
 * - 侧边栏按模块级有效权限（角色默认 + permission_overrides）显隐入口
 *   （仅界面层；接口权限由后端强制校验）
 * - 顶部显示当前用户名 + 退出登录
 * - 侧边栏含概览/活动/审核中心/人员/设置入口
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Bell,
  CalendarDays,
  ClipboardList,
  UserCircle,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  ExternalLink,
  ShieldCheck,
  Megaphone,
  FileText,
  Newspaper,
  UsersRound,
  UserPlus,
  MessageSquare,
  KeyRound,
  Fingerprint,
  BadgeCheck,
  FileImage,
  Globe,
  ShieldBan,
  ScrollText,
  Eye,
  ChevronRight,
  Trash2,
  FolderOpen,
  Puzzle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { useAdminLocale } from "@/app/admin/AdminProviders";
import { locales, localeNames, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { BanModal } from "@/components/shared/BanModal";
import { fetchMe } from "@/lib/api/auth";
import { fetchOverview } from "@/lib/api/adminStats";
import { API_BASE_URL, ApiError } from "@/lib/api/client";
import { clearLocalSession, isAdminRole, logout, saveSession, type AdminSession } from "@/lib/auth";
import {
  hasPermission,
  type PermissionModule,
  type PermissionOverrides,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";

type NavItem = {
  key: string;
  href?: string;
  icon: typeof LayoutDashboard;
  /** 任一列出模块具有 view 权限即可见；缺省 = 恒可见 */
  modules?: PermissionModule[];
  /** 占位条目：对应功能页面尚未实现，渲染为不可点击的「敬请期待」样式 */
  placeholder?: boolean;
};

type NavGroup = {
  /** 分组标题 i18n key；缺省 = 无标题组（置顶概览） */
  labelKey?: string;
  /** 是否可折叠；概览组不可折叠 */
  collapsible?: boolean;
  /** 角色守卫：设为 "admin" 时非管理员整组完全隐藏（不置灰） */
  roleGuard?: "admin";
  items: NavItem[];
};

/** 侧边栏条目可见性：按有效权限判定 */
function canAccess(
  item: NavItem,
  permCtx: { role: string; overrides: PermissionOverrides | null } | null
): boolean {
  if (!item.modules || item.modules.length === 0) return true;
  if (!permCtx) return false;
  return item.modules.some((m) => hasPermission(permCtx.role, permCtx.overrides, m, "view"));
}

/**
 * 侧边栏分组（对齐需求四：概览 / 内容管理 / 资源与文件 / 系统管理 / 应用与扩展）。
 * - 概览组无标题、不可折叠
 * - 内容管理 / 资源与文件 / 系统管理 / 应用与扩展 可折叠，状态存 localStorage
 * - 系统管理组非管理员整组隐藏（不置灰）
 */
const navGroups: NavGroup[] = [
  // 无标题组：概览
  {
    items: [
      { key: "admin.dashboard.overview", href: "/admin/dashboard", icon: LayoutDashboard, modules: ["dashboard"] },
      // 消息通知管理：独立管理页尚未实现，占位
      { key: "admin.dashboard.notifications", icon: Bell, placeholder: true },
    ],
  },
  {
    labelKey: "admin.navGroup.content",
    collapsible: true,
    items: [
      { key: "admin.dashboard.announcements", href: "/admin/announcements", icon: Megaphone, modules: ["announcements"] },
      { key: "admin.dashboard.activities", href: "/admin/activities", icon: CalendarDays, modules: ["activities"] },
      { key: "admin.dashboard.blog", href: "/admin/blog", icon: Newspaper, modules: ["blog"] },
      { key: "admin.dashboard.docs", href: "/admin/content/club-intro", icon: FileText, modules: ["content"] },
      { key: "admin.dashboard.members", href: "/admin/members", icon: UsersRound, modules: ["members"] },
      { key: "admin.dashboard.recruitment", href: "/admin/recruitment", icon: UserPlus, modules: ["recruitment"] },
      { key: "admin.dashboard.comments", href: "/admin/blog/comments", icon: MessageSquare, modules: ["comments"] },
      // 内容回收站：统一收纳所有软删除资源（用户、活动），30 天后定时物理删除
      { key: "admin.dashboard.recycle", href: "/admin/recycle", icon: Trash2 },
    ],
  },
  {
    labelKey: "admin.navGroup.media",
    collapsible: true,
    items: [
      { key: "admin.dashboard.media", href: "/admin/media", icon: FolderOpen, modules: ["media"] },
      // 媒体素材库：独立页面尚未实现，占位
      { key: "admin.dashboard.mediaLibrary", icon: FileImage, placeholder: true },
    ],
  },
  {
    labelKey: "admin.navGroup.system",
    collapsible: true,
    roleGuard: "admin",
    items: [
      { key: "admin.dashboard.users", href: "/admin/users", icon: Users, modules: ["users"] },
      { key: "admin.dashboard.siteGlobalSettings", href: "/admin/settings", icon: Settings, modules: ["settings"] },
      { key: "admin.dashboard.securityNetwork", href: "/admin/security/network", icon: Globe, modules: ["security"] },
      { key: "admin.dashboard.securityIpWhitelist", href: "/admin/security/ip-whitelist", icon: ShieldCheck, modules: ["security"] },
      { key: "admin.dashboard.securityIpBlacklist", href: "/admin/security/ip-blacklist", icon: ShieldBan, modules: ["security"] },
      { key: "admin.dashboard.securityBans", href: "/admin/security/bans", icon: ShieldBan, modules: ["security"] },
      { key: "admin.dashboard.auditLogs", href: "/admin/audit-logs", icon: ScrollText, modules: ["audit_logs"] },
      { key: "admin.dashboard.oauth", href: "/admin/oauth", icon: KeyRound, modules: ["oauth"] },
      { key: "admin.dashboard.sso", href: "/admin/sso", icon: Fingerprint, modules: ["sso"] },
      { key: "admin.dashboard.realname", href: "/admin/realname-review", icon: BadgeCheck, modules: ["realname"] },
      {
        key: "admin.dashboard.review",
        href: "/admin/review",
        icon: ClipboardList,
        modules: ["review.registrations", "review.bugs", "review.resets"],
      },
      { key: "admin.stats.visits.title", href: "/admin/stats/visits", icon: Eye, modules: ["stats"] },
    ],
  },
  {
    labelKey: "admin.navGroup.extensions",
    collapsible: true,
    items: [],
  },
];

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t, locale } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [permCtx, setPermCtx] = useState<{
    role: string;
    overrides: PermissionOverrides | null;
  } | null>(null);
  const [checked, setChecked] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // Break-Glass 应急账号标记：启用三层警告 UI（顶部红条 + 侧栏红标）
  const [isBreakGlass, setIsBreakGlass] = useState(false);

  /** 路由守卫：以后端校验结果为准（本地缓存可被篡改，不能作为授权依据） */
  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (cancelled) return;
        const s = {
          username: me.username,
          role: me.role,
          realnameVerified: me.realname_verified,
        };
        saveSession(s);
        if (me.must_change_password) {
          router.replace(lp("/admin/change-password"));
          return;
        }
        // Break-Glass 应急账号 + 系统未初始化 → 强制进入初始化向导
        if (me.is_break_glass && me.must_setup) {
          router.replace(lp("/admin/setup"));
          return;
        }
        // 标记 BG 会话，启用顶部红条 + 侧栏红标（系统已初始化后）
        if (me.is_break_glass) {
          setIsBreakGlass(true);
        }
        if (!isAdminRole(me.role)) {
          // 已登录但无后台权限：渲染 403（账号设置独立于后台，入口在 /setting）
          setForbidden(true);
          return;
        }
        // 实名守卫（Phase 6）：admin/editor 未实名禁止进后台（super_admin 豁免）
        if (
          me.role !== "super_admin" &&
          !me.realname_verified
        ) {
          router.replace(lp("/admin/realname"));
          return;
        }
        setSession(s);
        setPermCtx({ role: me.role, overrides: me.permission_overrides ?? null });
        if (me.avatar_url) {
          const base = API_BASE_URL.replace(/\/+$/, "");
          setAvatarUrl(
            me.avatar_url.startsWith("http")
              ? me.avatar_url
              : me.avatar_url.startsWith("/")
                ? `${base}${me.avatar_url}`
                : `${base}/${me.avatar_url}`
          );
        } else {
          setAvatarUrl(null);
        }
        setChecked(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) clearLocalSession();
        router.replace(lp("/admin/login"));
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  /** 退出登录 */
  async function handleLogout() {
    await logout();
    router.replace(lp("/admin/login"));
  }

  /** 菜单项激活判断 */
  function isActive(href: string) {
    return pathname.startsWith(href);
  }

  // 非管理员访问后台：403 Forbidden（后台与账号设置是两套独立系统）
  if (forbidden) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20 px-4">
        <div className="w-full max-w-md text-center bg-background border border-border rounded-xl shadow-sm p-10">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-5">
            <ShieldBan className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold mb-2">
            {t("admin.dashboard.forbidden.title")}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            {t("admin.dashboard.forbidden.description")}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button asChild>
              <Link href={lp("/setting/profile")}>
                <UserCircle className="h-4 w-4 mr-1.5" />
                {t("admin.dashboard.forbidden.goSetting")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/${locale}`}>
                <ExternalLink className="h-4 w-4 mr-1.5" />
                {t("admin.dashboard.forbidden.backHome")}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 等待登录态校验完成，避免闪烁未授权内容
  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-muted/20">
      <BanModal />
      {/* 桌面端侧边栏 */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 border-r border-border bg-background">
        <SidebarContent
          t={t}
          session={session}
          avatarUrl={avatarUrl}
          permCtx={permCtx}
          isActive={isActive}
          onLogout={handleLogout}
          isBreakGlass={isBreakGlass}
        />
      </aside>

      {/* 移动端抽屉 */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-40 bg-black/50"
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border flex flex-col"
            >
              <SidebarContent
                t={t}
                session={session}
                avatarUrl={avatarUrl}
                permCtx={permCtx}
                isActive={isActive}
                onLogout={handleLogout}
                onNavigate={() => setMobileNavOpen(false)}
                isBreakGlass={isBreakGlass}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* 主区域（min-w-0 防止内容过宽把顶栏撑出视口） */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen min-w-0">
        {/* Layer 1: Break-Glass 顶部红条警告（仅系统已初始化后的 BG 会话显示） */}
        {isBreakGlass && (
          <div className="bg-destructive text-destructive-foreground text-center text-sm font-medium px-4 py-2">
            {t("admin.breakGlass.bannerWarning")}
          </div>
        )}
        {/* Layer 3: Break-Glass 高危操作确认弹窗 —— 由各业务页面对具体高危动作
            （如删除管理员、清空数据等）按需各自实现，本布局不全局拦截 */}
        {/* 顶栏 */}
        <header className="h-14 border-b border-border bg-background/80 backdrop-blur-md flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="font-display font-bold text-sm">
              {t("admin.dashboard.title")}
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <PendingBadge />
            <ThemeToggle />
            <LocaleSelect />
            <Button asChild variant="ghost" size="sm">
              <Link href={`/${locale}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">{t("admin.login.backToSite")}</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">{t("admin.dashboard.logout")}</span>
            </Button>
          </div>
        </header>

        {/* 内容区 */}
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

/** 顶栏待办铃铛：待审报名 + 未关 Bug + 待处理重置，复用 overview 聚合（失败静默，点击直达审核中心） */
function PendingBadge() {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const [count, setCount] = useState(0);
  useEffect(() => {
    fetchOverview()
      .then((o) => setCount(o.registrations_pending + o.bugs_open + o.resets_pending))
      .catch(() => {});
  }, []);
  return (
    <Button asChild variant="ghost" size="icon" aria-label={t("admin.dashboard.pendingTodos")}>
      <Link href={lp("/admin/review")} className="relative">
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}

/** 顶栏语言切换（localStorage 持久化，切换后全后台即时生效） */
function LocaleSelect() {
  const { locale, setLocale } = useAdminLocale();
  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      aria-label="Language"
      className="h-8 rounded-md border border-input bg-background px-1.5 text-xs font-medium"
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {localeNames[l]}
        </option>
      ))}
    </select>
  );
}

/** 侧边栏内容（桌面与移动复用） */
const COLLAPSE_STORAGE_KEY = "admin-sidebar-collapsed";

function SidebarContent({
  t,
  session,
  avatarUrl,
  permCtx,
  isActive,
  onLogout,
  onNavigate,
  isBreakGlass,
}: {
  t: (k: string) => string;
  session: AdminSession | null;
  avatarUrl: string | null;
  permCtx: { role: string; overrides: PermissionOverrides | null } | null;
  isActive: (h: string) => boolean;
  onLogout: () => void;
  onNavigate?: () => void;
  isBreakGlass?: boolean;
}) {
  const lp = useLocalizedPath();
  // 折叠状态：收起的分组 labelKey 集合，存 localStorage
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  function toggleGroup(labelKey: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(labelKey)) next.delete(labelKey);
      else next.add(labelKey);
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const isAdmin = permCtx ? isAdminRole(permCtx.role) : false;

  /** 按权限 + 角色守卫过滤后的分组（空组整组隐藏，但保留可折叠的空占位组如「应用与扩展」）
   *  item.href 在此统一本地化为 /{locale}/admin/...，使 isActive(pathname 比较) 与 <Link href> 一致 */
  const visibleGroups = navGroups
    .filter((g) => !g.roleGuard || isAdmin)
    .map((g) => ({
      ...g,
      items: g.items
        .filter((it) => canAccess(it, permCtx))
        .map((it) => (it.href ? { ...it, href: lp(it.href) } : it)),
    }))
    .filter((g) => g.items.length > 0 || g.collapsible);

  /** 激活项 = 可见项中与当前路径匹配的最长前缀 */
  const activeHref = visibleGroups
    .flatMap((g) => g.items)
    .filter((it): it is NavItem & { href: string } => !!it.href && !it.placeholder && isActive(it.href))
    .reduce((best, it) => (it.href.length > best.length ? it.href : best), "");

  /** 渲染单个导航项 */
  function renderNavItem(item: NavItem) {
    // 占位条目：功能页面未实现，不可点击
    if (item.placeholder || !item.href) {
      return (
        <span
          key={item.key}
          title={t("admin.common.comingSoon")}
          aria-disabled="true"
          className="inline-flex items-center justify-start gap-2 whitespace-nowrap rounded-md text-sm font-medium w-full px-3 h-8 text-muted-foreground/50 cursor-not-allowed select-none"
        >
          <item.icon className="h-4 w-4" />
          {t(item.key)}
        </span>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
          "hover:bg-accent hover:text-accent-foreground",
          "justify-start w-full px-3 h-8",
          item.href === activeHref
            ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
            : "text-muted-foreground"
        )}
      >
        <item.icon className="h-4 w-4" />
        {t(item.key)}
      </Link>
    );
  }

  return (
    <>
      <div className="h-14 flex items-center justify-between px-4 border-b border-border">
        <span className="font-display font-bold text-sm">GDUECA Admin</span>
        {onNavigate && (
          <Button variant="ghost" size="icon" onClick={onNavigate} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {visibleGroups.map((group, gi) => {
          const groupKey = group.labelKey ?? `group-${gi}`;
          const isCollapsed = group.labelKey ? collapsed.has(group.labelKey) : false;
          return (
            <div key={groupKey} className="space-y-1">
              {group.labelKey ? (
                <button
                  type="button"
                  onClick={() => group.collapsible && toggleGroup(group.labelKey!)}
                  className="w-full flex items-center justify-between px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground/80 select-none hover:text-muted-foreground"
                >
                  <span>{t(group.labelKey)}</span>
                  {group.collapsible && (
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        isCollapsed ? "" : "rotate-90"
                      )}
                    />
                  )}
                </button>
              ) : null}
              {!isCollapsed && (
                group.items.length > 0 ? (
                  <div className="space-y-0.5">{group.items.map(renderNavItem)}</div>
                ) : (
                  <div className="px-3 py-2 text-xs text-muted-foreground/60 italic">
                    <Puzzle className="h-3.5 w-3.5 inline mr-1 align-text-bottom" />
                    {t("admin.common.comingSoon")}
                  </div>
                )
              )}
            </div>
          );
        })}
      </nav>
      {/* 底部固定区：头像 + 用户名 → /setting/profile；所有登录用户可见 */}
      <div className="p-3 border-t border-border">
        <Link
          href={lp("/setting/profile")}
          onClick={onNavigate}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted mb-1"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={session?.username ?? "avatar"}
              className="h-6 w-6 shrink-0 rounded-full object-cover bg-secondary"
            />
          ) : (
            <UserCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">{t("admin.dashboard.welcome")}</div>
            <div className="font-medium text-foreground truncate flex items-center gap-1.5">
              <span className="truncate">{session?.username ?? "admin"}</span>
              {/* Layer 2: BG 侧栏红标 */}
              {isBreakGlass && (
                <span className="shrink-0 inline-flex items-center rounded-md bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                  {t("admin.breakGlass.sidebarLabel")}
                </span>
              )}
            </div>
          </div>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="w-full justify-start"
        >
          <LogOut className="h-4 w-4 mr-2" />
          {t("admin.dashboard.logout")}
        </Button>
      </div>
    </>
  );
}
