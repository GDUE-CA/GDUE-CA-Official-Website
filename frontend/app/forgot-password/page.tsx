"use client";

/**
 * /forgot-password - 忘记密码（未登录找回，独立页面）
 * 多语言路由：/zh-cn/forgot-password、/en-us/forgot-password 等（经 next.config 重写到本页）
 *
 * 需求流程（邮箱验证码通道，区别于 /admin/forgot-password 人工审核通道）：
 * 1. 输入绑定邮箱 → 发送验证码（后端限流 + 防账号枚举：响应与邮箱是否存在无关）
 * 2. 填入验证码 + 新密码 + 确认新密码（统一 PasswordInput 眼睛切换，互不联动）
 * 3. 提交 → 校验通过后该账号全部会话强制下线（无保留本机选项）
 * 4. 跳转登录页重新登录
 *
 * Superadmin(Break-Glass) 无邮箱找回通道：其账号不在 users 表，验证码永不发出；
 * 遗忘只能通过环境变量 + 重启重置。
 */
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import MailQuestion from "@/assets/icons/status/mail-question.svg";
import ArrowLeft from "@/assets/icons/navigation/arrow-left.svg";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import LifeBuoy from "@/assets/icons/status/life-buoy.svg";
import { useI18n } from "@/i18n/provider";
import { useAdminLocale } from "@/app/admin/AdminProviders";
import { useLocalizedPath, useSwitchLocale } from "@/lib/navigation";
import { locales, localeDisplayName, urlLangToLocale, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
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
import { sendForgotPasswordCode, resetPasswordWithCode } from "@/lib/api/auth";
import { meetsPasswordPolicy } from "@/lib/passwordPolicy";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

/** 验证码发送按钮冷却（秒）：与后端同邮箱重发间隔对齐 */
const RESEND_COOLDOWN_SECONDS = 60;

/** 语言切换：只替换 URL 顶层 locale 段（与登录页一致） */
/** 后端请求体字段名（data-field 对位，与 1001 data.errors[].field 一致） */
type ForgotPasswordField =
  | "email" | "code" | "new_password" | "confirm_password";

function LocaleSwitcher() {
  const { locale } = useAdminLocale();
  const switchLocale = useSwitchLocale();
  return (
    <select
      value={locale}
      onChange={(e) => switchLocale(e.target.value as Locale)}
      aria-label="Language"
      className="h-8 rounded-md border border-input bg-background px-1.5 text-xs font-medium cursor-pointer"
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {localeDisplayName(l)}
        </option>
      ))}
    </select>
  );
}

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const lp = useLocalizedPath();
  const { locale, setLocale } = useAdminLocale();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldErrors = useServerFieldErrors<ForgotPasswordField>({ fallback: t("common.error") });
  const fe = fieldErrors.errors;
  const [tip, setTip] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  /** 从 URL 路径同步语言：/en-us/forgot-password → 语言切换为 en-us */
  useEffect(() => {
    const urlLocale = pathname ? urlLangToLocale(pathname.split("/")[1] ?? "") : null;
    if (urlLocale && urlLocale !== locale) {
      setLocale(urlLocale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, locale, setLocale]);

  /** 冷却倒计时 */
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /** 发送验证码 */
  async function handleSendCode() {
    if (!email.trim()) {
      setError(t("forgotPassword.emailRequired"));
      return;
    }
    setSending(true);
    setError(null);
    setTip(null);
    try {
      const res = await sendForgotPasswordCode({ email: email.trim() });
      // 防账号枚举：无论邮箱是否存在，展示统一模糊提示
      setTip(res.message ?? t("forgotPassword.codeSentTip"));
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(fieldErrors.capture(err));
    } finally {
      setSending(false);
    }
  }

  /** 提交重置 */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError(t("forgotPassword.emailRequired"));
      return;
    }
    if (!code.trim()) {
      setError(t("forgotPassword.codeRequired"));
      return;
    }
    if (newPwd !== confirmPwd) {
      setError(t("account.passwordMismatch"));
      return;
    }
    if (!meetsPasswordPolicy(newPwd)) {
      setError(t("common.passwordPolicy"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await resetPasswordWithCode({
        email: email.trim(),
        code: code.trim(),
        new_password: newPwd,
        confirm_password: confirmPwd,
      });
      setSuccess(true);
      // 全部会话已强制下线 → 跳转登录页
      setTimeout(() => router.replace(lp("/login")), 2000);
    } catch (err) {
      setError(fieldErrors.capture(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-background to-muted/30">
      {/* 语言切换 */}
      <div className="absolute top-4 right-4">
        <LocaleSwitcher />
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
              <MailQuestion className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">{t("forgotPassword.title")}</CardTitle>
            <CardDescription>{t("forgotPassword.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-lg font-medium">{t("forgotPassword.success")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("forgotPassword.successHint")}
                </p>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form {...fieldErrors.rootProps} onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* 邮箱 + 发送验证码 */}
                <div className="space-y-2" data-field="email">
                  <Label htmlFor="fp-email">{t("forgotPassword.email")}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="fp-email"
                      aria-invalid={!!fe.email}
                      type="email"
                      autoComplete="email"
                      placeholder={t("forgotPassword.emailPlaceholder")}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError(null);
                      }}
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      disabled={sending || cooldown > 0}
                      onClick={handleSendCode}
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : cooldown > 0 ? (
                        `${cooldown}s`
                      ) : (
                        t("forgotPassword.sendCode")
                      )}
                    </Button>
                  </div>
                  <FieldError>{fe.email}</FieldError>
                </div>

                {/* 验证码 */}
                <div className="space-y-2" data-field="code">
                  <Label htmlFor="fp-code">{t("forgotPassword.code")}</Label>
                  <Input
                    id="fp-code"
                    aria-invalid={!!fe.code}
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    placeholder={t("forgotPassword.codePlaceholder")}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, ""));
                      setError(null);
                    }}
                    required
                  />
                  <FieldError>{fe.code}</FieldError>
                </div>

                {/* 新密码 / 确认新密码（统一 PasswordInput，互不联动） */}
                <div className="space-y-2" data-field="new_password">
                  <Label htmlFor="fp-newPassword">{t("account.newPassword")}</Label>
                  <PasswordInput
                    id="fp-newPassword"
                    aria-invalid={!!fe.new_password}
                    autoComplete="new-password"
                    placeholder={t("account.newPasswordPlaceholder")}
                    value={newPwd}
                    onChange={(e) => {
                      setNewPwd(e.target.value);
                      setError(null);
                    }}
                    required
                  />
                  <FieldError>{fe.new_password}</FieldError>
                </div>
                <div className="space-y-2" data-field="confirm_password">
                  <Label htmlFor="fp-confirmPassword">{t("account.confirmPassword")}</Label>
                  <PasswordInput
                    id="fp-confirmPassword"
                    aria-invalid={!!fe.confirm_password}
                    autoComplete="new-password"
                    placeholder={t("account.confirmPasswordPlaceholder")}
                    value={confirmPwd}
                    onChange={(e) => {
                      setConfirmPwd(e.target.value);
                      setError(null);
                    }}
                    required
                  />
                  <FieldError>{fe.confirm_password}</FieldError>
                </div>

                <p className="text-xs text-muted-foreground">{t("common.passwordPolicy")}</p>

                {tip && (
                  <p className="text-sm text-muted-foreground bg-muted/60 px-3 py-2 rounded-md">
                    {tip}
                  </p>
                )}
                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={submitting} className="w-full" size="lg">
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("forgotPassword.submitting")}
                    </>
                  ) : (
                    t("forgotPassword.submit")
                  )}
                </Button>
              </form>
            )}

            {/* 邮箱不可用的人工通道 + 返回登录 */}
            <div className="mt-4 space-y-2">
              <Link
                href={lp("/admin/forgot-password")}
                className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <LifeBuoy className="h-3.5 w-3.5" />
                {t("forgotPassword.manualEntry")}
              </Link>
              <div className="text-center">
                <Button asChild variant="ghost" size="sm">
                  <Link href={lp("/login")}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    {t("forgotPassword.backToLogin")}
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
