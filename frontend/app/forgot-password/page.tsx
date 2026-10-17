"use client";

/**
 * /forgot-password - 忘记密码 / 找回账号统一入口（V0.5.8 §5.1）
 * 页面只做组合：语言切换 + 卡片壳 + ForgotPasswordWizard 业务组件
 *
 * 全站唯一找回入口：账号找回、密码重置、人工审核全部集成在向导内；
 * 独立账号找回页（/auth/recover）已废弃删除。
 *
 * Superadmin(Break-Glass) 无任何找回通道：其账号不在 users 表；
 * 遗忘只能通过环境变量 + 重启重置。
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import MailQuestion from "@/assets/icons/status/mail-question.svg";
import ArrowLeft from "@/assets/icons/navigation/arrow-left.svg";
import Globe from "@/assets/icons/navigation/globe.svg";
import { useI18n } from "@/i18n/provider";
import { useAdminLocale } from "@/app/admin/AdminProviders";
import { useLocalizedPath } from "@/lib/navigation";
import { localeDisplayName, urlLangToLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LanguagePopover } from "@/components/layout/LanguagePopover";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ForgotPasswordWizard } from "@/components/auth/ForgotPasswordWizard";

/** 语言切换：按钮样式 + 地球矢量图标 + 语言浮层（V0.5.8 §7.4，与登录页/注册页统一） */
function LocaleSwitcher() {
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

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const pathname = usePathname();
  const lp = useLocalizedPath();
  const { locale, setLocale } = useAdminLocale();

  /** 从 URL 路径同步语言：/en-us/forgot-password → 语言切换为 en-us */
  useEffect(() => {
    const urlLocale = pathname ? urlLangToLocale(pathname.split("/")[1] ?? "") : null;
    if (urlLocale && urlLocale !== locale) {
      setLocale(urlLocale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, locale, setLocale]);

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
            <ForgotPasswordWizard />

            <div className="mt-4 text-center">
              <Button asChild variant="ghost" size="sm">
                <Link href={lp("/login")}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  {t("forgotPassword.backToLogin")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
