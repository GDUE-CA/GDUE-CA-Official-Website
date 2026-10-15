"use client";

/**
 * /admin/(dashboard) 布局：iKuai 爱快路由器风格单侧边栏可折叠后台
 *
 * 布局从上往下层级（规格 §6 硬性约束）：
 * 1) 【全局置顶红色 Break-Glass 警告横幅】横跨全宽，永远第一行，不可关闭
 * 2) 【顶部 Header 通栏】左：汉堡折叠按钮；中：留空；右：通知铃铛/语言切换/账号下拉
 * 3) 【主体】= 左侧单一可折叠 Sider + 右侧整块主内容区
 *
 * 侧边栏两种模式（点击汉堡切换，状态存 localStorage `gdueca-admin-sidebar`）：
 * - 完整展开模式（宽 w-64）：图标+文字；一级有子项时点击垂直展开子菜单（绝不新开第二列）
 * - 折叠窄栏模式（窄 w-16）：仅图标；悬浮一级图标弹出 popover 展示标题+全部子菜单，点击跳转
 *
 * 面包屑导航放置在右侧主内容区顶部。
 *
 * 路由守卫：未登录→/login；普通账号→403 Forbidden；BG+未初始化→/admin/setup；
 * admin/editor 未实名→/admin/realname；must_change_password→/admin/change-password。
 * 权限过滤仅界面层，接口权限由后端强制校验。
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
  Trash2,
  FolderOpen,
  Mail,
  UserCircle,
  ChevronRight,
  ClipboardList,
  MailPlus,
  Palette,
  GraduationCap,
  Database,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { useAdminLocale } from "@/app/admin/AdminProviders";
import { locales, localeDisplayName, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { BanModal } from "@/components/shared/BanModal";
import { BackgroundTaskFloat } from "@/components/notifications/BackgroundTaskFloat";
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

/** 折叠状态 localStorage 键 */
const SIDEBAR_KEY = "gdueca-admin-sidebar";

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
      { key: "admin.nav.users.emailChange", href: "/admin/email-change-requests", icon: MailPlus, modules: ["review.emails"] }, // ↩人工账号申请：更改绑定邮箱申请列表
      { key: "admin.nav.users.schoolVerify", href: "/admin/school-verify", icon: GraduationCap, modules: ["review.school"] }, // Module D：学校身份人工验证审核
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
      { key: "admin.nav.activities.clubApply", href: "/admin/club-apply", icon: ClipboardList, modules: ["recruitment"] }, // Module D：社团报名审核
    ],
  },
  // 6. 系统安全（admin 角色）
  {
    key: "admin.nav.security",
    icon: ShieldCheck,
    roleGuard: "admin",
    modules: ["security"],
    children: [
      { key: "admin.nav.security.breakglass", icon: KeyRound, placeholder: true }, // ⏳常驻状态页未实现
      { key: "admin.nav.security.login", href: "/admin/security/bans", icon: ShieldBan, modules: ["security"] }, // 封禁列表+解封
      { key: "admin.nav.security.access", href: "/admin/security/access-control", icon: Globe, modules: ["security"] }, // 访问控制 Tab
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
      { key: "admin.nav.config.sysdata", href: "/admin/sys-data", icon: Database, modules: ["settings"] }, // Module D：学院/年级/专业/班级管理
      { key: "admin.nav.config.themes", href: "/admin/themes", icon: Palette, modules: ["themes"] }, // 界面主题 CRUD/上传
      { key: "admin.nav.config.locale", icon: Globe, placeholder: true }, // ⏳专用本地化子页未实现
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
  /** Break-Glass 应急账号标记：启用顶部红横幅 + 账号下拉红标签 */
  const [isBreakGlass, setIsBreakGlass] = useState(false);
  /** 侧边栏折叠状态：false=展开宽栏，true=折叠窄栏；mount 时从 localStorage 读取 */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  /** 读取持久化的折叠状态（客户端才能读 localStorage） */
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(SIDEBAR_KEY);
      if (v === "collapsed") setSidebarCollapsed(true);
    } catch {
      /* localStorage 不可用时忽略，默认展开 */
    }
  }, []);

  /** 切换侧边栏折叠/展开，并持久化 */
  function toggleSidebar() {
    setSidebarCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded");
      } catch {
        /* 忽略写入失败 */
      }
      return next;
    });
  }

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
        // 标记 BG 会话，启用顶部红横幅 + 账号下拉红标签
        if (me.is_break_glass) {
          setIsBreakGlass(true);
        }
        if (!isAdminRole(me.role)) {
          // 已登录但无后台权限：渲染 403（账号设置独立于后台，入口在 /setting）
          setForbidden(true);
          return;
        }
        // 实名守卫：admin/editor 未实名禁止进后台（super_admin 豁免）
        if (me.role !== "super_admin" && !me.realname_verified) {
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

  // 非管理员访问后台：403 Forbidden
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
    <div className="min-h-screen flex flex-col bg-muted/20">
      <BanModal />
      <BackgroundTaskFloat />
      {/* Layer 1: BG 顶部红条警告横幅（横跨全宽，永远第一行，不可关闭） */}
      {isBreakGlass && (
        <div className="bg-destructive text-destructive-foreground text-center text-sm font-medium px-4 py-2">
          {t("admin.breakGlass.bannerWarning")}
        </div>
      )}
      {/* Layer 2: 顶部 Header 通栏（底色跟随侧边栏，仅底部极淡分隔线） */}
      <header className="h-14 border-b border-border bg-sidebar/95 backdrop-blur-md flex items-center justify-between px-3 sm:px-4 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          {/* 桌面端汉堡按钮：切换侧边栏折叠/展开 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label={t("admin.dashboard.toggleSidebar")}
            className="hidden md:inline-flex"
          >
            <Menu className="h-5 w-5" />
          </Button>
          {/* 移动端汉堡按钮：打开抽屉 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            className="md:hidden"
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
          <UserMenu
            t={t}
            session={session}
            avatarUrl={avatarUrl}
            isBreakGlass={isBreakGlass}
            onLogout={handleLogout}
          />
        </div>
      </header>

      {/* Layer 3: 主体 = 左侧单一可折叠 Sider + 右侧主内容区 */}
      <div className="flex-1 flex min-h-0">
        {/* 桌面侧边栏：单一可折叠 */}
        <aside
          className={cn(
            "hidden md:flex md:flex-col md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:flex-none md:border-r md:border-border bg-sidebar transition-[width] duration-[180ms] ease-in-out",
            sidebarCollapsed ? "md:w-16" : "md:w-64"
          )}
        >
          <SidebarContent
            t={t}
            locale={locale}
            permCtx={permCtx}
            pathname={pathname}
            isActive={isActive}
            collapsed={sidebarCollapsed}
          />
        </aside>

        {/* 移动端抽屉（默认展开模式，点击外部或导航后关闭） */}
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
                className="md:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-sidebar border-r border-border flex flex-col"
              >
                <div className="h-14 flex items-center justify-between px-3 border-b border-border">
                  <span className="font-display font-bold text-sm">
                    {t("admin.dashboard.title")}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMobileNavOpen(false)}
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <SidebarContent
                  t={t}
                  locale={locale}
                  permCtx={permCtx}
                  pathname={pathname}
                  isActive={isActive}
                  collapsed={false}
                  onNavigate={() => setMobileNavOpen(false)}
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* 右侧主内容区（顶部面包屑 + 主内容） */}
        <div className="flex-1 flex flex-col min-w-0">
          <AdminBreadcrumb
            locale={locale}
            pathname={pathname}
            permCtx={permCtx}
          />
          <main className="flex-1 p-6">{children}</main>
        </div>
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
          {localeDisplayName(l)}
        </option>
      ))}
    </select>
  );
}

/**
 * 顶栏账号下拉菜单：头像+用户名，点击弹卡片（个人设置 / 登出）。
 * BG 会话时显示红色「BG」标签。
 */
function UserMenu({
  t,
  session,
  avatarUrl,
  isBreakGlass,
  onLogout,
}: {
  t: (k: string) => string;
  session: AdminSession | null;
  avatarUrl: string | null;
  isBreakGlass?: boolean;
  onLogout: () => void;
}) {
  const lp = useLocalizedPath();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-9 px-2 rounded-md text-sm transition-colors hover:bg-muted"
        aria-label={t("admin.dashboard.welcome")}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={session?.username ?? "avatar"}
            className="h-7 w-7 shrink-0 rounded-full object-cover bg-secondary"
          />
        ) : (
          <UserCircle className="h-7 w-7 shrink-0 text-muted-foreground" />
        )}
        <span className="hidden sm:inline font-medium truncate max-w-32">
          {session?.username ?? "admin"}
        </span>
        {/* BG 红标签（Layer 2 警告） */}
        {isBreakGlass && (
          <span className="hidden md:inline-flex items-center rounded-md bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
            BG
          </span>
        )}
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-border bg-background shadow-lg overflow-hidden"
          >
            <Link
              href={lp("/setting/profile")}
              onClick={() => setOpen(false)}
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

/**
 * 侧边栏内容（桌面/移动复用）。
 * - collapsed=false（展开宽栏）：图标+文字；一级有子项时点击垂直展开子菜单（绝不新开第二列）
 * - collapsed=true（折叠窄栏）：仅图标；悬浮一级图标弹出 popover 展示标题+全部子菜单
 * 折叠模式下点击有 children 的一级图标，跳转首个可见子项。
 */
function SidebarContent({
  t,
  locale,
  permCtx,
  pathname,
  isActive,
  onNavigate,
  collapsed = false,
}: {
  t: (k: string) => string;
  locale: Locale;
  permCtx: { role: string; overrides: PermissionOverrides | null } | null;
  pathname: string;
  isActive: (h: string) => boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const lp = useLocalizedPath();
  const isAdmin = permCtx ? isAdminRole(permCtx.role) : false;
  /** 当前展开的一级项 key（仅展开模式生效；折叠模式用 popover） */
  const [expandedFirst, setExpandedFirst] = useState<string | null>(null);
  /** 折叠模式下当前悬浮的一级项 key（控制 popover 显示） */
  const [hoveredFirst, setHoveredFirst] = useState<string | null>(null);

  /** 过滤后的有效一级项（角色守卫 + 子项权限过滤后非空）。
   *  href 在此统一本地化为 /{locale}/admin/... */
  const visibleFirstLevel: (FirstLevel & {
    visibleChildren: (SecondLevel & { href?: string })[];
  })[] = firstLevelItems
    .filter((fl) => !fl.roleGuard || isAdmin)
    .map((fl) => {
      if (fl.placeholder || !fl.children) return { ...fl, visibleChildren: [] };
      const visibleChildren = fl.children
        .filter((c) => canAccessSecond(c, permCtx))
        .map((c) => (c.href ? { ...c, href: lp(c.href) } : c));
      return { ...fl, visibleChildren };
    })
    .filter((fl) => {
      if (fl.placeholder) return true;
      if (fl.visibleChildren.length > 0) return true;
      if (fl.href) {
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

  /** 初始展开 active 一级项（仅展开模式；折叠模式不展开，靠 popover） */
  useEffect(() => {
    if (!collapsed && activeFirstLevel) {
      setExpandedFirst(activeFirstLevel.key);
    }
    if (collapsed) {
      setExpandedFirst(null);
    }
  }, [collapsed, activeFirstLevel?.key]);

  /** 一级项的落地链接：有 children 时跳首个可见子项；占位/无则 undefined */
  function firstLevelHref(
    fl: typeof visibleFirstLevel[number]
  ): string | undefined {
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
          title={t(item.key)}
          aria-disabled="true"
          className="inline-flex items-center justify-start gap-3 whitespace-nowrap rounded-sm text-[15px] leading-[1.2] font-medium w-full px-[14px] py-[10px] text-muted-foreground/50 cursor-not-allowed select-none"
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{t(item.key)}</span>
        </span>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        title={t(item.key)}
        className={cn(
          "inline-flex items-center justify-start gap-3 whitespace-nowrap rounded-sm text-[15px] leading-[1.2] font-medium transition-all duration-[180ms] ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
          "hover:bg-sidebar-accent hover:text-accent-foreground",
          "w-full px-[14px] py-[10px]",
          isActive(item.href)
            ? "bg-primary text-primary-foreground font-semibold hover:bg-primary/90 hover:text-primary-foreground"
            : "text-muted-foreground"
        )}
      >
        <item.icon className="h-4 w-4" />
        <span className="truncate">{t(item.key)}</span>
      </Link>
    );
  }

  /** 渲染一级项 */
  function renderFirstItem(fl: typeof visibleFirstLevel[number]) {
    const href = firstLevelHref(fl);
    const isActiveItem = fl === activeFirstLevel;
    const isPlaceholder = fl.placeholder || !href;
    const hasChildren = fl.visibleChildren.length > 0;
    const isExpanded = expandedFirst === fl.key;

    // 折叠模式：仅图标 + 悬浮 popover
    if (collapsed) {
      if (isPlaceholder) {
        return (
          <span
            key={fl.key}
            title={t("admin.common.comingSoon")}
            aria-disabled="true"
            className="flex items-center justify-center w-full h-10 rounded-md text-muted-foreground/50 cursor-not-allowed select-none"
          >
            <fl.icon className="h-5 w-5" />
          </span>
        );
      }
      return (
        <div
          key={fl.key}
          className="relative"
          onMouseEnter={() => setHoveredFirst(fl.key)}
          onMouseLeave={() => setHoveredFirst(null)}
        >
          <Link
            href={href!}
            onClick={onNavigate}
            title={t(fl.key)}
            className={cn(
              "flex items-center justify-center w-full h-10 rounded-sm transition-all duration-[180ms] ease-in-out",
              isActiveItem
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-accent-foreground"
            )}
          >
            <fl.icon className="h-5 w-5" />
          </Link>
          {/* popover：悬浮一级图标展示标题+全部子菜单 */}
          {hasChildren && hoveredFirst === fl.key && (
            <div className="absolute left-full top-0 ml-2 z-50 min-w-48 rounded-md border border-border bg-background shadow-lg p-2">
              <div className="mb-1 px-2 text-xs font-semibold text-foreground">
                {t(fl.key)}
              </div>
              <div className="space-y-0.5">
                {fl.visibleChildren.map(renderSecondItem)}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 展开模式：图标+文字；有 children 时点击展开/收起子菜单垂直向下
    return (
      <div key={fl.key} className="space-y-0.5">
        {isPlaceholder ? (
          <span
            title={t(fl.key)}
            aria-disabled="true"
            className="inline-flex items-center justify-start gap-3 whitespace-nowrap rounded-sm text-[15px] leading-[1.2] font-medium w-full px-[14px] py-[10px] text-muted-foreground/50 cursor-not-allowed select-none"
          >
            <fl.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{t(fl.key)}</span>
          </span>
        ) : hasChildren ? (
          <button
            type="button"
            title={t(fl.key)}
            onClick={() =>
              setExpandedFirst((v) => (v === fl.key ? null : fl.key))
            }
            className={cn(
              "inline-flex items-center justify-start gap-3 whitespace-nowrap rounded-sm text-[15px] leading-[1.2] font-semibold transition-all duration-[180ms] ease-in-out w-full px-[14px] py-[10px] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
              isActiveItem
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-sidebar-accent hover:text-accent-foreground"
            )}
          >
            <fl.icon className="h-4 w-4" />
            <span className="truncate">{t(fl.key)}</span>
            <ChevronRight
              className={cn(
                "ml-auto h-4 w-4 transition-transform duration-[180ms]",
                isExpanded && "rotate-90"
              )}
            />
          </button>
        ) : (
          <Link
            href={href!}
            onClick={onNavigate}
            title={t(fl.key)}
            className={cn(
              "inline-flex items-center justify-start gap-3 whitespace-nowrap rounded-sm text-[15px] leading-[1.2] font-semibold transition-all duration-[180ms] ease-in-out cursor-pointer [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
              "hover:bg-sidebar-accent hover:text-accent-foreground w-full px-[14px] py-[10px]",
              isActiveItem
                ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                : "text-foreground"
            )}
          >
            <fl.icon className="h-4 w-4" />
            <span className="truncate">{t(fl.key)}</span>
          </Link>
        )}
        {/* 展开模式下子菜单垂直向下展开（绝不新开第二列） */}
        {hasChildren && isExpanded && (
          <div className="pl-3 mt-0.5 space-y-0.5 border-l border-border ml-3">
            {fl.visibleChildren.map(renderSecondItem)}
          </div>
        )}
      </div>
    );
  }

  return (
    <nav
      className={cn(
        "flex-1 py-3",
        // 折叠模式不裁切 overflow，让 popover 能溢出 aside 边界显示
        // 展开模式 overflow-y-auto，让长子菜单可滚动
        collapsed ? "px-2" : "px-3 overflow-y-auto"
      )}
    >
      <div className="space-y-0.5">{visibleFirstLevel.map(renderFirstItem)}</div>
    </nav>
  );
}

/**
 * 面包屑导航：放置在右侧主内容区顶部。
 * 从 pathname 反查当前一级 / 二级菜单项，生成 管理后台 / 一级 / 二级 面包屑。
 */
function AdminBreadcrumb({
  locale,
  pathname,
  permCtx,
}: {
  locale: Locale;
  pathname: string;
  permCtx: { role: string; overrides: PermissionOverrides | null } | null;
}) {
  const { t, messages } = useI18n();
  const lp = useLocalizedPath();
  const isAdmin = permCtx ? isAdminRole(permCtx.role) : false;

  /**
   * 翻译 helper：先 t() 标准查找；失败（返回 key 本身）则尝试把末尾多段
   * 合并为字面量带点 key 直接访问父对象（兼容 i18n 字典里 "users.list"
   * 这种字面量 key，标准 split('.') 解析会失败）。
   */
  function label(key: string): string {
    const v = t(key);
    if (v !== key) return v;
    const parts = key.split(".");
    for (let i = parts.length - 1; i > 0; i--) {
      const literal = parts.slice(i).join(".");
      const parentPath = parts.slice(0, i);
      let parent: unknown = messages;
      for (const p of parentPath) {
        if (parent && typeof parent === "object" && p in (parent as Record<string, unknown>)) {
          parent = (parent as Record<string, unknown>)[p];
        } else {
          parent = undefined;
          break;
        }
      }
      if (parent && typeof parent === "object" && literal in (parent as Record<string, unknown>)) {
        const v2 = (parent as Record<string, unknown>)[literal];
        if (typeof v2 === "string") return v2;
      }
    }
    return key;
  }

  /** 反查当前一级 / 二级（与 SidebarContent 同过滤逻辑） */
  let matchedFirst: FirstLevel | null = null;
  let matchedSecond: SecondLevel | null = null;
  for (const fl of firstLevelItems) {
    if (fl.roleGuard && !isAdmin) continue;
    if (fl.href && pathname.startsWith(lp(fl.href))) {
      matchedFirst = fl;
      break;
    }
    if (fl.children) {
      // 占位项（无 href）不参与匹配，但 placeholder=true 的整组跳过
      const visibleChildren = fl.children.filter((c) =>
        canAccessSecond(c, permCtx)
      );
      for (const c of visibleChildren) {
        if (c.href && pathname.startsWith(lp(c.href))) {
          matchedFirst = fl;
          matchedSecond = c;
          break;
        }
      }
      if (matchedFirst) break;
    }
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center h-10 px-4 md:px-8 border-b border-border bg-background text-xs text-muted-foreground overflow-x-auto"
    >
      <Link
        href={`/${locale}`}
        className="hover:text-foreground whitespace-nowrap"
      >
        {label("admin.dashboard.title")}
      </Link>
      {matchedFirst && (
        <>
          <ChevronRight className="h-3 w-3 mx-1 shrink-0" />
          <span
            className={cn(
              "whitespace-nowrap",
              !matchedSecond && "text-foreground font-medium"
            )}
          >
            {label(matchedFirst.key)}
          </span>
        </>
      )}
      {matchedSecond && (
        <>
          <ChevronRight className="h-3 w-3 mx-1 shrink-0" />
          <span className="text-foreground font-medium whitespace-nowrap">
            {label(matchedSecond.key)}
          </span>
        </>
      )}
    </nav>
  );
}
