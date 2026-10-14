"use client";

/**
 * EmailBinding —— 更换绑定邮箱（/setting/security/email）
 *
 * 三条路径（全部校验后端二次实现，前端每次提交前强制确认弹窗）：
 * - 路径A normal：旧邮箱可用 —— 输新邮箱 → 旧+新双验证码 → 旧码+新码+当前密码 → 换绑（保留全部会话）
 * - 路径B lost-old：旧邮箱失效 —— 必须用户主动点击入口进入；密码/学号/手机号/真实姓名
 *   四项全部匹配才通过（任一错统一模糊拒绝）→ 新邮箱验证码 → 换绑
 * - 路径C manual：人工申请兜底 —— 只读账号 + 目标邮箱 + 备注 → 确认弹窗 → 提交，
 *   待审核期间全部自助入口置灰禁用（后端同步 409 强制）
 * - 豁免 exempt：管理员同意人工申请后的一次性标记 —— 跳过全部身份校验，
 *   仅输新邮箱（预填申请邮箱）→ 强制确认弹窗 → 换绑成功瞬间标记立即失效（后端同事务清除）
 * - Superadmin(Break-Glass)：前端完全隐藏全部 UI（fetchMe 判定）
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Mail,
  MailWarning,
  ShieldAlert,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { fetchMe } from "@/lib/api/auth";
import {
  confirmEmailChangeNormal,
  confirmExemptEmailChange,
  confirmLostOld,
  fetchEmailChangeStatus,
  sendEmailChangeCodes,
  sendLostOldCode,
  submitEmailChangeManualRequest,
  verifyLostOldIdentity,
} from "@/lib/api/emailChange";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdminUser, EmailChangeStatusOut } from "@/types/api";

/** 邮箱脱敏：a***@domain */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 1)}***@${domain}`;
}

type Mode = "normal" | "lost-old" | "manual";

/** 一次性确认弹窗状态（每次提交前必须弹出，防静默提交） */
interface ConfirmState {
  title: string;
  body: string;
  bodyLines?: string[];
  confirmLabel: string;
  danger?: boolean;
  action: () => Promise<void>;
}

export function EmailBinding() {
  const { t } = useI18n();

  const [me, setMe] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<EmailChangeStatusOut | null>(null);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<Mode>("normal");
  const [step, setStep] = useState<1 | 2>(1);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // 路径A
  const [newEmail, setNewEmail] = useState("");
  const [oldCode, setOldCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");

  // 路径B
  const [lostPassword, setLostPassword] = useState("");
  const [lostStudentId, setLostStudentId] = useState("");
  const [lostPhone, setLostPhone] = useState("");
  const [lostRealName, setLostRealName] = useState("");
  const [lostNewEmail, setLostNewEmail] = useState("");
  const [lostCode, setLostCode] = useState("");
  const [verifyFailed, setVerifyFailed] = useState(false);

  // 路径C
  const [manualEmail, setManualEmail] = useState("");
  const [manualRemark, setManualRemark] = useState("");

  // 豁免模式
  const [exemptEmail, setExemptEmail] = useState("");

  const refreshStatus = useCallback(async () => {
    const s = await fetchEmailChangeStatus();
    setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await fetchMe();
        if (cancelled) return;
        // Superadmin(Break-Glass)：前端完全隐藏更换邮箱全部 UI 入口
        if (m.is_break_glass) {
          setMe(m);
          return;
        }
        setMe(m);
        const s = await refreshStatus();
        if (cancelled) return;
        if (s.allow_manual_email_switch) {
          setExemptEmail(s.approved_application?.new_email ?? "");
          setMode("normal");
        }
      } catch {
        // 未登录等异常由守卫处理
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshStatus]);

  function resetFlow() {
    setStep(1);
    setError(null);
    setVerifyFailed(false);
    setOldCode("");
    setNewCode("");
    setCurrentPassword("");
    setLostCode("");
    setLostPassword("");
  }

  function switchMode(next: Mode) {
    setMode(next);
    resetFlow();
  }

  function done(msg: string) {
    setSuccessMsg(msg);
    setError(null);
    setConfirm(null);
    resetFlow();
    setMode("normal");
    refreshStatus().catch(() => null);
  }

  /* ---------- 路径A：旧邮箱可用 ---------- */

  async function doSendCodes() {
    setBusy(true);
    setError(null);
    try {
      await sendEmailChangeCodes({ new_email: newEmail.trim() });
      setStep(2);
      setSuccessMsg(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function doNormalConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await confirmEmailChangeNormal({
        old_code: oldCode.trim(),
        new_code: newCode.trim(),
        current_password: currentPassword,
      });
      done(res.message || t("setting.emailChange.changeSuccess"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- 路径B：旧邮箱失效 ---------- */

  async function doLostVerify() {
    setBusy(true);
    setError(null);
    setVerifyFailed(false);
    try {
      await verifyLostOldIdentity({
        current_password: lostPassword,
        student_id: lostStudentId.trim(),
        phone: lostPhone.trim(),
        real_name: lostRealName.trim(),
      });
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setVerifyFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function doLostSendCode() {
    setBusy(true);
    setError(null);
    try {
      await sendLostOldCode({ new_email: lostNewEmail.trim() });
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function doLostConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await confirmLostOld({
        new_email: lostNewEmail.trim(),
        code: lostCode.trim(),
      });
      done(res.message || t("setting.emailChange.changeSuccess"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- 路径C：人工申请 ---------- */

  async function doManualSubmit() {
    setBusy(true);
    setError(null);
    try {
      await submitEmailChangeManualRequest({
        new_email: manualEmail.trim(),
        remark: manualRemark.trim() || undefined,
      });
      setConfirm(null);
      setManualEmail("");
      setManualRemark("");
      setSuccessMsg(t("setting.emailChange.manual.submitted"));
      resetFlow();
      setMode("normal");
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- 豁免模式 ---------- */

  async function doExemptConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await confirmExemptEmailChange({ new_email: exemptEmail.trim() });
      done(res.message || t("setting.emailChange.exempt.success"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- 渲染 ---------- */

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Superadmin(Break-Glass)：完全隐藏（后端亦全部拒绝）
  if (me?.is_break_glass) {
    return null;
  }

  const s = status;
  const emailInputCls = "w-full";

  const sendCodesConfirm = () =>
    setConfirm({
      title: t("setting.emailChange.confirmSendTitle"),
      body: t("setting.emailChange.confirmSendBody", {
        old: s ? maskEmail(s.current_email) : "",
        new: newEmail.trim(),
      }),
      confirmLabel: t("setting.emailChange.sendCodes"),
      action: doSendCodes,
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-4 w-4" />
          {t("setting.emailChange.title")}
        </CardTitle>
        <CardDescription>{t("setting.emailChange.desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {s && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm mb-4">
            <span className="text-muted-foreground">{t("setting.emailChange.current")}：</span>
            <span className="font-medium">{s.is_placeholder ? t("setting.emailChange.none") : maskEmail(s.current_email)}</span>
          </div>
        )}

        {/* 成功提示 */}
        {successMsg && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 待审核：全部自助入口置灰禁用（后端同步 409 强制） */}
        {s?.pending && (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
              <Clock className="h-4 w-4" />
              {t("setting.emailChange.pending.title")}
            </div>
            <p className="mt-1 text-amber-700/80 dark:text-amber-400/80">
              {t("setting.emailChange.pending.target")}：
              <span className="font-medium">{s.pending.new_email}</span>
            </p>
            <p className="mt-1 text-xs text-amber-700/70 dark:text-amber-400/70">
              {t("setting.emailChange.pending.hint")}
            </p>
            <Button variant="outline" size="sm" disabled className="mt-3">
              {t("setting.emailChange.pending.disabled")}
            </Button>
          </div>
        )}

        {/* 最近驳回：展示理由 + 重新开放自助入口 */}
        {!s?.pending && s?.last_rejected && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <MailWarning className="h-4 w-4" />
              {t("setting.emailChange.rejected.title")}
            </div>
            <p className="mt-1 text-destructive/90">
              {t("setting.emailChange.rejected.reason")}：
              <span className="font-medium">{s.last_rejected.reject_reason}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("setting.emailChange.rejected.canRetry")}
            </p>
          </div>
        )}

        {/* 豁免模式（优先级最高）：人工审核豁免，跳过全部身份校验 */}
        {!s?.pending && s?.allow_manual_email_switch && (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                <ShieldAlert className="h-4 w-4" />
                {t("setting.emailChange.exempt.title")}
              </div>
              <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-400/80">
                {t("setting.emailChange.exempt.warning")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exempt-email">{t("setting.emailChange.newEmail")}</Label>
              <Input
                id="exempt-email"
                type="email"
                value={exemptEmail}
                onChange={(e) => setExemptEmail(e.target.value)}
                placeholder={t("setting.emailChange.newEmailPlaceholder")}
                className={emailInputCls}
              />
              {s.approved_application && (
                <p className="text-xs text-muted-foreground">
                  {t("setting.emailChange.exempt.prefill")}：{s.approved_application.new_email}
                </p>
              )}
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
            )}
            <Button
              disabled={busy || !exemptEmail.trim()}
              onClick={() =>
                setConfirm({
                  title: t("setting.emailChange.exempt.confirmTitle"),
                  body: t("setting.emailChange.exempt.confirmBody", { new: exemptEmail.trim() }),
                  confirmLabel: t("setting.emailChange.submit"),
                  danger: true,
                  action: doExemptConfirm,
                })
              }
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("setting.emailChange.submit")}
            </Button>
          </div>
        )}

        {/* 常规视图（无 pending / 无豁免标记） */}
        {s && !s.pending && !s.allow_manual_email_switch && (
          <>
            {mode === "normal" && (
              <div className="space-y-4">
                {step === 1 ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="ec-new-email">{t("setting.emailChange.newEmail")}</Label>
                      <Input
                        id="ec-new-email"
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder={t("setting.emailChange.newEmailPlaceholder")}
                        className={emailInputCls}
                      />
                    </div>
                    {error && (
                      <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
                    )}
                    <Button disabled={busy || !newEmail.trim()} onClick={sendCodesConfirm}>
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      {t("setting.emailChange.sendCodes")}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      {t("setting.emailChange.sentHint", { new: newEmail.trim() })}
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="ec-old-code">{t("setting.emailChange.oldCode")}</Label>
                      <Input
                        id="ec-old-code"
                        inputMode="numeric"
                        maxLength={6}
                        value={oldCode}
                        onChange={(e) => setOldCode(e.target.value)}
                        placeholder="000000"
                        className={emailInputCls}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ec-new-code">{t("setting.emailChange.newCode")}</Label>
                      <Input
                        id="ec-new-code"
                        inputMode="numeric"
                        maxLength={6}
                        value={newCode}
                        onChange={(e) => setNewCode(e.target.value)}
                        placeholder="000000"
                        className={emailInputCls}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ec-password">{t("setting.emailChange.currentPassword")}</Label>
                      <PasswordInput
                        id="ec-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                    </div>
                    {error && (
                      <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={busy || !oldCode.trim() || !newCode.trim() || !currentPassword}
                        onClick={() =>
                          setConfirm({
                            title: t("setting.emailChange.confirmChangeTitle"),
                            body: t("setting.emailChange.confirmChangeBody", {
                              old: maskEmail(s.current_email),
                              new: newEmail.trim(),
                            }),
                            confirmLabel: t("setting.emailChange.submit"),
                            action: doNormalConfirm,
                          })
                        }
                      >
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t("setting.emailChange.submit")}
                      </Button>
                      <Button variant="outline" onClick={() => { setStep(1); setError(null); }}>
                        {t("setting.emailChange.backToStep1")}
                      </Button>
                    </div>
                  </>
                )}
                {/* 路径B 入口：必须用户主动点击才能进入，不能绕过路径A直入 */}
                <button
                  type="button"
                  onClick={() => switchMode("lost-old")}
                  className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  {t("setting.emailChange.lostOld.entry")}
                </button>
                <div>
                  <Button variant="ghost" size="sm" onClick={() => switchMode("manual")}>
                    {t("setting.emailChange.manual.entry")}
                  </Button>
                </div>
              </div>
            )}

            {mode === "lost-old" && (
              <div className="space-y-4">
                {step === 1 ? (
                  <>
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      {t("setting.emailChange.lostOld.hint")}
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="lo-password">{t("setting.emailChange.currentPassword")}</Label>
                      <PasswordInput
                        id="lo-password"
                        value={lostPassword}
                        onChange={(e) => setLostPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lo-student">{t("setting.emailChange.studentId")}</Label>
                      <Input
                        id="lo-student"
                        value={lostStudentId}
                        onChange={(e) => setLostStudentId(e.target.value)}
                        className={emailInputCls}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lo-phone">{t("setting.emailChange.phone")}</Label>
                      <Input
                        id="lo-phone"
                        value={lostPhone}
                        onChange={(e) => setLostPhone(e.target.value)}
                        className={emailInputCls}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lo-realname">{t("setting.emailChange.realName")}</Label>
                      <Input
                        id="lo-realname"
                        value={lostRealName}
                        onChange={(e) => setLostRealName(e.target.value)}
                        className={emailInputCls}
                      />
                    </div>
                    {error && (
                      <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
                    )}
                    {/* 四项核验失败兜底：引导人工申请 */}
                    {verifyFailed && (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-4 w-4" />
                          {t("setting.emailChange.lostOld.verifyGuidance")}
                        </div>
                        <Button variant="outline" size="sm" className="mt-2" onClick={() => switchMode("manual")}>
                          {t("setting.emailChange.lostOld.gotoManual")}
                        </Button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={
                          busy || !lostPassword || !lostStudentId.trim() ||
                          !lostPhone.trim() || !lostRealName.trim()
                        }
                        onClick={doLostVerify}
                      >
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t("setting.emailChange.lostOld.verify")}
                      </Button>
                      <Button variant="ghost" onClick={() => switchMode("normal")}>
                        <ArrowLeft className="h-4 w-4" />
                        {t("setting.emailChange.lostOld.back")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="lo-new-email">{t("setting.emailChange.newEmail")}</Label>
                      <Input
                        id="lo-new-email"
                        type="email"
                        value={lostNewEmail}
                        onChange={(e) => setLostNewEmail(e.target.value)}
                        placeholder={t("setting.emailChange.newEmailPlaceholder")}
                        className={emailInputCls}
                      />
                    </div>
                    {error && (
                      <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
                    )}
                    <Button
                      disabled={busy || !lostNewEmail.trim()}
                      onClick={() =>
                        setConfirm({
                          title: t("setting.emailChange.lostOld.confirmSendTitle"),
                          body: t("setting.emailChange.lostOld.confirmSendBody", { new: lostNewEmail.trim() }),
                          confirmLabel: t("setting.emailChange.sendCodes"),
                          action: doLostSendCode,
                        })
                      }
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      {t("setting.emailChange.sendCodes")}
                    </Button>
                    <div className="space-y-1.5">
                      <Label htmlFor="lo-code">{t("setting.emailChange.newCode")}</Label>
                      <Input
                        id="lo-code"
                        inputMode="numeric"
                        maxLength={6}
                        value={lostCode}
                        onChange={(e) => setLostCode(e.target.value)}
                        placeholder="000000"
                        className={emailInputCls}
                      />
                    </div>
                    <Button
                      disabled={busy || !lostCode.trim()}
                      onClick={() =>
                        setConfirm({
                          title: t("setting.emailChange.confirmChangeTitle"),
                          body: t("setting.emailChange.confirmChangeBody", {
                            old: maskEmail(s.current_email),
                            new: lostNewEmail.trim(),
                          }),
                          confirmLabel: t("setting.emailChange.submit"),
                          action: doLostConfirm,
                        })
                      }
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      {t("setting.emailChange.submit")}
                    </Button>
                  </>
                )}
              </div>
            )}

            {mode === "manual" && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t("setting.emailChange.uidLabel")}</Label>
                    <Input value={me?.id ?? ""} readOnly disabled className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("setting.emailChange.usernameLabel")}</Label>
                    <Input value={me?.username ?? ""} readOnly disabled />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mn-email">{t("setting.emailChange.newEmail")}</Label>
                  <Input
                    id="mn-email"
                    type="email"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    placeholder={t("setting.emailChange.newEmailPlaceholder")}
                    className={emailInputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mn-remark">{t("setting.emailChange.remark")}</Label>
                  <Textarea
                    id="mn-remark"
                    value={manualRemark}
                    onChange={(e) => setManualRemark(e.target.value)}
                    placeholder={t("setting.emailChange.remarkPlaceholder")}
                    rows={4}
                    maxLength={1000}
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy || !manualEmail.trim()}
                    onClick={() =>
                      setConfirm({
                        title: t("setting.emailChange.manual.confirmTitle"),
                        body: t("setting.emailChange.manual.confirmBody"),
                        confirmLabel: t("setting.emailChange.manual.submitLabel"),
                        danger: true,
                        action: doManualSubmit,
                      })
                    }
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("setting.emailChange.manual.submitLabel")}
                  </Button>
                  <Button variant="ghost" onClick={() => switchMode("normal")}>
                    <ArrowLeft className="h-4 w-4" />
                    {t("setting.emailChange.lostOld.back")}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* 一次性确认弹窗：每次提交前必须弹出，防静默提交 */}
      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {confirm?.title}
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {confirm?.body}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button
              variant={confirm?.danger ? "destructive" : "default"}
              disabled={busy}
              onClick={() => confirm?.action()}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirm?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
