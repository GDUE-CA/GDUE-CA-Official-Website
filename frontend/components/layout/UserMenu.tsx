"use client";

/**
 * UserMenu —— 导航栏顶部账号交互区
 *
 * 未登录：
 *   - 显示「登录」按钮，点击直达登录页
 *   - 鼠标悬浮按钮 250ms 弹出 HoverCard（B 站式登录悬浮提示）：
 *     登录权益说明 +【立即登录】主按钮 + 注册链接
 *   - 鼠标可在触发器与卡片间自由移动（Radix HoverCard 安全区），离开后延迟关闭防闪烁
 *
 * 已登录：
 *   - 头像为触发器，「点击」打开 DropdownMenu（不再悬浮弹出；HoverCard 整体卸载）
 *   - 菜单内容：用户信息块 / 个人设置 / 后台管理（仅管理员）/ 退出登录
 *   - 主题与语言已移至导航栏独立 NavDropdown（外观设置 + 更改语言），不再嵌套于账号菜单
 *
 * 角色权限仅由后端接口强制校验，前端只隐藏入口。
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { fetchMe } from "@/lib/api/auth";
import { API_BASE_URL, ApiError } from "@/lib/api/client";
import { clearLocalSession, isAdminRole, isLogged, logout } from "@/lib/auth";
import type { AdminUser } from "@/types/api";
import User from "@/assets/icons/user/user.svg";
import UserCircle from "@/assets/icons/user/user-circle.svg";
import LayoutDashboard from "@/assets/icons/navigation/layout-dashboard.svg";
import LogOut from "@/assets/icons/navigation/log-out.svg";
import Check from "@/assets/icons/action/check.svg";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

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

/** 登录 HoverCard 权益条目（i18n key） */
const LOGIN_BENEFIT_KEYS = [
  "nav.loginCard.benefitEvents",
  "nav.loginCard.benefitMemo",
  "nav.loginCard.benefitCommunity",
  "nav.loginCard.benefitNotify",
] as const;

export function UserMenu() {
  const { t } = useI18n();
  const lp = useLocalizedPath();

  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const logged = isLogged();
    setLoggedIn(logged);
    if (logged) {
      setLoading(true);
      fetchMe()
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

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    window.location.href = lp(`/login`);
  };

  const showBackend = loggedIn && isAdminRole(profile?.role);
  const avatarUrl = !imgError ? avatarFullUrl(profile?.avatar_url) : "";
  const hasImg = Boolean(avatarUrl);
  const name = profile?.username ?? "";
  const initials = getInitials(name || "U");
  const hue = hashHue(name || "guest");

  /* ------------------------------ 未登录：登录按钮 + HoverCard ------------------------------ */
  if (!loggedIn || !profile) {
    return (
      <HoverCard openDelay={250} closeDelay={200}>
        <HoverCardTrigger asChild>
          <Button asChild size="sm" variant="outline">
            <Link href={lp("/login")}>{t("nav.login")}</Link>
          </Button>
        </HoverCardTrigger>
        <HoverCardContent align="end" className="w-72">
          <p className="text-sm font-semibold">{t("nav.loginCard.title")}</p>
          <ul className="mt-2 space-y-1.5">
            {LOGIN_BENEFIT_KEYS.map((key) => (
              <li key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                {t(key)}
              </li>
            ))}
          </ul>
          <Button asChild size="sm" className="mt-3 w-full">
            <Link href={lp("/login")}>{t("nav.loginCard.loginNow")}</Link>
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {t("nav.loginCard.noAccount")}{" "}
            <Link href={lp("/auth/register")} className="text-primary hover:underline">
              {t("nav.loginCard.registerNow")}
            </Link>
          </p>
        </HoverCardContent>
      </HoverCard>
    );
  }

  /* ------------------------------ 已登录：头像 + 点击 DropdownMenu ------------------------------ */
  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full overflow-hidden ring-2 ring-transparent hover:ring-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all cursor-pointer"
          aria-label={t("nav.accountMenu")}
          title={name || t("nav.accountMenu")}
        >
          {loading ? (
            <span className="inline-flex h-full w-full items-center justify-center bg-secondary">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            </span>
          ) : hasImg ? (
            <img
              src={avatarUrl}
              alt={name || "avatar"}
              className="h-full w-full object-cover bg-secondary"
              onError={() => setImgError(true)}
            />
          ) : (
            <span
              className="inline-flex h-full w-full items-center justify-center text-xs font-semibold text-white select-none"
              style={{ backgroundColor: `hsl(${hue} 65% 45%)` }}
            >
              {initials}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* 用户信息块 */}
        <div className="px-2 py-1.5 flex flex-col gap-0.5">
          <span className="text-sm font-medium leading-tight">{profile.username}</span>
          <span className="text-xs text-muted-foreground font-normal">{profile.email}</span>
        </div>
        <DropdownMenuSeparator />

        {/* V0.6.1 需求5：个人主页直达入口（/u/{username}） */}
        <DropdownMenuItem asChild>
          <Link href={lp(`/u/${profile.username}`)}>
            <UserCircle />
            {t("nav.profilePage")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={lp("/setting/profile")}>
            <User />
            {t("nav.personalSettings")}
          </Link>
        </DropdownMenuItem>
        {showBackend && (
          <DropdownMenuItem asChild>
            <Link href={lp("/admin/dashboard")}>
              <LayoutDashboard />
              {t("nav.backend")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleLogout}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut />
          {t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
