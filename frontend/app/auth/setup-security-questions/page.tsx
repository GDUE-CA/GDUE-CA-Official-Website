"use client";

/**
 * /auth/setup-security-questions - 存量用户登录后强制补设 3 个安全问题
 *
 * 登录态页面：登录返回 must_set_security_questions=true 时由登录页跳转进入。
 * 需当前密码确认 → 提交后清零标记 → 跳回首页。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import ShieldCheck from "@/assets/icons/status/shield-check.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SecurityQuestionsForm } from "@/components/auth/SecurityQuestionsForm";
import { setupSecurityQuestions } from "@/lib/api/auth";
import { getSession } from "@/lib/auth";
import type { SecurityQuestionItem } from "@/types/api";

export default function SetupSecurityQuestionsPage() {
  const { t, locale } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [securityQuestions, setSecurityQuestions] = useState<SecurityQuestionItem[]>([
    { position: 1, question: "", answer: "", is_custom: false },
    { position: 2, question: "", answer: "", is_custom: false },
    { position: 3, question: "", answer: "", is_custom: false },
  ]);
  const [sqErrors, setSqErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 未登录用户不应进入此页，跳登录
  const session = getSession();
  if (!session) {
    if (typeof window !== "undefined") router.replace(lp("/login"));
    return null;
  }

  async function handleSubmit() {
    setError(null);
    if (!currentPassword) {
      setError(t("auth.setupSecurityQuestions.passwordRequired"));
      return;
    }
    // 校验 3 个安全问题（与后端规则一致：预设答案 ≥2，自定义答案 ≥6，自定义问题 ≥2）
    const errs: string[] = [];
    let valid = true;
    securityQuestions.forEach((item) => {
      const e: string[] = [];
      const q = item.question.trim();
      const a = item.answer.trim();
      if (!q) {
        e.push(t("auth.securityQuestions.questionRequired"));
        valid = false;
      } else if (item.is_custom && q.length < 2) {
        e.push(t("auth.securityQuestions.questionTooShort"));
        valid = false;
      }
      if (!a) {
        e.push(t("auth.securityQuestions.answerRequired"));
        valid = false;
      } else if (item.is_custom && a.length < 6) {
        e.push(t("auth.securityQuestions.answerTooShortCustom"));
        valid = false;
      } else if (!item.is_custom && a.length < 2) {
        e.push(t("auth.securityQuestions.answerTooShortPreset"));
        valid = false;
      }
      errs[item.position - 1] = e.join("；");
    });
    setSqErrors(errs);
    if (!valid) return;
    setLoading(true);
    try {
      await setupSecurityQuestions({
        current_password: currentPassword,
        questions: securityQuestions,
      });
      // 补设成功 → 跳首页
      router.replace(`/${locale}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.setupSecurityQuestions.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-background to-muted/30">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <Card className="shadow-xl">
          <CardHeader className="text-center space-y-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mx-auto">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">
              {t("auth.setupSecurityQuestions.title")}
            </CardTitle>
            <CardDescription>
              {t("auth.setupSecurityQuestions.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">
                  {t("auth.setupSecurityQuestions.currentPassword")}
                </Label>
                <PasswordInput
                  id="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-semibold">
                  {t("auth.securityQuestions.title")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("auth.securityQuestions.description")}
                </p>
                <SecurityQuestionsForm
                  value={securityQuestions}
                  onChange={setSecurityQuestions}
                  errors={sqErrors}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {error}
                </p>
              )}
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("auth.setupSecurityQuestions.submitting")}
                  </>
                ) : (
                  t("auth.setupSecurityQuestions.submit")
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
