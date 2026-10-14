"use client";

/**
 * /admin/setup - 系统初始化向导（Break-Glass 应急账号首次登录后强制进入）
 *
 * - 公开路径（proxy.ts 已放行）：BG 登录后由登录页或 dashboard 布局跳转进入
 * - 4 步向导：① 修改 BG 密码（生成 bcrypt 哈希供运维复制） ② 全局参数
 *   ③ 首位业务超管 ④ 确认并提交
 * - 提交成功后后端自动注销 BG 会话，前端清理本地会话并跳转登录页
 * - 已完成初始化时挂载即跳转登录页
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Loader2,
  ShieldCheck,
  Check,
  Copy,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  fetchSystemInitStatus,
  verifyBGPassword,
  generateBGPasswordHash,
  initializeSystem,
} from "@/lib/api/auth";
import { clearLocalSession } from "@/lib/auth";
import type { BGPasswordHashResult } from "@/types/api";

/** 步骤元数据：编号 + 标题 i18n key + 描述 i18n key */
const STEPS = [
  { titleKey: "admin.setup.step1", descKey: "admin.setup.step1Desc" },
  { titleKey: "admin.setup.step2", descKey: "admin.setup.step2Desc" },
  { titleKey: "admin.setup.step3", descKey: "admin.setup.step3Desc" },
  { titleKey: "admin.setup.step4", descKey: "admin.setup.step4Desc" },
] as const;

/** 常用 IANA 时区（约 15 个，覆盖主要时区） */
const COMMON_TIMEZONES = [
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
];

/** 默认语言选项（与后端 locale 字段对齐） */
const LOCALE_OPTIONS = ["zh-CN", "en-GB", "ja-JP", "ko-KR", "zh-TW", "vi-VN"];

export default function SetupWizardPage() {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState(0); // 0..3
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Step 1: BG 密码 ----
  const [bgPassword, setBgPassword] = useState("");
  const [bgConfirm, setBgConfirm] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [hashResult, setHashResult] = useState<BGPasswordHashResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const verifyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Step 2: 全局参数 ----
  const [defaultLocale, setDefaultLocale] = useState("zh-CN");
  const [defaultTimezone, setDefaultTimezone] = useState("Asia/Shanghai");
  const [defaultRegion, setDefaultRegion] = useState("CN");
  const [defaultCurrency, setDefaultCurrency] = useState("CNY");

  // ---- Step 3: 首位超管 ----
  const [adminUsername, setAdminUsername] = useState("");
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");

  // 挂载时检查系统初始化状态：已初始化则跳转登录页
  useEffect(() => {
    fetchSystemInitStatus()
      .then((s) => {
        if (s.system_initialized) {
          router.replace(lp("/login"));
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        // 接口不可用时仍渲染向导（API 调用时由后端兜底）
        setChecking(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Step1 实时校验：防抖 600ms 调用 verifyBGPassword */
  const runVerify = useCallback(
    async (pw: string, confirm: string) => {
      if (!pw || !confirm) {
        setVerified(false);
        setVerifyMsg(null);
        return;
      }
      if (pw !== confirm) {
        setVerified(false);
        setVerifyMsg(t("admin.changePassword.mismatch"));
        return;
      }
      setVerifying(true);
      setVerifyMsg(null);
      try {
        const r = await verifyBGPassword({ password: pw, confirm_password: confirm });
        if (r.valid) {
          setVerified(true);
          setVerifyMsg(t("admin.setup.verifySuccess"));
        } else {
          setVerified(false);
        }
      } catch (e) {
        setVerified(false);
        setVerifyMsg(e instanceof Error ? e.message : t("admin.setup.error"));
      } finally {
        setVerifying(false);
      }
    },
    [t]
  );

  // 密码变更触发防抖校验；通过后清除已生成哈希（密码已变）
  useEffect(() => {
    if (verifyDebounceRef.current) clearTimeout(verifyDebounceRef.current);
    verifyDebounceRef.current = setTimeout(() => {
      runVerify(bgPassword, bgConfirm);
    }, 600);
    return () => {
      if (verifyDebounceRef.current) clearTimeout(verifyDebounceRef.current);
    };
  }, [bgPassword, bgConfirm, runVerify]);

  // 密码变更后清除已生成哈希
  useEffect(() => {
    setHashResult(null);
    setCopied(false);
  }, [bgPassword, bgConfirm]);

  /** 生成 bcrypt 哈希 */
  async function handleGenerateHash() {
    if (!verified || !bgPassword) return;
    setGenerating(true);
    setError(null);
    try {
      const r = await generateBGPasswordHash(bgPassword);
      setHashResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.setup.error"));
    } finally {
      setGenerating(false);
    }
  }

  /** 复制哈希到剪贴板 */
  async function handleCopyHash() {
    if (!hashResult) return;
    try {
      await navigator.clipboard.writeText(hashResult.hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板 API 不可用：选中文本供用户手动复制
    }
  }

  /** Step1 可进入下一步：已生成哈希（运维已复制） */
  const step1Valid = !!hashResult;

  /** Step2 可进入下一步：三项全选 */
  const step2Valid = !!defaultLocale && !!defaultTimezone && !!defaultRegion.trim() && !!defaultCurrency.trim();

  /** Step3 可进入下一步：必填齐全 + 密码一致 */
  const step3Valid =
    !!adminUsername.trim() &&
    !!adminDisplayName.trim() &&
    !!adminEmail.trim() &&
    adminPassword.length >= 10 &&
    adminPassword === adminPasswordConfirm;

  /** 提交初始化 */
  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await initializeSystem({
        default_locale: defaultLocale,
        default_timezone: defaultTimezone,
        default_region: defaultRegion.trim(),
        default_currency: defaultCurrency.trim(),
        admin: {
          username: adminUsername.trim(),
          display_name: adminDisplayName.trim(),
          email: adminEmail.trim(),
          password: adminPassword,
        },
      });
      setSuccess(true);
      // 后端已注销 BG 会话，清理本地会话后跳登录页
      clearLocalSession();
      setTimeout(() => router.replace(lp("/login")), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.setup.error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-background to-muted/30">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-3xl"
      >
        <Card className="shadow-xl">
          <CardHeader className="space-y-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mx-auto">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl text-center">
              {t("admin.setup.title")}
            </CardTitle>
            <CardDescription className="text-center">
              {t("admin.setup.subtitle")}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Stepper */}
            <Stepper current={step} />

            {/* Step 内容 */}
            {step === 0 && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bgPassword">{t("admin.setup.password")}</Label>
                    <PasswordInput
                      id="bgPassword"
                      autoComplete="new-password"
                      placeholder={t("admin.setup.passwordPlaceholder")}
                      value={bgPassword}
                      onChange={(e) => setBgPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bgConfirm">{t("admin.setup.confirmPassword")}</Label>
                    <PasswordInput
                      id="bgConfirm"
                      autoComplete="new-password"
                      placeholder={t("admin.setup.confirmPassword")}
                      value={bgConfirm}
                      onChange={(e) => setBgConfirm(e.target.value)}
                    />
                  </div>
                </div>

                {/* 校验状态 */}
                {verifying && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("admin.setup.verifying")}
                  </p>
                )}
                {!verifying && verifyMsg && (
                  <p
                    className={
                      "text-xs flex items-center gap-1.5 " +
                      (verified ? "text-emerald-600" : "text-destructive")
                    }
                  >
                    {verified ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    {verifyMsg}
                  </p>
                )}

                {/* 生成哈希按钮 */}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGenerateHash}
                    disabled={!verified || generating || !!hashResult}
                  >
                    {generating && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    {t("admin.setup.generateHash")}
                  </Button>
                  {hashResult && (
                    <span className="text-xs text-emerald-600 flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" />
                      {t("admin.setup.hashGenerated")}
                    </span>
                  )}
                </div>

                {/* 哈希结果 */}
                {hashResult && (
                  <div className="space-y-2">
                    <Label>{t("admin.setup.copyHash")}</Label>
                    <Textarea
                      readOnly
                      rows={3}
                      value={hashResult.hash}
                      className="font-mono text-xs"
                      placeholder={t("admin.setup.hashPlaceholder")}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCopyHash}
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 mr-1" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 mr-1" />
                        )}
                        {copied ? t("admin.setup.copied") : t("admin.setup.copyHash")}
                      </Button>
                    </div>
                    {hashResult.warning && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-2 rounded-md">
                        {hashResult.warning}
                      </p>
                    )}
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-2 rounded-md">
                      {t("admin.setup.hashWarning")}
                    </p>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                    {error}
                  </p>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultLocale">{t("admin.setup.defaultLocale")}</Label>
                  <select
                    id="defaultLocale"
                    value={defaultLocale}
                    onChange={(e) => setDefaultLocale(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {LOCALE_OPTIONS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultTimezone">{t("admin.setup.defaultTimezone")}</Label>
                  <select
                    id="defaultTimezone"
                    value={defaultTimezone}
                    onChange={(e) => setDefaultTimezone(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultRegion">{t("admin.setup.defaultRegion")}</Label>
                  <Input
                    id="defaultRegion"
                    placeholder="CN"
                    value={defaultRegion}
                    onChange={(e) => setDefaultRegion(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultCurrency">{t("admin.setup.defaultCurrency")}</Label>
                  <select
                    id="defaultCurrency"
                    value={defaultCurrency}
                    onChange={(e) => setDefaultCurrency(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {["CNY","USD","EUR","GBP","JPY","KRW","HKD","SGD","TWD","RUB","MOP","AUD","CAD","CHF"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="adminUsername">{t("admin.setup.adminUsername")}</Label>
                    <Input
                      id="adminUsername"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminDisplayName">{t("admin.setup.adminDisplayName")}</Label>
                    <Input
                      id="adminDisplayName"
                      value={adminDisplayName}
                      onChange={(e) => setAdminDisplayName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminEmail">{t("admin.setup.adminEmail")}</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="adminPassword">{t("admin.setup.adminPassword")}</Label>
                    <PasswordInput
                      id="adminPassword"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminPasswordConfirm">
                      {t("admin.setup.adminPasswordConfirm")}
                    </Label>
                    <PasswordInput
                      id="adminPasswordConfirm"
                      value={adminPasswordConfirm}
                      onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t("common.passwordPolicy")}</p>
                {adminPasswordConfirm &&
                  adminPassword !== adminPasswordConfirm && (
                    <p className="text-xs text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t("admin.changePassword.mismatch")}
                    </p>
                  )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold">{t("admin.setup.summary")}</h3>
                <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{t("admin.setup.summaryLocale")}</span>
                    <span className="font-mono font-medium">{defaultLocale}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      {t("admin.setup.summaryTimezone")}
                    </span>
                    <span className="font-mono font-medium">{defaultTimezone}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{t("admin.setup.summaryRegion")}</span>
                    <span className="font-mono font-medium">{defaultRegion}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{t("admin.setup.summaryCurrency")}</span>
                    <span className="font-mono font-medium">{defaultCurrency}</span>
                  </div>
                  <div className="border-t border-border my-2" />
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{t("admin.setup.summaryAdmin")}</span>
                    <span className="font-medium">{adminUsername}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{t("admin.setup.adminDisplayName")}</span>
                    <span className="font-medium">{adminDisplayName}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{t("admin.setup.adminEmail")}</span>
                    <span className="font-medium">{adminEmail}</span>
                  </div>
                </div>

                {success && (
                  <p className="text-sm text-emerald-600 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-2 rounded-md">
                    <Check className="h-4 w-4" />
                    {t("admin.setup.success")}
                  </p>
                )}
                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                    {error}
                  </p>
                )}
              </div>
            )}

            {/* 导航按钮 */}
            {!success && (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0 || submitting}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  {t("admin.setup.prev")}
                </Button>
                {step < 3 ? (
                  <Button
                    type="button"
                    onClick={() => setStep((s) => s + 1)}
                    disabled={
                      (step === 0 && !step1Valid) ||
                      (step === 1 && !step2Valid) ||
                      (step === 2 && !step3Valid)
                    }
                  >
                    {t("admin.setup.next")}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    {submitting ? t("admin.setup.submitting") : t("admin.setup.submit")}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

/** 4 步 Stepper：编号圆圈 + 标题/描述 */
function Stepper({ current }: { current: number }) {
  const { t } = useI18n();
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.titleKey} className="flex flex-col items-center text-center">
            <div
              className={
                "h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold border " +
                (done
                  ? "bg-primary text-primary-foreground border-primary"
                  : active
                    ? "bg-primary/10 text-primary border-primary"
                    : "bg-background text-muted-foreground border-border")
              }
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <div className="mt-1.5 text-xs font-medium leading-tight">{t(s.titleKey)}</div>
            <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 hidden sm:block">
              {t(s.descKey)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
