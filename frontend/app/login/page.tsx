"use client";

/**
 * /login - 统一登录入口（管理员 / 普通成员 / Break-Glass 共用）
 * 多语言路由：/zh-cn/login、/en-us/login 等（经 next.config 重写到本页）
 * - 裸路径 /login 由 proxy 按浏览器偏好补 locale 前缀
 * - URL 语言段是语言来源：访问某语言前缀即加载该语言文本，并写入 localStorage 记忆
 * - 右上角语言切换：更新 localStorage 并跳转到对应语言前缀的路由
 * 表单提交 POST /api/auth/login，登录凭据由后端写入 HttpOnly Cookie
 * - 如返回 must_change_password=true，跳转 /admin/change-password
 * - 管理员进入 /admin/dashboard；普通成员进入前台个人设置 /setting/profile
 * - Break-Glass 应急账号：未初始化 → /admin/setup；已初始化 → /admin/dashboard
 * - 第三方登录：按 /api/oauth/channels 开关显隐按钮，302 发起授权
 * - 登录选项：记住此设备（减少验证频率）；不在浏览器保存任何密码
 * - 底部含「注册账号」「忘记密码」「账号恢复」入口（合并自旧 /auth/login + /admin/login）
 */
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import LogIn from "@/assets/icons/navigation/log-in.svg";
import ShieldCheck from "@/assets/icons/status/shield-check.svg";
import ArrowLeft from "@/assets/icons/navigation/arrow-left.svg";
import Github from "@/assets/icons/brand/github.svg";
import Apple from "@/assets/icons/brand/apple.svg";
import Chrome from "@/assets/icons/brand/chrome.svg";
import LayoutGrid from "@/assets/icons/navigation/layout-grid.svg";
import UserPlus from "@/assets/icons/user/user-plus.svg";
import LayoutDashboard from "@/assets/icons/navigation/layout-dashboard.svg";
import Home from "@/assets/icons/navigation/home.svg";
import Check from "@/assets/icons/action/check.svg";
import Globe from "@/assets/icons/navigation/globe.svg";
import { useI18n } from "@/i18n/provider";
import { useAdminLocale } from "@/app/admin/AdminProviders";
import { useLocalizedPath } from "@/lib/navigation";
import { localeDisplayName, urlLangToLocale, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LanguagePopover } from "@/components/layout/LanguagePopover";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  login,
  login2FAVerify,
  login2FAResend,
} from "@/lib/api/auth";
import { listPublicOAuthChannels } from "@/lib/api/oauth";
import { ApiError } from "@/lib/api/client";
import { BizCode } from "@/types/response";
import { getSession, isAdminRole, saveSession } from "@/lib/auth";
import type { LoginResponse, OAuthProvider } from "@/types/api";

/** 登录后的默认落地页：管理员 → 后台仪表盘；普通成员 → 个人设置（均带 locale 前缀） */
function homeFor(role: string | undefined, locale: Locale) {
  return isAdminRole(role) ? `/${locale}/admin/dashboard` : `/${locale}/setting/profile`;
}

/**
 * 解析登录后回跳地址（/admin/** 守卫携带 next、/setting/** 守卫携带 returnUrl）。
 * 仅接受站内相对路径（以单个 / 开头），拒绝 //、\ 与绝对 URL，防开放重定向。
 */
function parseReturnTarget(): string | null {
  const raw =
    new URLSearchParams(window.location.search).get("returnUrl") ??
    new URLSearchParams(window.location.search).get("next");
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}

/** 语言切换：按钮样式 + 地球矢量图标 + 语言浮层（V0.5.8 §7.4 与首页按钮选择器样式统一） */
function LoginLocaleSwitcher() {
  const { locale } = useAdminLocale();
  const [open, setOpen] = useState(false);
  return (
    <LanguagePopover
      open={open}
      onOpenChange={setOpen}
      anchor={
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Language"
          onClick={() => setOpen(true)}
        >
          <Globe className="h-4 w-4" />
          {localeDisplayName(locale)}
        </Button>
      }
    />
  );
}

/** 第三方登录渠道品牌图标（仅展示用） */
const PROVIDER_ICONS: Record<OAuthProvider, React.ReactNode> = {
  github: <Github className="h-4 w-4" />,
  microsoft: <LayoutGrid className="h-4 w-4" />,
  apple: <Apple className="h-4 w-4" />,
  google: <Chrome className="h-4 w-4" />,
};

export default function LoginPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { setLocale } = useAdminLocale();
  const lp = useLocalizedPath();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 登录选项
  const [rememberDevice, setRememberDevice] = useState(false);
  // 登录后回跳目标：/admin/** 守卫的 next、/setting/** 守卫的 returnUrl（挂载时解析一次）
  const [returnTarget, setReturnTarget] = useState<string | null>(null);
  // 第三方登录：已启用的渠道（后端开关控制显隐）
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  // 首次封禁警告：登录失败返回 401 + 1013，data.first_ban=true 时显示警告
  const [firstBanWarning, setFirstBanWarning] = useState(false);
  // 管理员登录成功后选择入口：进入管理后台 / 官网首页（规格 §2.2）
  const [showAdminChoice, setShowAdminChoice] = useState(false);
  // V0.6.0 Issue7：邮箱验证码二次验证（陌生 IP/设备触发，密码已通过但未建立会话）
  const [pending2FA, setPending2FA] = useState(false);
  const [emailMasked, setEmailMasked] = useState<string | null>(null);
  const [code2FA, setCode2FA] = useState("");
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    setReturnTarget(parseReturnTarget());
  }, []);

  /** 从 URL 路径同步语言：访问 /en-us/login → 语言切换为 en-us（并写入 localStorage 记忆） */
  useEffect(() => {
    const urlLocale = pathname ? urlLangToLocale(pathname.split("/")[1] ?? "") : null;
    if (urlLocale && urlLocale !== locale) {
      setLocale(urlLocale);
    }
  }, [pathname, locale, setLocale]);

  /** 已登录用户直接进入回跳地址或对应首页（会话失效时目标页会再跳回登录页） */
  useEffect(() => {
    const session = getSession();
    if (session) router.replace(returnTarget ?? homeFor(session.role, locale));
  }, [router, locale, returnTarget]);

  /** 读取第三方渠道开关；URL 带 oauth_error=1 时展示失败提示 */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("oauth_error")) {
      setError(t("admin.login.oauthError"));
    }
    listPublicOAuthChannels()
      .then((channels) =>
        setOauthProviders(
          channels.filter((c) => c.enabled).map((c) => c.provider)
        )
      )
      .catch(() => setOauthProviders([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 发起第三方授权：整页跳转后端 302 到授权页 */
  function startOAuth(provider: OAuthProvider) {
    setError(null);
    // 回跳优先取 next/returnUrl（未登录守卫携带），否则按角色落地
    const next = parseReturnTarget() ?? lp("/admin/dashboard");
    window.location.href = `/api/oauth/${provider}/login?next=${encodeURIComponent(
      next
    )}`;
  }

  /** 二次验证码重发冷却倒计时 */
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(
      () => setResendCooldown((s) => (s <= 1 ? 0 : s - 1)),
      1000
    );
    return () => clearInterval(timer);
  }, [resendCooldown]);

  /**
   * 登录成功后的统一落地逻辑（login 与 2FA verify 共用）。
   * Break-Glass → 初始化向导/仪表盘；强制改密 → 改密页；补设安全问题 → 设置页；
   * 回跳目标优先；管理员弹入口选择；普通成员 → 个人设置。
   */
  function completeLogin(res: LoginResponse) {
    saveSession(
      {
        username: res.username,
        role: res.role,
        realnameVerified: res.realname_verified,
      },
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
    // 初始 / 被重置的密码 → 强制改密
    if (res.must_change_password) {
      router.replace(lp("/admin/change-password"));
      return;
    }
    // 存量用户未设安全问题 → 强制补设 3 个安全问题
    if (res.must_set_security_questions) {
      router.replace(lp("/auth/setup-security-questions"));
      return;
    }
    // 有回跳目标 → 优先回跳（/admin/** 或 /setting/** 守卫携带的 next/returnUrl）
    if (returnTarget) {
      router.replace(returnTarget);
      return;
    }
    // 管理员（非 BG）登录成功且无回跳目标 → 让用户选择进入后台或官网首页（规格 §2.2）
    if (isAdminRole(res.role)) {
      setShowAdminChoice(true);
      return;
    }
    // 普通成员 → 个人设置
    router.replace(homeFor(res.role, locale));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError(null);
    setFirstBanWarning(false);
    try {
      const res = await login({ username, password, remember_device: rememberDevice });
      // V0.6.0 Issue7：陌生 IP/设备触发邮箱验证码二次验证（响应不含会话 Cookie）
      if (res.requires_2fa) {
        setEmailMasked(res.email_masked ?? null);
        setCode2FA("");
        setResendCooldown(60);
        setPending2FA(true);
        return;
      }
      completeLogin(res);
    } catch (err) {
      // 登录被防爆破封禁（401 + BizCode.LoginBlocked=1013）：
      // 响应体 envelope.data.first_ban=true 表示首次进入封禁阶段，前端额外展示警告
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

  /** 二次验证：提交 6 位邮箱验证码，成功后与登录共用落地逻辑 */
  async function handle2FAVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code2FA.trim().length !== 6) return;
    setVerifying2FA(true);
    setError(null);
    try {
      const res = await login2FAVerify({
        username,
        code: code2FA.trim(),
        remember_device: rememberDevice,
      });
      setPending2FA(false);
      completeLogin(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("admin.login.error");
      setError(msg);
    } finally {
      setVerifying2FA(false);
    }
  }

  /** 重发验证码（后端 60s 冷却，前端倒计时同步） */
  async function handle2FAResend() {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      const res = await login2FAResend({ username });
      if (res.ok) {
        setResendCooldown(60);
      } else {
        setError(res.message || t("admin.login.error"));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("admin.login.error");
      setError(msg);
    } finally {
      setResending(false);
    }
  }

  /** 放弃二次验证，返回登录表单重新输入凭据 */
  function exit2FA() {
    setPending2FA(false);
    setCode2FA("");
    setEmailMasked(null);
    setError(null);
    setFirstBanWarning(false);
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-background to-muted/30">
      {/* 语言切换：未登录也能切换后台界面语言 */}
      <div className="absolute top-4 right-4">
        <LoginLocaleSwitcher />
      </div>

      {/* 管理员登录成功后选择入口（规格 §2.2）：进入管理后台 / 官网首页 */}
      <AnimatePresence>
        {showAdminChoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-md bg-background border border-border rounded-xl shadow-2xl p-6"
            >
              <div className="text-center mb-6">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mx-auto mb-3">
                  <Check className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-bold">
                  {t("admin.login.choiceTitle")}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("admin.login.choiceSubtitle")}
                </p>
              </div>
              <div className="space-y-3">
                <Button
                  size="lg"
                  className="w-full h-14 text-base"
                  onClick={() => router.replace(lp("/admin/dashboard"))}
                >
                  <LayoutDashboard className="h-5 w-5 mr-2" />
                  {t("admin.login.choiceAdmin")}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full h-14 text-base"
                  onClick={() => router.replace(`/${locale}`)}
                >
                  <Home className="h-5 w-5 mr-2" />
                  {t("admin.login.choiceHome")}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <Card className="shadow-xl">
          <CardHeader className="text-center space-y-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mx-auto">
              {pending2FA ? <ShieldCheck className="h-6 w-6" /> : <LogIn className="h-6 w-6" />}
            </div>
            <CardTitle className="text-2xl">
              {pending2FA ? t("admin.login.2fa.title") : t("admin.login.title")}
            </CardTitle>
            <CardDescription>
              {pending2FA
                ? emailMasked
                  ? t("admin.login.2fa.subtitleWithEmail", { email: emailMasked })
                  : t("admin.login.2fa.subtitle")
                : t("admin.login.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pending2FA ? (
              /* V0.6.0 Issue7：邮箱验证码二次验证卡片 */
              <form onSubmit={handle2FAVerify} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="code2fa">{t("admin.login.2fa.codeLabel")}</Label>
                  <Input
                    id="code2fa"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder={t("admin.login.2fa.codePlaceholder")}
                    maxLength={6}
                    autoFocus
                    value={code2FA}
                    onChange={(e) => setCode2FA(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={verifying2FA || code2FA.trim().length !== 6}
                  className="w-full"
                  size="lg"
                >
                  {verifying2FA ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("admin.login.2fa.verifying")}
                    </>
                  ) : (
                    t("admin.login.2fa.verify")
                  )}
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={handle2FAResend}
                    disabled={resendCooldown > 0 || resending}
                    className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resending
                      ? t("admin.login.2fa.resending")
                      : resendCooldown > 0
                        ? `${t("admin.login.2fa.resend")} (${resendCooldown}s)`
                        : t("admin.login.2fa.resend")}
                  </button>
                  <button
                    type="button"
                    onClick={exit2FA}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {t("admin.login.2fa.back")}
                  </button>
                </div>

                <div className="pt-1 text-center">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/${locale}`}>
                      <ArrowLeft className="h-4 w-4 mr-1.5" />
                      {t("admin.login.backToSite")}
                    </Link>
                  </Button>
                </div>
              </form>
            ) : (
              <>
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
                <PasswordInput
                  id="password"
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

              {/* 登录选项 */}
              <div className="space-y-2.5 pt-1">
                <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="size-4 rounded accent-primary cursor-pointer"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                  />
                  {t("admin.login.rememberDevice")}
                </label>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
                size="lg"
              >
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

            {/* 第三方登录：仅展示后端已启用的渠道 */}
            {oauthProviders.length > 0 && (
              <>
                <div className="my-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">
                    {t("admin.login.oauthDivider")}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {oauthProviders.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant="outline"
                      onClick={() => startOAuth(p)}
                      className="gap-2"
                    >
                      {PROVIDER_ICONS[p]}
                      <span className="capitalize">{p}</span>
                    </Button>
                  ))}
                </div>
              </>
            )}

            {/* 忘记密码 + 注册账号（V0.5.8：独立账号找回入口已合并进忘记密码） */}
            <div className="mt-4 flex items-center justify-between text-sm">
              <Link
                href={lp("/forgot-password")}
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
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
