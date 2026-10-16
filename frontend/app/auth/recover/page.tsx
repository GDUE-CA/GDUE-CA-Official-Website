"use client";

/**
 * /auth/recover - 安全问题恢复账号页
 *
 * 公开页面，无需登录。两步流程封装在 RecoverForm 组件内：
 * 1. 输入用户名 → 取 3 个安全问题
 * 2. 回答 + 新密码 → 重置
 *
 * 失败可回退到 /auth/forgot-password（邮箱验证码重置）。
 */
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import KeyRound from "@/assets/icons/status/key-round.svg";
import ArrowLeft from "@/assets/icons/navigation/arrow-left.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { useAdminLocale } from "@/app/admin/AdminProviders";
import { localeDisplayName, locales, localeToUrlLang, urlLangToLocale, type Locale } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecoverForm } from "@/components/auth/RecoverForm";

/** 语言切换器（未登录可用） */
function AuthLocaleSwitcher() {
  const { locale } = useAdminLocale();
  const router = useRouter();
  return (
    <select
      value={locale}
      onChange={(e) =>
        router.replace(`/${localeToUrlLang(e.target.value as Locale)}/auth/recover`)
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

export default function AuthRecoverPage() {
  const { t, locale } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();
  const pathname = usePathname();
  const { locale: ctxLocale, setLocale } = useAdminLocale();

  // 从 URL 路径同步语言
  if (typeof window !== "undefined") {
    const urlLocale = pathname ? urlLangToLocale(pathname.split("/")[1] ?? "") : null;
    if (urlLocale && urlLocale !== ctxLocale) {
      setLocale(urlLocale);
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
              <KeyRound className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">{t("auth.recover.title")}</CardTitle>
            <CardDescription>{t("auth.recover.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <RecoverForm />
            <div className="mt-4 text-center">
              <Button asChild variant="ghost" size="sm">
                <button
                  type="button"
                  onClick={() => router.push(`/${locale}`)}
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  {t("admin.login.backToSite")}
                </button>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
