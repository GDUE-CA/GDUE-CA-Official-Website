"use client";

/**
 * /auth/register - 用户端注册页（V0.5.8 三步分步向导）
 * 页面只做组合：语言切换 + 卡片壳 + RegisterWizard 业务组件
 * 注册成功不自动登录，用户在向导成功弹窗中自选跳转
 */
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import UserPlus from "@/assets/icons/user/user-plus.svg";
import ArrowLeft from "@/assets/icons/navigation/arrow-left.svg";
import LogIn from "@/assets/icons/navigation/log-in.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { useAdminLocale } from "@/app/admin/AdminProviders";
import { localeDisplayName, urlLangToLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LanguagePopover } from "@/components/layout/LanguagePopover";
import Globe from "@/assets/icons/navigation/globe.svg";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { RegisterWizard } from "@/components/auth/RegisterWizard";

/** 语言切换：按钮样式 + 地球矢量图标 + 语言浮层（V0.5.8 §7.4，与登录页/首页统一） */
function AuthLocaleSwitcher() {
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

export default function AuthRegisterPage() {
  const { t, locale } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();
  const pathname = usePathname();
  const { setLocale } = useAdminLocale();

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
            <RegisterWizard />

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
