"use client";

/**
 * /admin/(dashboard) 布局：三栏式后台（对标 macOS 设置）
 * - 客户端组件，挂载时向后端校验登录态（/api/auth/me），禁止匿名访问：
 *   未登录 / 会话失效 → /login；须改初始密码 → /admin/change-password；
 *   普通成员（无后台权限）→ 403 Forbidden 页（账号设置独立于后台，入口在 /setting）
 * - Break-Glass 应急账号 + 系统未初始化 → 强制进入初始化向导 /admin/setup
 * - 侧边栏按一级菜单（固定 9 项顺序）+ 二级菜单渲染；权限过滤仅界面层，
 *   接口权限由后端强制校验
 * - 响应式：桌面 ≥1280px 三栏（一级｜二级｜内容）；平板 768~1279px 双栏
 *   （一级可展开二级，右侧内容）；手机 <768px iOS 堆栈（抽屉 + 内联展开）
 * - 左上角：当前账号头像+用户名，点击弹用户卡片（个人设置 / 登出）
 */
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Bell,
  CalendarDays,
  Users as UsersIcon,
  Settings,
  LogOut,
  Menu,
  X,
  ExternalLink,
  ShieldCheck,
  Megaphone,
  Newspaper,
  UsersRound,
  UserPlus,
  MessageSquare,
  KeyRound,
  Fingerprint,
  BadgeCheck,
  FileText,
  Globe,
  ShieldBan,
  ScrollText,
  Eye,
  Trash2,
  FolderOpen,
  Puzzle,
  Mail,
  FileImage,
  UserCircle,
  ChevronRight,
  ClipboardList,
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

/** 二级菜单项 */
type SecondLevel = {
  key: string;
  href?: string;
  icon: typeof LayoutDashboard;
  modules?: PermissionModule[];
  placeholder?: boolean;
};

/** 一级菜单项（固定 9 项，顺序不可调换） */
type FirstLevel = {
  key: string;
  icon: typeof LayoutDashboard;
  /** 无二级时的直达路由 */
  href?: string;
  /** 整组角色守卫：设为 "admin" 时非管理员整组隐藏 */
  roleGuard?: "admin";
  /** 整组权限模块（用于无 href 时判定整组可见性；有 children 时按子项判定） */
  modules?: PermissionModule[];
  children?: SecondLevel[];
  /** 整组占位（如邮件与推送） */
  placeholder?: boolean;
};

/** 二级项可见性：按有效权限判定（与既有逻辑一致） */
function canAccessSecond(
  item: SecondLevel,
  permCtx: { role: string; overrides: PermissionOverrides | null } | null
): boolean {
  if (!item.modules || item.modules.length === 0) return true;
  if (!permCtx) return false;
  return item.modules.some((m) => hasPermission(permCtx.role, permCtx.overrides, m, "view"));
}

/**
 * 一级菜单（顺序严格固定，开发时禁止调换）：
 * 概览 → 用户管理 → 内容管理 → 通知管理 → 活动管理 → 系统安全 → 系统配置 → 日志与审计 → 邮件与推送
 * 标注：⏳占位 = 业务未实现本轮不做；↩归入 = 存量页面就近挂载。
 */
const firstLevelItems: FirstLevel[] = [
  // 1. 概览（无二级，直接仪表盘）
  {
    key: "admin.nav.dashboard",
    icon: LayoutDashboard,
    href: "/admin/dashboard",
    modules: ["dashboard"],
  },
  // 2. 用户管理
  {
    key: "admin.nav.users",
    icon: UsersIcon,
    modules: ["users"],
    children: [
      { key: "admin.nav.users.list", href: "/admin/users", icon: UsersIcon, modules: ["users"] },
      { key: "admin.nav.users.roles", icon: KeyRound, placeholder: true }, // ⏳角色 CRUD 未实现
      { key: "admin.nav.users.members", href: "/admin/members", icon: UsersRound, modules: ["members"] }, // ↩成员花名册
      { key: "admin.nav.users.realname", href: "/admin/realname-review", icon: BadgeCheck, modules: ["realname"] }, // ↩实名审核
      { key: "admin.nav.users.review", href: "/admin/review", icon: ClipboardList, modules: ["review.registrations", "review.bugs", "review.resets"] }, // ↩审核中心
    ],
  },
  // 3. 内容管理
  {
    key: "admin.nav.content",
    icon: Newspaper,
    modules: ["blog"],
    children: [
      { key: "admin.nav.content.blog", href: "/admin/blog", icon: Newspaper, modules: ["blog"] },
      { key: "admin.nav.content.memo", href: "/admin/memo", icon: FileText, modules: ["memo"] },
      { key: "admin.nav.content.blocks", href: "/admin/content/club-intro", icon: FileText, modules: ["content"] }, // ↩内容块
      { key: "admin.nav.content.media", href: "/admin/media", icon: FolderOpen, modules: ["media"] }, // ↩媒体库
      { key: "admin.nav.content.recycle", href: "/admin/recycle", icon: Trash2 }, // ↩内容回收站
    ],
  },
  // 4. 通知管理
  {
    key: "admin.nav.notifications",
    icon: Megaphone,
    modules: ["announcements"],
    children: [
      { key: "admin.nav.notifications.announcements", href: "/admin/announcements", icon: Megaphone, modules: ["announcements"] },
      { key: "admin.nav.notifications.messages", icon: MessageSquare, placeholder: true }, // ⏳私信系统未实现
    ],
  },
  // 5. 活动管理
  {
    key: "admin.nav.activities",
    icon: CalendarDays,
    modules: ["activities"],
    children: [
      { key: "admin.nav.activities.list", href: "/admin/activities", icon: CalendarDays, modules: ["activities"] },
      { key: "admin.nav.activities.registrations", icon: ClipboardList, placeholder: true }, // ⏳跨活动报名汇总未实现
      { key: "admin.nav.activities.recruitment", href: "/admin/recruitment", icon: UserPlus, modules: ["recruitment"] }, // ↩招新管理
    ],
  },
  // 6. 系统安全（admin 角色）
  {
    key: "admin.nav.security",
    icon: ShieldCheck,
    roleGuard: "admin",
    modules: ["security"],
    children: [
      { key: "admin.nav.security.breakglass", icon: KeyRound, placeholder: true }, // ⏳常驻状态页未实现（初始化向导 /admin/setup 仅未初始化时进入）
      { key: "admin.nav.security.login", href: "/admin/security/bans", icon: ShieldBan, modules: ["security"] }, // 封禁列表+解封
      { key: "admin.nav.security.access", href: "/admin/security/access-control", icon: Globe, modules: ["security"] }, // 访问控制 Tab（白/黑/域名监听）
    ],
  },
  // 7. 系统配置（admin 角色）
  {
    key: "admin.nav.config",
    icon: Settings,
    roleGuard: "admin",
    modules: ["settings"],
    children: [
      { key: "admin.nav.config.site", href: "/admin/settings", icon: Settings, modules: ["settings"] },
      { key: "admin.nav.config.locale", icon: Globe, placeholder: true }, // ⏳专用本地化子页未实现（字段现混在 /admin/settings）
      { key: "admin.nav.config.oauth", href: "/admin/oauth", icon: KeyRound, modules: ["oauth"] }, // ↩OAuth 渠道
      { key: "admin.nav.config.sso", href: "/admin/sso", icon: Fingerprint, modules: ["sso"] }, // ↩SSO 受信应用
    ],
  },
  // 8. 日志与审计（无二级，单页）
  {
    key: "admin.nav.audit",
    icon: ScrollText,
    href: "/admin/audit-logs",
    modules: ["audit_logs"],
  },
  // 9. 邮件与推送（无二级，整组占位）
  {
    key: "admin.nav.mailpush",
    icon: Mail,
    placeholder: true, // ⏳SMTP/推送后端未实现
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
        router.replace(lp("/login"));
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  /** 退出登录 */
  async function handleLogout() {
    await logout();
    router.replace(lp("/login"));
  }

  /** 菜单项激活判断（基于 pathname 前缀） */
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
      {/* 桌面/平板侧边栏（sticky，三栏在 xl，双栏在 md~lg） */}
      <aside className="hidden md:flex md:flex-col md:sticky md:top-0 md:h-screen md:w-64 xl:w-auto md:flex-none md:border-r md:border-border bg-background">
        <SidebarContent
          t={t}
          locale={locale}
          session={session}
          avatarUrl={avatarUrl}
          permCtx={permCtx}
          pathname={pathname}
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
              className="md:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-background border-r border-border flex flex-col"
            >
              <SidebarContent
                t={t}
                locale={locale}
                session={session}
                avatarUrl={avatarUrl}
                permCtx={permCtx}
                pathname={pathname}
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
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
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

/**
 * 侧边栏内容（桌面/平板/移动复用）。
 * - xl：col1（一级）+ col2（当前一级的二级）并排，两栏独立滚动
 * - md~lg：仅 col1，当前一级的二级内联展开（accordion 自动展开 active 父项）
 * - 移动：同 md~lg，置于抽屉内
 */
function SidebarContent({
  t,
  locale,
  session,
  avatarUrl,
  permCtx,
  pathname,
  isActive,
  onLogout,
  onNavigate,
  isBreakGlass,
}: {
  t: (k: string) => string;
  locale: Locale;
  session: AdminSession | null;
  avatarUrl: string | null;
  permCtx: { role: string; overrides: PermissionOverrides | null } | null;
  pathname: string;
  isActive: (h: string) => boolean;
  onLogout: () => void;
  onNavigate?: () => void;
  isBreakGlass?: boolean;
}) {
  const lp = useLocalizedPath();
  const isAdmin = permCtx ? isAdminRole(permCtx.role) : false;

  /** 过滤后的有效一级项（角色守卫 + 子项权限过滤后非空）。
   *  href 在此统一本地化为 /{locale}/admin/... */
  const visibleFirstLevel: (FirstLevel & { visibleChildren: (SecondLevel & { href?: string })[] })[] =
    firstLevelItems
      .filter((fl) => !fl.roleGuard || isAdmin)
      .map((fl) => {
        if (fl.placeholder || !fl.children) return { ...fl, visibleChildren: [] };
        const visibleChildren = fl.children
          .filter((c) => canAccessSecond(c, permCtx))
          .map((c) => (c.href ? { ...c, href: lp(c.href) } : c));
        return { ...fl, visibleChildren };
      })
      // 整组可见条件：有 children 时至少一个可见子项；有 href 时按 modules 判定；占位组恒可见
      .filter((fl) => {
        if (fl.placeholder) return true;
        if (fl.visibleChildren.length > 0) return true;
        if (fl.href) {
          // 无二级直达项：按 modules 判定（modules 为空恒可见）
          if (!fl.modules || fl.modules.length === 0) return true;
          return permCtx
            ? fl.modules.some((m) => hasPermission(permCtx.role, permCtx.overrides, m, "view"))
            : false;
        }
        return false;
      });

  /** 当前激活的一级项 = 其直达 href 或任一子项 href 命中 pathname 的项 */
  const activeFirstLevel = visibleFirstLevel.find((fl) => {
    if (fl.href && isActive(lp(fl.href))) return true;
    return fl.visibleChildren.some((c) => c.href && isActive(c.href));
  });

  /** 一级项的落地链接：有 children 时跳首个可见子项；占位/无则 undefined */
  function firstLevelHref(fl: typeof visibleFirstLevel[number]): string | undefined {
    if (fl.placeholder) return undefined;
    if (fl.href) return lp(fl.href);
    const firstChild = fl.visibleChildren.find((c) => c.href);
    return firstChild?.href;
  }

  /** 渲染单个二级项 */
  function renderSecondItem(item: SecondLevel & { href?: string }) {
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
          isActive(item.href)
            ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
            : "text-muted-foreground"
        )}
      >
        <item.icon className="h-4 w-4" />
        {t(item.key)}
      </Link>
    );
  }

  /** 渲染一级项（col1 共用；md~lg 时 active 父项内联展开二级） */
  function renderFirstItem(fl: typeof visibleFirstLevel[number]) {
    const href = firstLevelHref(fl);
    const isActiveItem = fl === activeFirstLevel;
    const isPlaceholder = fl.placeholder || !href;
    return (
      <div key={fl.key} className="space-y-0.5">
        {isPlaceholder ? (
          <span
            title={t("admin.common.comingSoon")}
            aria-disabled="true"
            className="inline-flex items-center justify-start gap-2 whitespace-nowrap rounded-md text-sm font-medium w-full px-3 h-9 text-muted-foreground/50 cursor-not-allowed select-none"
          >
            <fl.icon className="h-4 w-4" />
            {t(fl.key)}
          </span>
        ) : (
          <Link
            href={href!}
            onClick={onNavigate}
            className={cn(
              "inline-flex items-center justify-start gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors cursor-pointer [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
              "hover:bg-accent hover:text-accent-foreground w-full px-3 h-9",
              isActiveItem
                ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                : "text-foreground"
            )}
          >
            <fl.icon className="h-4 w-4" />
            {t(fl.key)}
          </Link>
        )}
        {/* md~lg 内联展开 active 父项的二级（xl 隐藏，由 col2 接管） */}
        {isActiveItem && fl.visibleChildren.length > 0 && (
          <div className="md:block xl:hidden pl-3 mt-0.5 space-y-0.5 border-l border-border ml-3">
            {fl.visibleChildren.map(renderSecondItem)}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* 左上角：当前账号头像 + 用户名（点击弹用户卡片） */}
      <UserCard
        t={t}
        lp={lp}
        session={session}
        avatarUrl={avatarUrl}
        isBreakGlass={isBreakGlass}
        onLogout={onLogout}
        onNavigate={onNavigate}
      />
      {/* 导航：xl 时 col1+col2 并排，md~lg 仅 col1（active 父项内联展开二级） */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">
        {/* col1：一级菜单（固定 9 项顺序） */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 xl:flex-none xl:w-56 xl:border-r xl:border-border">
          <div className="space-y-0.5">{visibleFirstLevel.map(renderFirstItem)}</div>
        </nav>
        {/* col2：当前一级项的二级菜单（仅 xl，仅 active 有 children 时显示） */}
        {activeFirstLevel && activeFirstLevel.visibleChildren.length > 0 && (
          <nav className="hidden xl:block xl:w-60 overflow-y-auto px-3 py-3">
            <div className="mb-2 px-3 text-xs font-medium text-muted-foreground/80">
              {t(activeFirstLevel.key)}
            </div>
            <div className="space-y-0.5">
              {activeFirstLevel.visibleChildren.map(renderSecondItem)}
            </div>
          </nav>
        )}
      </div>
    </>
  );
}

/** 左上角用户卡片：头像+用户名，点击弹卡片（个人设置 / 登出） */
function UserCard({
  t,
  lp,
  session,
  avatarUrl,
  isBreakGlass,
  onLogout,
  onNavigate,
}: {
  t: (k: string) => string;
  lp: (p: string) => string;
  session: AdminSession | null;
  avatarUrl: string | null;
  isBreakGlass?: boolean;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2.5 rounded-md text-sm transition-colors hover:bg-muted"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={session?.username ?? "avatar"}
            className="h-8 w-8 shrink-0 rounded-full object-cover bg-secondary"
          />
        ) : (
          <UserCircle className="h-8 w-8 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[10px] text-muted-foreground">{t("admin.dashboard.welcome")}</div>
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
        <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-2 right-2 top-full z-50 mt-1 rounded-md border border-border bg-background shadow-lg overflow-hidden"
          >
            <Link
              href={lp("/setting/profile")}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
            >
              <UserCircle className="h-4 w-4" />
              {t("admin.dashboard.forbidden.goSetting")}
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted text-left"
            >
              <LogOut className="h-4 w-4" />
              {t("admin.dashboard.logout")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
