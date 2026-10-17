"use client";

/**
 * ForgotPasswordWizard —— 忘记密码 / 找回账号多分支向导（V0.5.8 §5）
 *
 * 分支路由（统一入口，独立账号找回页已废弃）：
 * - 分支1 记得用户名 → identify 后选择验证方式；
 * - 分支2 只记得绑定邮箱 → identify 匹配后同选验证方式；
 * - 分支3 用户名、邮箱全部不记得 → 直接强制人工审核；
 * 验证方式：邮箱验证码（需完整输入绑定邮箱）/ 安全问题（答对 2/3）/ 一次性安全恢复码；
 * 全部无法通过 → 人工审核（校内 / 社会外部双表单，结果邮件通知）。
 */
import { useEffect, useState } from "react";
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
import {
  forgotIdentify,
  sendForgotPasswordCode,
  resetPasswordWithCode,
  fetchSecurityQuestions,
  recoverViaSecurityQuestions,
  resetPasswordWithRecoveryCode,
  submitManualReview,
} from "@/lib/api/auth";
import { meetsPasswordPolicy } from "@/lib/passwordPolicy";
import type {
  ForgotIdentifyResult,
  SecurityQuestionOutItem,
  SecurityAnswerItem,
} from "@/types/api";

/** 验证码重发冷却（秒）：与后端同邮箱重发间隔对齐 */
const RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_CARD_RE = /^\d{15}(\d{2}[\dXx])?$/;

type View = "identify" | "methods" | "email" | "sq" | "recovery" | "manual" | "success";

export function ForgotPasswordWizard() {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();

  const [view, setView] = useState<View>("identify");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 识别阶段
  const [account, setAccount] = useState("");
  const [identify, setIdentify] = useState<ForgotIdentifyResult | null>(null);

  // 邮箱验证码通道
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [tip, setTip] = useState<string | null>(null);

  // 安全问题通道
  const [questions, setQuestions] = useState<SecurityQuestionOutItem[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({ 1: "", 2: "", 3: "" });

  // 恢复码通道
  const [recoveryCode, setRecoveryCode] = useState("");

  // 新密码（邮箱 / 安全问题 / 恢复码通道共用）
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  // 人工审核双表单
  const [kind, setKind] = useState<"school" | "external">("school");
  const [contactEmail, setContactEmail] = useState("");
  const [realName, setRealName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [idCard, setIdCard] = useState("");
  const [college, setCollege] = useState("");
  const [major, setMajor] = useState("");
  const [className, setClassName] = useState("");
  const [registerTimeHint, setRegisterTimeHint] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [manualDone, setManualDone] = useState(false);

  /** 冷却倒计时 */
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /** 切换视图时清空错误与一次性状态 */
  function go(v: View) {
    setError(null);
    setTip(null);
    setView(v);
  }

  /* ---------- 入口：账号识别（分支1/2） ---------- */
  async function handleIdentify() {
    const acc = account.trim();
    if (acc.length < 2) {
      setError(t("forgotPassword.wizard.accountRequired"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await forgotIdentify(acc);
      if (!res.exists) {
        setError(t("forgotPassword.wizard.accountNotFound"));
        return;
      }
      setIdentify(res);
      // 分支2：账号即邮箱时邮箱通道预填
      if (EMAIL_RE.test(acc)) setEmail(acc);
      go("methods");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  /* ---------- 邮箱验证码通道 ---------- */
  async function handleSendCode() {
    const addr = email.trim();
    if (!addr || !EMAIL_RE.test(addr)) {
      setError(t("forgotPassword.emailRequired"));
      return;
    }
    setSending(true);
    setError(null);
    setTip(null);
    try {
      const res = await sendForgotPasswordCode({ email: addr });
      setTip(res.message ?? t("forgotPassword.codeSentTip"));
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSending(false);
    }
  }

  function validateNewPassword(): boolean {
    if (newPwd !== confirmPwd) {
      setError(t("account.passwordMismatch"));
      return false;
    }
    if (!meetsPasswordPolicy(newPwd)) {
      setError(t("common.passwordPolicy"));
      return false;
    }
    return true;
  }

  async function handleEmailReset() {
    if (!email.trim() || !EMAIL_RE.test(email.trim())) {
      setError(t("forgotPassword.emailRequired"));
      return;
    }
    if (!code.trim()) {
      setError(t("forgotPassword.codeRequired"));
      return;
    }
    if (!validateNewPassword()) return;
    setLoading(true);
    setError(null);
    try {
      await resetPasswordWithCode({
        email: email.trim(),
        code: code.trim(),
        new_password: newPwd,
        confirm_password: confirmPwd,
      });
      go("success");
      setTimeout(() => router.replace(lp("/login")), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  /* ---------- 安全问题通道 ---------- */
  async function enterSqChannel() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSecurityQuestions(account.trim());
      setQuestions(res.questions);
      go("sq");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.recover.error"));
    } finally {
      setLoading(false);
    }
  }

  /** 问题渲染：历史 i18n key 快照走翻译，其余（文本快照 / 自定义）直接显示 */
  function renderQuestion(q: SecurityQuestionOutItem): string {
    if (!q.is_custom && q.question.startsWith("sq.")) return t(q.question);
    return q.question;
  }

  async function handleSqReset() {
    const answerItems: SecurityAnswerItem[] = questions.map((q) => ({
      position: q.position,
      answer: (answers[q.position] ?? "").trim(),
    }));
    if (answerItems.some((a) => !a.answer)) {
      setError(t("auth.recover.answerAll"));
      return;
    }
    if (!validateNewPassword()) return;
    setLoading(true);
    setError(null);
    try {
      const acc = account.trim();
      await recoverViaSecurityQuestions({
        ...(EMAIL_RE.test(acc) ? { email: acc } : { username: acc }),
        answers: answerItems,
        new_password: newPwd,
        confirm_password: confirmPwd,
      });
      go("success");
      setTimeout(() => router.replace(lp("/login")), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.recover.fail"));
    } finally {
      setLoading(false);
    }
  }

  /* ---------- 恢复码通道 ---------- */
  async function handleRecoveryReset() {
    if (!recoveryCode.trim()) {
      setError(t("forgotPassword.wizard.recoveryCodeRequired"));
      return;
    }
    if (!validateNewPassword()) return;
    setLoading(true);
    setError(null);
    try {
      await resetPasswordWithRecoveryCode({
        account: account.trim(),
        recovery_code: recoveryCode.trim(),
        new_password: newPwd,
        confirm_password: confirmPwd,
      });
      go("success");
      setTimeout(() => router.replace(lp("/login")), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  /* ---------- 人工审核双表单（分支3 强制入口） ---------- */
  async function handleManualSubmit() {
    if (!contactEmail.trim() || !EMAIL_RE.test(contactEmail.trim())) {
      setError(t("forgotPassword.wizard.contactEmailRequired"));
      return;
    }
    if (!realName.trim()) {
      setError(t("forgotPassword.wizard.realNameRequired"));
      return;
    }
    if (kind === "school" && !studentId.trim()) {
      setError(t("forgotPassword.wizard.studentIdRequired"));
      return;
    }
    if (kind === "external") {
      if (!idCard.trim()) {
        setError(t("forgotPassword.wizard.idCardRequired"));
        return;
      }
      if (!ID_CARD_RE.test(idCard.trim())) {
        setError(t("forgotPassword.wizard.idCardInvalid"));
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const acc = account.trim();
      await submitManualReview({
        kind,
        contact_email: contactEmail.trim(),
        account_hint: acc || undefined,
        real_name: realName.trim(),
        student_id: kind === "school" ? studentId.trim() : undefined,
        id_card: kind === "external" ? idCard.trim() : undefined,
        college: college.trim() || undefined,
        major: major.trim() || undefined,
        class_name: className.trim() || undefined,
        register_time_hint: registerTimeHint.trim() || undefined,
        old_password: oldPassword || undefined,
      });
      setManualDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  /* ---------- 新密码公共字段 ---------- */
  function newPasswordFields() {
    return (
      <>
        <div className="space-y-2">
          <Label htmlFor="fp-newPassword">{t("account.newPassword")}</Label>
          <PasswordInput
            id="fp-newPassword"
            autoComplete="new-password"
            placeholder={t("account.newPasswordPlaceholder")}
            value={newPwd}
            onChange={(e) => {
              setNewPwd(e.target.value);
              setError(null);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fp-confirmPassword">{t("account.confirmPassword")}</Label>
          <PasswordInput
            id="fp-confirmPassword"
            autoComplete="new-password"
            placeholder={t("account.confirmPasswordPlaceholder")}
            value={confirmPwd}
            onChange={(e) => {
              setConfirmPwd(e.target.value);
              setError(null);
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("common.passwordPolicy")}</p>
      </>
    );
  }

  const emailChannelAvailable = !!identify?.email_masked;
  const sqChannelAvailable = !!identify?.has_security_questions;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={view + String(manualDone)}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {/* ---------- 入口：账号识别 ---------- */}
        {view === "identify" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fp-account">{t("forgotPassword.wizard.accountLabel")}</Label>
              <Input
                id="fp-account"
                autoComplete="username"
                placeholder={t("forgotPassword.wizard.accountPlaceholder")}
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleIdentify()}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error}
              </p>
            )}
            <Button
              type="button"
              className="w-full"
              size="lg"
              disabled={loading}
              onClick={handleIdentify}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("forgotPassword.wizard.identifying")}
                </>
              ) : (
                t("forgotPassword.wizard.identifyContinue")
              )}
            </Button>
            {/* 分支3：用户名、邮箱全部不记得 → 直接强制人工审核 */}
            <div className="text-center text-xs text-muted-foreground">
              {t("forgotPassword.wizard.noAccountHint")}{" "}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => go("manual")}
              >
                {t("forgotPassword.wizard.goManual")}
              </button>
            </div>
          </div>
        )}

        {/* ---------- 验证方式选择 ---------- */}
        {view === "methods" && identify && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("forgotPassword.wizard.methodTitle")}</p>
            <button
              type="button"
              disabled={!emailChannelAvailable}
              onClick={() => go("email")}
              className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <p className="text-sm font-medium">
                {t("forgotPassword.wizard.methodEmail")}
                {!emailChannelAvailable && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {t("forgotPassword.wizard.methodEmailUnavailable")}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {identify.email_masked
                  ? t("forgotPassword.wizard.methodEmailDesc", {
                      email: identify.email_masked,
                    })
                  : t("forgotPassword.wizard.methodEmail")}
              </p>
            </button>
            <button
              type="button"
              disabled={!sqChannelAvailable || loading}
              onClick={enterSqChannel}
              className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <p className="text-sm font-medium">
                {t("forgotPassword.wizard.methodSq")}
                {!sqChannelAvailable && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {t("forgotPassword.wizard.methodSqUnavailable")}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("forgotPassword.wizard.methodSqDesc")}
              </p>
            </button>
            <button
              type="button"
              onClick={() => go("recovery")}
              className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50"
            >
              <p className="text-sm font-medium">
                {t("forgotPassword.wizard.methodRecovery")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("forgotPassword.wizard.methodRecoveryDesc")}
              </p>
            </button>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error}
              </p>
            )}
            {/* 全部无法通过 → 人工审核 */}
            <div className="text-center text-xs text-muted-foreground">
              {t("forgotPassword.wizard.methodManualHint")}{" "}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => go("manual")}
              >
                {t("forgotPassword.wizard.goManual")}
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => go("identify")}
            >
              {t("forgotPassword.wizard.back")}
            </Button>
          </div>
        )}

        {/* ---------- 邮箱验证码通道 ---------- */}
        {view === "email" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fp-email">{t("forgotPassword.email")}</Label>
              <div className="flex gap-2">
                <Input
                  id="fp-email"
                  type="email"
                  autoComplete="email"
                  placeholder={
                    identify?.email_masked
                      ? t("forgotPassword.wizard.emailMaskedHint", {
                          email: identify.email_masked,
                        })
                      : t("forgotPassword.emailPlaceholder")
                  }
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
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
                    t("forgotPassword.sendCode")
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fp-code">{t("forgotPassword.code")}</Label>
              <Input
                id="fp-code"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder={t("forgotPassword.codePlaceholder")}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                  setError(null);
                }}
              />
            </div>
            {newPasswordFields()}
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
            <Button
              type="button"
              className="w-full"
              size="lg"
              disabled={loading}
              onClick={handleEmailReset}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("forgotPassword.submitting")}
                </>
              ) : (
                t("forgotPassword.submit")
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => go("methods")}
            >
              {t("forgotPassword.wizard.back")}
            </Button>
          </div>
        )}

        {/* ---------- 安全问题通道 ---------- */}
        {view === "sq" && (
          <div className="space-y-4">
            {questions.map((q) => (
              <div key={q.position} className="space-y-2">
                <Label>
                  {t("auth.securityQuestions.question")} {q.position}：{renderQuestion(q)}
                </Label>
                <Input
                  autoComplete="off"
                  placeholder={t("auth.recover.answerPlaceholder")}
                  value={answers[q.position] ?? ""}
                  onChange={(e) => {
                    setAnswers((prev) => ({ ...prev, [q.position]: e.target.value }));
                    setError(null);
                  }}
                />
              </div>
            ))}
            {newPasswordFields()}
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error}
              </p>
            )}
            <Button
              type="button"
              className="w-full"
              size="lg"
              disabled={loading}
              onClick={handleSqReset}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("forgotPassword.submitting")}
                </>
              ) : (
                t("forgotPassword.submit")
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => go("methods")}
            >
              {t("forgotPassword.wizard.back")}
            </Button>
          </div>
        )}

        {/* ---------- 恢复码通道 ---------- */}
        {view === "recovery" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fp-recovery">{t("forgotPassword.wizard.recoveryCodeLabel")}</Label>
              <Input
                id="fp-recovery"
                autoComplete="off"
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                value={recoveryCode}
                onChange={(e) => {
                  setRecoveryCode(e.target.value);
                  setError(null);
                }}
              />
            </div>
            {newPasswordFields()}
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error}
              </p>
            )}
            <Button
              type="button"
              className="w-full"
              size="lg"
              disabled={loading}
              onClick={handleRecoveryReset}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("forgotPassword.submitting")}
                </>
              ) : (
                t("forgotPassword.submit")
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => go("methods")}
            >
              {t("forgotPassword.wizard.back")}
            </Button>
          </div>
        )}

        {/* ---------- 人工审核双表单 ---------- */}
        {view === "manual" &&
          (manualDone ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-lg font-medium">
                {t("forgotPassword.wizard.manualSuccessTitle")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("forgotPassword.wizard.manualSuccessDesc")}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-2"
                onClick={() => router.replace(lp("/login"))}
              >
                {t("forgotPassword.backToLogin")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {t("forgotPassword.wizard.manualDesc")}
              </p>
              {/* 校内 / 社会外部切换 */}
              <div className="flex gap-4 text-sm">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="manual-kind"
                    checked={kind === "school"}
                    onChange={() => setKind("school")}
                    className="accent-primary"
                  />
                  {t("forgotPassword.wizard.kindSchool")}
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="manual-kind"
                    checked={kind === "external"}
                    onChange={() => setKind("external")}
                    className="accent-primary"
                  />
                  {t("forgotPassword.wizard.kindExternal")}
                </label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mr-contact">{t("forgotPassword.wizard.contactEmail")}</Label>
                <Input
                  id="mr-contact"
                  type="email"
                  autoComplete="email"
                  placeholder={t("forgotPassword.emailPlaceholder")}
                  value={contactEmail}
                  onChange={(e) => {
                    setContactEmail(e.target.value);
                    setError(null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mr-realname">{t("forgotPassword.wizard.realName")}</Label>
                <Input
                  id="mr-realname"
                  autoComplete="name"
                  value={realName}
                  onChange={(e) => {
                    setRealName(e.target.value);
                    setError(null);
                  }}
                />
              </div>
              {kind === "school" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="mr-studentId">{t("forgotPassword.wizard.studentId")}</Label>
                    <Input
                      id="mr-studentId"
                      autoComplete="off"
                      value={studentId}
                      onChange={(e) => {
                        setStudentId(e.target.value);
                        setError(null);
                      }}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="mr-college">{t("forgotPassword.wizard.college")}</Label>
                      <Input
                        id="mr-college"
                        autoComplete="off"
                        value={college}
                        onChange={(e) => setCollege(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mr-major">{t("forgotPassword.wizard.major")}</Label>
                      <Input
                        id="mr-major"
                        autoComplete="off"
                        value={major}
                        onChange={(e) => setMajor(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mr-class">{t("forgotPassword.wizard.className")}</Label>
                      <Input
                        id="mr-class"
                        autoComplete="off"
                        value={className}
                        onChange={(e) => setClassName(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="mr-idcard">{t("forgotPassword.wizard.idCard")}</Label>
                  <Input
                    id="mr-idcard"
                    autoComplete="off"
                    value={idCard}
                    onChange={(e) => {
                      setIdCard(e.target.value);
                      setError(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("forgotPassword.wizard.idCardHint")}
                  </p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mr-regtime">
                    {t("forgotPassword.wizard.registerTimeHint")}
                  </Label>
                  <Input
                    id="mr-regtime"
                    autoComplete="off"
                    value={registerTimeHint}
                    onChange={(e) => setRegisterTimeHint(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mr-oldpwd">{t("forgotPassword.wizard.oldPassword")}</Label>
                  <PasswordInput
                    id="mr-oldpwd"
                    autoComplete="off"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                  />
                </div>
              </div>
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {error}
                </p>
              )}
              <Button
                type="button"
                className="w-full"
                size="lg"
                disabled={loading}
                onClick={handleManualSubmit}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("forgotPassword.wizard.manualSubmitting")}
                  </>
                ) : (
                  t("forgotPassword.wizard.manualSubmit")
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => go(identify ? "methods" : "identify")}
              >
                {t("forgotPassword.wizard.back")}
              </Button>
            </div>
          ))}

        {/* ---------- 重置成功 ---------- */}
        {view === "success" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-medium">{t("forgotPassword.success")}</p>
            <p className="text-sm text-muted-foreground">
              {t("forgotPassword.successHint")}
            </p>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
