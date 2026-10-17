"use client";

/**
 * 安全问题恢复账号表单（/auth/recover 页面用）
 *
 * 两步流程：
 * 1. 输入用户名 → GET /api/auth/security-questions 取 3 个问题
 * 2. 回答 + 新密码 → POST /api/auth/recover 重置密码
 *
 * 防枚举：账号不存在时后端返回固定假问题，前端无感知；
 * 答错 < 2/3 时后端模糊 403，失败提示转 /auth/forgot-password。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import KeyRound from "@/assets/icons/status/key-round.svg";
import ArrowLeft from "@/assets/icons/navigation/arrow-left.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { fetchSecurityQuestions, recoverViaSecurityQuestions } from "@/lib/api/auth";
import type { SecurityQuestionOutItem, SecurityAnswerItem } from "@/types/api";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

export function RecoverForm() {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState("");
  const [questions, setQuestions] = useState<SecurityQuestionOutItem[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({ 1: "", 2: "", 3: "" });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 第 2 步行内错误：字段名对齐后端（答案为数组路径 answers.{下标}.answer）
  const recoverFields = useServerFieldErrors({ fallback: t("auth.recover.fail") });
  const rfe = recoverFields.errors;
  const [loading, setLoading] = useState(false);

  /** 渲染问题文本：预设用 i18n key 翻译，自定义直接显示原文 */
  function renderQuestion(q: SecurityQuestionOutItem): string {
    return q.is_custom ? q.question : t(q.question);
  }

  async function handleFetchQuestions() {
    setError(null);
    const name = username.trim();
    if (!name) {
      setError(t("auth.recover.usernameRequired"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetchSecurityQuestions(name);
      setQuestions(res.questions);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.recover.error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitRecover() {
    setError(null);
    const answerItems: SecurityAnswerItem[] = questions.map((q) => ({
      position: q.position,
      answer: (answers[q.position] ?? "").trim(),
    }));
    const localErrors: Record<string, string> = {};
    answerItems.forEach((a, i) => {
      if (!a.answer) localErrors[`answers.${i}.answer`] = t("auth.recover.answerAll");
    });
    if (!newPassword) localErrors.new_password = t("auth.recover.passwordRequired");
    else if (newPassword !== confirmPassword) {
      localErrors.confirm_password = t("auth.recover.passwordMismatch");
    }
    if (recoverFields.set(localErrors)) return;
    setLoading(true);
    try {
      await recoverViaSecurityQuestions({
        username,
        answers: answerItems,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      // 恢复成功：跳登录页，后端已置 must_change_password=True
      router.replace(lp("/login"));
    } catch (e) {
      setError(recoverFields.capture(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {step === 1 && (
        <div className="space-y-2">
          <Label htmlFor="recover-username">{t("auth.recover.username")}</Label>
          <Input
            id="recover-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("auth.recover.usernamePlaceholder")}
            autoComplete="username"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleFetchQuestions();
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            type="button"
            onClick={handleFetchQuestions}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("auth.recover.loading")}
              </>
            ) : (
              t("auth.recover.getQuestions")
            )}
          </Button>
        </div>
      )}

      {step === 2 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
          {...recoverFields.rootProps}
        >
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {t("auth.recover.account")}: <span className="font-medium text-foreground">{username}</span>
          </div>
          {questions.map((q, i) => (
            <div key={q.position} className="space-y-2" data-field={`answers.${i}.answer`}>
              <Label className="text-sm font-medium">
                {t("auth.securityQuestions.question")} {q.position}
              </Label>
              <p className="text-sm text-foreground">{renderQuestion(q)}</p>
              <Input
                value={answers[q.position] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [q.position]: e.target.value }))
                }
                placeholder={t("auth.recover.answerPlaceholder")}
                autoComplete="off"
                type="text"
                maxLength={256}
                aria-invalid={!!rfe[`answers.${i}.answer`]}
              />
              <FieldError>{rfe[`answers.${i}.answer`]}</FieldError>
            </div>
          ))}
          <div className="space-y-2" data-field="new_password">
            <Label htmlFor="recover-new-password">{t("auth.recover.newPassword")}</Label>
            <PasswordInput
              id="recover-new-password"
              aria-invalid={!!rfe.new_password}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <FieldError>{rfe.new_password}</FieldError>
          </div>
          <div className="space-y-2" data-field="confirm_password">
            <Label htmlFor="recover-confirm">{t("auth.recover.confirmPassword")}</Label>
            <PasswordInput
              id="recover-confirm"
              aria-invalid={!!rfe.confirm_password}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            <FieldError>{rfe.confirm_password}</FieldError>
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </p>
          )}
          <Button
            type="button"
            onClick={handleSubmitRecover}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("auth.recover.submitting")}
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4" />
                {t("auth.recover.submit")}
              </>
            )}
          </Button>
        </motion.div>
      )}

      <div className="text-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push(lp("/auth/forgot-password"))}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {t("auth.recover.fallback")}
        </Button>
      </div>
    </div>
  );
}
