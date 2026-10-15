"use client";

/**
 * /auth/register - 用户端注册页（P0）
 * - zod + react-hook-form 表单校验：用户名 / 昵称 / 密码 / 确认密码 / 邮箱（选填）/ 手机号（选填）
 * - 页面不含任何角色选择控件：后端强制 role=member，admin 仅能由管理员后台创建或升级
 * - 注册成功跳转登录页 /login
 */
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import UserPlus from "@/assets/icons/user/user-plus.svg";
import ArrowLeft from "@/assets/icons/navigation/arrow-left.svg";
import LogIn from "@/assets/icons/navigation/log-in.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { useAdminLocale } from "@/app/admin/AdminProviders";
import { localeDisplayName, locales, localeToUrlLang, urlLangToLocale, type Locale } from "@/lib/i18n";
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
import { register } from "@/lib/api/auth";
import { getSession } from "@/lib/auth";

/** 表单校验 schema（与后端规则一致：用户名 2-64，密码强度由后端细化校验） */
const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(2, "用户名至少 2 个字符")
      .max(64, "用户名最长 64 个字符"),
    display_name: z
      .string()
      .trim()
      .min(1, "请输入昵称")
      .max(64, "昵称最长 64 个字符"),
    password: z.string().min(8, "密码至少 8 个字符").max(72, "密码最长 72 个字符"),
    confirm_password: z.string().min(1, "请再次输入密码"),
    email: z
      .string()
      .trim()
      .email("邮箱格式不正确")
      .max(128, "邮箱过长")
      .optional()
      .or(z.literal("")),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\- ]{5,32}$/, "手机号格式不正确")
      .optional()
      .or(z.literal("")),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "两次输入的密码不一致",
    path: ["confirm_password"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

/** 语言切换：跳转到对应语言前缀路由（/{lang}/auth/register） */
function AuthLocaleSwitcher() {
  const { locale } = useAdminLocale();
  const router = useRouter();
  return (
    <select
      value={locale}
      onChange={(e) =>
        router.replace(`/${localeToUrlLang(e.target.value as Locale)}/auth/register`)
      }
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

export default function AuthRegisterPage() {
  const { t, locale } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();
  const pathname = usePathname();
  const { setLocale } = useAdminLocale();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      display_name: "",
      password: "",
      confirm_password: "",
      email: "",
      phone: "",
    },
  });

  /** 从 URL 路径同步语言（/en-us/auth/register → en-us） */
  useEffect(() => {
    const urlLocale = pathname ? urlLangToLocale(pathname.split("/")[1] ?? "") : null;
    if (urlLocale && urlLocale !== locale) {
      setLocale(urlLocale);
    }
  }, [pathname, locale, setLocale]);

  /** 已登录用户直接进入首页 */
  useEffect(() => {
    const session = getSession();
    if (session) router.replace(`/${locale}`);
  }, [router, locale]);

  async function onSubmit(values: RegisterFormValues) {
    setServerError(null);
    try {
      await register({
        username: values.username,
        display_name: values.display_name,
        password: values.password,
        confirm_password: values.confirm_password,
        email: values.email || undefined,
        phone: values.phone || undefined,
      });
      // P0：注册成功跳转登录页
      router.replace(lp("/login"));
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t("auth.register.error"));
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
              <UserPlus className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">{t("auth.register.title")}</CardTitle>
            <CardDescription>{t("auth.register.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="username">{t("auth.register.username")}</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  placeholder={t("auth.register.usernamePlaceholder")}
                  aria-invalid={!!errors.username}
                  {...registerField("username")}
                />
                {errors.username && (
                  <p className="text-xs text-destructive">{errors.username.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="display_name">{t("auth.register.displayName")}</Label>
                <Input
                  id="display_name"
                  autoComplete="nickname"
                  placeholder={t("auth.register.displayNamePlaceholder")}
                  aria-invalid={!!errors.display_name}
                  {...registerField("display_name")}
                />
                {errors.display_name && (
                  <p className="text-xs text-destructive">{errors.display_name.message}</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="password">{t("auth.register.password")}</Label>
                  <PasswordInput
                    id="password"
                    autoComplete="new-password"
                    aria-invalid={!!errors.password}
                    {...registerField("password")}
                  />
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">{t("auth.register.confirmPassword")}</Label>
                  <PasswordInput
                    id="confirm_password"
                    autoComplete="new-password"
                    aria-invalid={!!errors.confirm_password}
                    {...registerField("confirm_password")}
                  />
                  {errors.confirm_password && (
                    <p className="text-xs text-destructive">{errors.confirm_password.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  {t("auth.register.email")}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {t("auth.register.optional")}
                  </span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  aria-invalid={!!errors.email}
                  {...registerField("email")}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">
                  {t("auth.register.phone")}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {t("auth.register.optional")}
                  </span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+86 138 0000 0000"
                  aria-invalid={!!errors.phone}
                  {...registerField("phone")}
                />
                {errors.phone && (
                  <p className="text-xs text-destructive">{errors.phone.message}</p>
                )}
              </div>

              {serverError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {serverError}
                </p>
              )}

              <Button type="submit" disabled={isSubmitting} className="w-full" size="lg">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("auth.register.submitting")}
                  </>
                ) : (
                  t("auth.register.submit")
                )}
              </Button>
            </form>

            <div className="mt-5 flex items-center justify-between text-sm">
              <Link
                href={lp("/login")}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
              >
                <LogIn className="h-4 w-4" />
                {t("auth.register.toLogin")}
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
