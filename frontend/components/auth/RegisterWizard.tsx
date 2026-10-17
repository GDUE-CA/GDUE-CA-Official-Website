"use client";

/**
 * RegisterWizard —— 注册三步分步向导（V0.5.8 §2）
 *
 * 规则：
 * - 三步强制顺序执行：Step1 邮箱验证 → Step2 账号信息 → Step3 安全问答；
 * - 禁止跳步：步骤指示器不可点击，前进必须过校验，回退只能逐层回退；
 * - 数据仅前端组件态暂存，仅最后一步提交才写入数据库；中途关闭页面即清空；
 * - 进入第二步后邮箱只读，回退第一步才可更换（更换后验证码状态重置）；
 * - 注册成功不自动登录：弹窗二选一（前往个人主页 / 返回首页）。
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  register,
  sendRegisterCode,
  checkRegisterUsername,
} from "@/lib/api/auth";
import { SecurityQuestionsForm } from "@/components/auth/SecurityQuestionsForm";
import { checkSecurityQuestionText } from "@/lib/securityQuestionFilter";
import { meetsPasswordPolicy } from "@/lib/passwordPolicy";
import type { SecurityQuestionItem } from "@/types/api";

/** 验证码重发冷却（秒）：与后端同邮箱重发间隔对齐 */
const RESEND_COOLDOWN_SECONDS = 60;
/** 自定义问题答案最小长度（与后端一致） */
const CUSTOM_MIN_ANSWER_LEN = 6;
/** 预设问题答案最小长度（与后端一致） */
const PRESET_MIN_ANSWER_LEN = 2;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UsernameStatus = "idle" | "checking" | "available" | "taken";

export function RegisterWizard() {
  const { t, locale } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [serverError, setServerError] = useState<string | null>(null);

  // Step1：邮箱 + 验证码
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [codeTip, setCodeTip] = useState<string | null>(null);

  // Step2：账号信息
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step3：安全问答
  const [securityQuestions, setSecurityQuestions] = useState<SecurityQuestionItem[]>([
    { position: 1, question: "", answer: "", is_custom: false },
    { position: 2, question: "", answer: "", is_custom: false },
    { position: 3, question: "", answer: "", is_custom: false },
  ]);
  const [sqErrors, setSqErrors] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  /** 冷却倒计时 */
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /** 用户名占用检查（500ms 防抖） */
  useEffect(() => {
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    const name = username.trim();
    if (name.length < 2 || name.length > 64) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    usernameTimer.current = setTimeout(() => {
      checkRegisterUsername(name)
        .then((res) => setUsernameStatus(res.available ? "available" : "taken"))
        .catch(() => setUsernameStatus("idle"));
    }, 500);
    return () => {
      if (usernameTimer.current) clearTimeout(usernameTimer.current);
    };
  }, [username]);

  /** Step1：发送验证码 */
  async function handleSendCode() {
    const addr = email.trim();
    if (!addr || !EMAIL_RE.test(addr)) {
      setServerError(t("auth.register.wizard.emailInvalid"));
      return;
    }
    setSending(true);
    setServerError(null);
    try {
      const res = await sendRegisterCode(addr);
      setCodeSent(true);
      setCodeTip(res.message || t("auth.register.wizard.codeSentTip"));
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      // 邮箱占用等显式错误（后端 400「邮箱已被使用」）
      setServerError(err instanceof Error ? err.message : t("auth.register.error"));
    } finally {
      setSending(false);
    }
  }

  /** Step1 → Step2 */
  function nextFromStep1() {
    const addr = email.trim();
    if (!addr || !EMAIL_RE.test(addr)) {
      setServerError(t("auth.register.wizard.emailInvalid"));
      return;
    }
    if (!codeSent) {
      setServerError(t("auth.register.wizard.sendCodeFirst"));
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setServerError(t("auth.register.wizard.codeRequired"));
      return;
    }
    setServerError(null);
    setStep(2);
  }

  /** Step2 → Step3 */
  function nextFromStep2() {
    const name = username.trim();
    if (name.length < 2 || name.length > 64) {
      setServerError(t("auth.register.wizard.usernameInvalid"));
      return;
    }
    if (usernameStatus === "taken") {
      setServerError(t("auth.register.wizard.usernameTaken"));
      return;
    }
    if (usernameStatus === "checking") {
      setServerError(t("auth.register.wizard.usernameChecking"));
      return;
    }
    if (!displayName.trim()) {
      setServerError(t("auth.register.wizard.displayNameRequired"));
      return;
    }
    if (!meetsPasswordPolicy(password)) {
      setServerError(t("common.passwordPolicy"));
      return;
    }
    if (password !== confirmPassword) {
      setServerError(t("account.passwordMismatch"));
      return;
    }
    setServerError(null);
    setStep(3);
  }

  /** Step3 本地校验：三组全填 + 长度规则 + 前端黑名单双重拦截 */
  function validateSecurityQuestions(): boolean {
    const errs: string[] = [];
    let valid = true;
    securityQuestions.forEach((item) => {
      const itemErrs: string[] = [];
      const question = item.question.trim();
      const answer = item.answer.trim();
      if (question.length < 2) {
        itemErrs.push(t("auth.securityQuestions.questionRequired"));
        valid = false;
      } else if (item.is_custom) {
        const hit = checkSecurityQuestionText(question);
        if (hit) {
          itemErrs.push(
            t(
              hit === "privacy"
                ? "auth.securityQuestions.blacklistPrivacy"
                : "auth.securityQuestions.blacklistSensitive"
            )
          );
          valid = false;
        }
      }
      if (!answer) {
        itemErrs.push(t("auth.securityQuestions.answerRequired"));
        valid = false;
      } else if (item.is_custom && answer.length < CUSTOM_MIN_ANSWER_LEN) {
        itemErrs.push(t("auth.securityQuestions.answerTooShortCustom"));
        valid = false;
      } else if (!item.is_custom && answer.length < PRESET_MIN_ANSWER_LEN) {
        itemErrs.push(t("auth.securityQuestions.answerTooShortPreset"));
        valid = false;
      }
      errs[item.position - 1] = itemErrs.join("；");
    });
    setSqErrors(errs);
    return valid;
  }

  /** 最终提交：仅此处写库 */
  async function handleSubmit() {
    if (!validateSecurityQuestions()) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await register({
        username: username.trim(),
        display_name: displayName.trim(),
        password,
        confirm_password: confirmPassword,
        email: email.trim(),
        code: code.trim(),
        security_questions: securityQuestions,
      });
      // 注册成功：不自动登录，弹窗二选一
      setSuccessOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("auth.register.error");
      setServerError(msg);
      // 验证码 / 邮箱类错误回退第一步；用户名占用回退第二步
      if (msg.includes("验证码") || msg.includes("邮箱")) {
        setStep(1);
      } else if (msg.includes("用户名")) {
        setStep(2);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const steps = [
    t("auth.register.wizard.stepEmail"),
    t("auth.register.wizard.stepAccount"),
    t("auth.register.wizard.stepSecurity"),
  ];

  return (
    <>
      {/* 步骤指示器（不可点击，禁止跳步） */}
      <div className="mb-6 flex items-center">
        {steps.map((label, idx) => {
          const num = idx + 1;
          const active = num === step;
          const done = num < step;
          return (
            <div key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {num}
                </div>
                <span
                  className={`text-[11px] whitespace-nowrap ${
                    active ? "text-foreground font-medium" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </div>
              {num < steps.length && (
                <div
                  className={`mx-2 mb-5 h-px flex-1 ${done ? "bg-primary/40" : "bg-border"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-email">{t("auth.register.email")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setServerError(null);
                      // 更换邮箱后验证码状态重置
                      if (codeSent) {
                        setCodeSent(false);
                        setCode("");
                        setCodeTip(null);
                        setCooldown(0);
                      }
                    }}
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
                      t("auth.register.wizard.sendCode")
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-code">{t("auth.register.wizard.emailCode")}</Label>
                <Input
                  id="reg-code"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder={t("auth.register.wizard.codePlaceholder")}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, ""));
                    setServerError(null);
                  }}
                />
              </div>
              {codeTip && (
                <p className="text-sm text-muted-foreground bg-muted/60 px-3 py-2 rounded-md">
                  {codeTip}
                </p>
              )}
              {serverError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {serverError}
                </p>
              )}
              <Button type="button" className="w-full" size="lg" onClick={nextFromStep1}>
                {t("auth.register.wizard.next")}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {/* 邮箱只读回显：回退第一步才可更换 */}
              <div className="space-y-2">
                <Label>{t("auth.register.email")}</Label>
                <div className="flex h-10 items-center rounded-md border border-border bg-muted/50 px-3 text-sm text-muted-foreground">
                  {email}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-username">{t("auth.register.username")}</Label>
                <Input
                  id="reg-username"
                  autoComplete="username"
                  placeholder={t("auth.register.usernamePlaceholder")}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setServerError(null);
                  }}
                />
                {usernameStatus === "checking" && (
                  <p className="text-xs text-muted-foreground">
                    {t("auth.register.wizard.usernameChecking")}
                  </p>
                )}
                {usernameStatus === "available" && (
                  <p className="text-xs text-green-600">
                    {t("auth.register.wizard.usernameAvailable")}
                  </p>
                )}
                {usernameStatus === "taken" && (
                  <p className="text-xs text-destructive">
                    {t("auth.register.wizard.usernameTaken")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-displayName">{t("auth.register.displayName")}</Label>
                <Input
                  id="reg-displayName"
                  autoComplete="nickname"
                  placeholder={t("auth.register.displayNamePlaceholder")}
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setServerError(null);
                  }}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reg-password">{t("auth.register.password")}</Label>
                  <PasswordInput
                    id="reg-password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setServerError(null);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-confirmPassword">
                    {t("auth.register.confirmPassword")}
                  </Label>
                  <PasswordInput
                    id="reg-confirmPassword"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setServerError(null);
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("common.passwordPolicy")}</p>
              {serverError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {serverError}
                </p>
              )}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setServerError(null);
                    setStep(1);
                  }}
                >
                  {t("auth.register.wizard.prev")}
                </Button>
                <Button type="button" className="flex-1" onClick={nextFromStep2}>
                  {t("auth.register.wizard.next")}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">
                  {t("auth.securityQuestions.title")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("auth.securityQuestions.description")}
                </p>
              </div>
              <SecurityQuestionsForm
                value={securityQuestions}
                onChange={(items) => {
                  setSecurityQuestions(items);
                  setSqErrors([]);
                }}
                errors={sqErrors}
              />
              {serverError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {serverError}
                </p>
              )}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={submitting}
                  onClick={() => {
                    setServerError(null);
                    setStep(2);
                  }}
                >
                  {t("auth.register.wizard.prev")}
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("auth.register.submitting")}
                    </>
                  ) : (
                    t("auth.register.submit")
                  )}
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* 注册成功弹窗：不自动登录，用户二选一跳转（不可关闭，强制选择） */}
      <Dialog open={successOpen} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-sm text-center"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="mx-auto mb-2">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <DialogTitle className="text-center">
              {t("auth.register.wizard.successTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("auth.register.wizard.successDesc")}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <Button onClick={() => router.replace(lp("/setting/profile"))}>
              {t("auth.register.wizard.goProfile")}
            </Button>
            <Button variant="outline" onClick={() => router.replace(`/${locale}`)}>
              {t("auth.register.wizard.goHome")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
