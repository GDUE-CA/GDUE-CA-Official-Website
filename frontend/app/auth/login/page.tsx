"use client";

/**
 * /auth/login - 用户端登录页（P0）
 * - 多语言路由：/zh-cn/auth/login 等（经 next.config 重写到本页）
 * - 表单提交 POST /api/auth/login，登录凭据由后端写入 HttpOnly Cookie
 * - 登录成功跳转 returnUrl（/setting/** 守卫携带；仅接受站内相对路径），
 *   无回跳地址时跳转网站首页 /{locale}；must_change_password 仍走后台改密流程
 * - 底部提供「注册账号」入口
 */
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, LogIn, ArrowLeft, UserPlus } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { useAdminLocale } from "@/app/admin/AdminProviders";
import { localeNames, locales, localeToUrlLang, urlLangToLocale, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { login } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { BizCode } from "@/types/response";
import { getSession, saveSession } from "@/lib/auth";

/**
 * 解析登录后回跳地址（/setting/** 守卫携带 returnUrl）。
 * 仅接受站内相对路径（以单个 / 开头），拒绝 //、\ 与绝对 URL，防开放重定向。
 */
function parseReturnTarget(): string | null {
  const raw = new URLSearchParams(window.location.search).get("returnUrl");
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}

/** 语言切换：跳转到对应语言前缀路由（/{lang}/auth/login） */
function AuthLocaleSwitcher() {
  const { locale } = useAdminLocale();
  const router = useRouter();
  return (
    <select
      value={locale}
      onChange={(e) =>
        router.replace(`/${localeToUrlLang(e.target.value as Locale)}/auth/login`)
      }
      aria-label="Language"
      className="h-8 rounded-md border border-input bg-background px-1.5 text-xs font-medium cursor-pointer"
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {localeNames[l]}
        </option>
      ))}
    </select>
  );
}

export default function AuthLoginPage() {
  const { t, locale } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();
  const pathname = usePathname();
  const { setLocale } = useAdminLocale();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 登录后回跳目标：/setting/** 守卫的 returnUrl（挂载时解析一次）
  const [returnTarget, setReturnTarget] = useState<string | null>(null);
  // 首次封禁警告：登录失败返回 401 + 1013，data.first_ban=true 时显示警告
  const [firstBanWarning, setFirstBanWarning] = useState(false);

  useEffect(() => {
    setReturnTarget(parseReturnTarget());
  }, []);

  /** 从 URL 路径同步语言（/en-gb/auth/login → en-gb） */
  useEffect(() => {
    const urlLocale = pathname ? urlLangToLocale(pathname.split("/")[1] ?? "") : null;
    if (urlLocale && urlLocale !== locale) {
      setLocale(urlLocale);
    }
  }, [pathname, locale, setLocale]);

  /** 已登录用户直接进入回跳地址或首页 */
  useEffect(() => {
    const session = getSession();
    if (session) router.replace(returnTarget ?? `/${locale}`);
  }, [router, locale, returnTarget]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError(null);
    setFirstBanWarning(false);
    try {
      const res = await login({ username, password, remember_device: rememberDevice });
      saveSession(
        { username: res.username, role: res.role, realnameVerified: res.realname_verified },
        res.csrf_token
      );
      // Break-Glass 应急账号登录：根据是否已初始化跳转
      if (res.is_break_glass && res.must_setup) {
        router.replace(lp("/admin/setup"));
        return;
      }
      if (res.is_break_glass && !res.must_setup) {
        router.replace(lp("/admin/dashboard"));
        return;
      }
      // 强制改密优先；否则回跳地址优先，缺省跳网站首页
      router.replace(
        res.must_change_password ? lp("/admin/change-password") : (returnTarget ?? `/${locale}`)
      );
    } catch (err) {
      // 登录被防爆破封禁（401 + BizCode.LoginBlocked=1013）：首次封禁额外警告
      if (err instanceof ApiError && err.code === BizCode.LoginBlocked) {
        const envData = (err as ApiError).detail as
          | { data?: { first_ban?: boolean } }
          | undefined;
        if (envData?.data?.first_ban === true) {
          setFirstBanWarning(true);
        }
      }
      const msg = err instanceof Error ? err.message : t("admin.login.error");
      setError(msg);
    } finally {
      setPassword("");
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-background to-muted/30">
      <div className="absolute top-4 right-4">
        <AuthLocaleSwitcher />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <Card className="shadow-xl">
          <CardHeader className="text-center space-y-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mx-auto">
              <LogIn className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">{t("auth.login.title")}</CardTitle>
            <CardDescription>{t("auth.login.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="username">{t("admin.login.username")}</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  placeholder={t("admin.login.usernamePlaceholder")}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("admin.login.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={t("admin.login.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {firstBanWarning && (
                <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-2 rounded-md">
                  {t("admin.login.firstBanWarning")}
                </p>
              )}

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {error}
                </p>
              )}

              <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="size-4 rounded accent-primary cursor-pointer"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                />
                {t("admin.login.rememberDevice")}
              </label>

              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("admin.login.submitting")}
                  </>
                ) : (
                  t("admin.login.submit")
                )}
              </Button>
            </form>

            <div className="mt-5 flex items-center justify-between text-sm">
              <Link
                href={lp("/admin/forgot-password")}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                {t("admin.login.forgotPassword")}
              </Link>
              <Link
                href={lp("/auth/register")}
                className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
              >
                <UserPlus className="h-4 w-4" />
                {t("auth.login.toRegister")}
              </Link>
            </div>

            <div className="mt-4 text-center">
              <Button asChild variant="ghost" size="sm">
                <Link href={`/${locale}`}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  {t("admin.login.backToSite")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
