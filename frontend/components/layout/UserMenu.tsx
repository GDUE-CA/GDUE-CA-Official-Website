"use client";

/**
 * UserMenu —— 导航栏用户头像下拉菜单
 *
 * 交互（与 SettingsDropdown 一致）：
 *   - hover 头像 → 立即展开下拉
 *   - 鼠标从头像移到下拉内容 → 保持展开
 *   - 鼠标离开整个区域 → 自动收起（100ms 延迟）
 *   - 点击头像 → 切换展开/收起（移动端 / 触屏可用）
 *
 * 下拉内容：
 *   1. 用户信息（头像 + 用户名 + 邮箱）
 *   2. 快速设置区：主题切换（浅色/深色，就地生效）+ 语言切换（就地生效，不跳转）
 *   3. 【完整设置】→ /setting/profile
 *   4. 后台入口（仅管理员可见）
 *   5. 退出登录
 *
 * 通知入口已迁移至顶部导航栏独立图标（NotificationBell），不再放在此下拉中。
 * 角色权限仅由后端接口强制校验，前端只隐藏入口。
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { fetchProfile } from "@/lib/api/auth";
import { API_BASE_URL, ApiError } from "@/lib/api/client";
import { clearLocalSession, isAdminRole, isLogged, logout } from "@/lib/auth";
import { locales, localeNames, type Locale } from "@/lib/i18n";
import type { AdminUser } from "@/types/api";
import { User, LayoutDashboard, LogOut, LogIn, UserPlus, Sun, Moon, Check, Languages } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";
const THEME_KEY = "gdueca-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function getInitials(name: string): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(0, 2);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}
function avatarFullUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const base = API_BASE_URL.replace(/\/+$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

export function UserMenu() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  // 快速设置：主题 / 语言
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const logged = isLogged();
    setLoggedIn(logged);
    if (logged) {
      setLoading(true);
      fetchProfile()
        .then((p) => setProfile(p))
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) {
            clearLocalSession();
            setLoggedIn(false);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setProfile(null);
    }
  }, []);

  // 主题初始化
  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (!window.localStorage.getItem(THEME_KEY)) {
        const next: Theme = e.matches ? "dark" : "light";
        setTheme(next);
        applyTheme(next);
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    return () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const cancelClose = () => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 100);
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = `/auth/login`;
  };
  const handleItemClick = () => setOpen(false);

  const switchTheme = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem(THEME_KEY, next);
  };

  const switchLocale = (target: Locale) => {
    if (target === locale) return;
    const segments = pathname.split("/");
    segments[1] = target;
    router.push(segments.join("/"));
  };

  const showBackend = loggedIn && isAdminRole(profile?.role);
  const avatarUrl = !imgError ? avatarFullUrl(profile?.avatar_url) : "";
  const hasImg = Boolean(avatarUrl);
  const name = profile?.username ?? "";
  const initials = getInitials(name || "U");
  const hue = hashHue(name || "guest");

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full overflow-hidden ring-2 ring-transparent hover:ring-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all cursor-pointer"
        aria-label={loggedIn ? t("nav.accountMenu") : t("nav.admin")}
        title={loggedIn ? (name || t("nav.accountMenu")) : t("nav.admin")}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {loading ? (
          <span className="inline-flex h-full w-full items-center justify-center bg-secondary">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          </span>
        ) : hasImg ? (
          <img src={avatarUrl} alt={name || "avatar"} className="h-full w-full object-cover bg-secondary" onError={() => setImgError(true)} />
        ) : (
          <span className="inline-flex h-full w-full items-center justify-center text-xs font-semibold text-white select-none" style={{ backgroundColor: `hsl(${hue} 65% 45%)` }}>
            {initials}
          </span>
        )}
      </button>

      <div
        role="menu"
        className={cn(
          "absolute right-0 top-full mt-1 z-50 min-w-[15rem] w-60 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md origin-top",
          "transition-[opacity,transform] motion-reduce:transition-none",
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
        )}
      >
        {loggedIn && profile ? (
          <>
            <div className="px-2 py-1.5 flex flex-col gap-0.5">
              <span className="text-sm font-medium leading-tight">{profile.username}</span>
              <span className="text-xs text-muted-foreground font-normal">{profile.email}</span>
            </div>
            <div className="-mx-1 my-1 h-px bg-muted" />

            {/* 快速设置区：主题 + 语言（就地生效，不跳转） */}
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{t("nav.quickSettings")}</div>
            <div className="flex items-center gap-1 px-1">
              <button
                type="button"
                onClick={() => switchTheme("light")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors",
                  mounted && theme === "light" ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Sun className="h-3.5 w-3.5" />
                {t("common.themeLight")}
              </button>
              <button
                type="button"
                onClick={() => switchTheme("dark")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors",
                  mounted && theme === "dark" ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Moon className="h-3.5 w-3.5" />
                {t("common.themeDark")}
              </button>
            </div>
            <div className="px-2 pt-1.5 text-xs font-semibold text-muted-foreground">{t("nav.language")}</div>
            <div className="grid grid-cols-2 gap-1 px-1 pb-1">
              {locales.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => switchLocale(loc)}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors",
                    loc === locale ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Languages className="h-3 w-3 opacity-50" />
                  {localeNames[loc]}
                  {loc === locale && <Check className="h-3 w-3 text-primary" />}
                </button>
              ))}
            </div>

            <div className="-mx-1 my-1 h-px bg-muted" />

            <Link
              href="/setting/profile"
              onClick={handleItemClick}
              role="menuitem"
              className="relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0"
            >
              <User className="h-4 w-4" />
              {t("nav.personalSettings")}
            </Link>
            {showBackend && (
              <Link
                href="/admin/dashboard"
                onClick={handleItemClick}
                role="menuitem"
                className="relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0"
              >
                <LayoutDashboard className="h-4 w-4" />
                {t("nav.backend")}
              </Link>
            )}
            <div className="-mx-1 my-1 h-px bg-muted" />
            <button
              type="button"
              onClick={() => { handleItemClick(); handleLogout(); }}
              role="menuitem"
              className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors text-destructive hover:bg-destructive/10 hover:text-destructive [&_svg]:size-4 [&_svg]:shrink-0"
            >
              <LogOut className="h-4 w-4" />
              {t("nav.logout")}
            </button>
          </>
        ) : (
          <>
            <div className="px-2 py-1.5 text-sm font-semibold">{t("nav.guest")}</div>
            <div className="-mx-1 my-1 h-px bg-muted" />
            <Link href="/auth/login" onClick={handleItemClick} role="menuitem"
              className="relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0">
              <LogIn className="h-4 w-4" />
              {t("nav.login")}
            </Link>
            <Link href="/auth/register" onClick={handleItemClick} role="menuitem"
              className="relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0">
              <UserPlus className="h-4 w-4" />
              {t("nav.register")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
