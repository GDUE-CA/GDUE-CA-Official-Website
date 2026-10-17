"use client";

/**
 * SecurityForm —— Tab-4 账号安全
 *
 * a) 用户名：显示当前值 + 「修改」→ Dialog① 输入新用户名（/^[A-Za-z0-9_]{4,}$/）
 *    → 提交前 Dialog② 二次确认 → PUT profile {username} → 更新本地会话
 *    （后端自动写审计日志）
 * b) 密码：旧密码/新密码/确认（统一 PasswordInput 眼睛切换）+ 强度指示器，
 *    POST /api/auth/change-password；强制旧密码，不提供邮箱验证码绕过入口；
 *    「保留当前设备登录」默认勾选，取消 = 全部会话（含本机）强制下线
 * c) 预留入口：更换绑定邮箱 / 手机号（disabled + comingSoon 说明）
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import KeyRound from "@/assets/icons/status/key-round.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import UserCog from "@/assets/icons/user/user-cog.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchProfile, updateProfile, changePassword } from "@/lib/api/auth";
import { getSession, saveSession, clearLocalSession } from "@/lib/auth";
import { meetsPasswordPolicy, passwordClassCount } from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

/** 用户名格式：≥4 字符，字母/数字/下划线 */
const USERNAME_RE = /^[A-Za-z0-9_]{4,}$/;

/** 密码强度：不满足强口令策略为 weak，满足后按长度 / 字符类别区分 medium / strong */
function passwordStrength(pwd: string): "weak" | "medium" | "strong" {
  if (!meetsPasswordPolicy(pwd)) return "weak";
  return pwd.length >= 14 && passwordClassCount(pwd) === 4 ? "strong" : "medium";
}

/** 后端请求体字段名（data-field 对位，与 1001 data.errors[].field 一致） */
type PasswordField =
  | "old_password" | "new_password" | "confirm_password";

export function SecurityForm() {
  const { t } = useI18n();
  const router = useRouter();
  const lp = useLocalizedPath();

  // 当前用户名
  const [currentUsername, setCurrentUsername] = useState("");
  const [loading, setLoading] = useState(true);

  // 用户名修改：Dialog① 输入 → Dialog② 确认
  const [usernameOpen, setUsernameOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 密码修改
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // 保留当前设备登录（默认勾选；取消 = 全部会话含本机强制下线）
  const [keepCurrentDevice, setKeepCurrentDevice] = useState(true);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordFields = useServerFieldErrors<PasswordField>({ fallback: t("account.passwordSaveError") });
  const pfe = passwordFields.errors;
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    fetchProfile()
      .then((p) => setCurrentUsername(p.username))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function validateUsername(name: string): string | null {
    if (!name) return t("account.usernameRequired");
    if (name.length < 4) return t("account.usernameTooShort");
    if (!USERNAME_RE.test(name)) return t("account.usernameInvalid");
    if (name === currentUsername) return t("account.usernameSame");
    return null;
  }

  /** 前端预校验：按字段返回错误（与后端字段名一致，行内展示） */
  function validatePassword(
    oldp: string,
    newp: string,
    confirm: string,
  ): Partial<Record<PasswordField, string>> {
    const errs: Partial<Record<PasswordField, string>> = {};
    if (!oldp) errs.old_password = t("account.oldPasswordRequired");
    if (!meetsPasswordPolicy(newp)) errs.new_password = t("account.passwordTooShort");
    else if (newp === oldp) errs.new_password = t("account.passwordSame");
    if (newp !== confirm) errs.confirm_password = t("account.passwordMismatch");
    return errs;
  }

  /** Dialog① 提交：校验通过后弹出二次确认 */
  function handleUsernameNext(e: React.FormEvent) {
    e.preventDefault();
    const err = validateUsername(newUsername.trim());
    if (err) {
      setUsernameError(err);
      return;
    }
    setUsernameError(null);
    setConfirmOpen(true);
  }

  /** Dialog② 确认：真正提交 */
  async function handleUsernameSubmit() {
    const name = newUsername.trim();
    if (validateUsername(name)) {
      setConfirmOpen(false);
      return;
    }
    setUsernameSaving(true);
    setUsernameMsg(null);
    try {
      const updated = await updateProfile({ username: name });
      // 更新本地会话展示信息
      const session = getSession();
      if (session) saveSession({ ...session, username: updated.username });
      setCurrentUsername(updated.username);
      setUsernameMsg({ type: "ok", text: t("account.usernameUpdated") });
      setConfirmOpen(false);
      setUsernameOpen(false);
      setNewUsername("");
    } catch (err) {
      setUsernameMsg({
        type: "err",
        text: err instanceof Error ? err.message : t("account.usernameSaveError"),
      });
      setConfirmOpen(false);
    } finally {
      setUsernameSaving(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passwordFields.set(validatePassword(oldPassword, newPassword, confirmPassword))) return;
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordSuccess(false);
    try {
      const res = await changePassword({
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
        keep_current_device: keepCurrentDevice,
      });
      if (res.current_session_revoked) {
        // 全部会话（含本机）已下线：清除本地会话并跳转登录页
        clearLocalSession();
        router.replace(lp("/login"));
        return;
      }
      setPasswordSuccess(true);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err2) {
      setPasswordError(passwordFields.capture(err2));
    } finally {
      setPasswordSaving(false);
    }
  }

  const strength = newPassword ? passwordStrength(newPassword) : null;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* a) 用户名 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserCog className="h-5 w-5" />
            {t("account.usernameSection")}
          </CardTitle>
          <CardDescription>{t("account.usernameHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("account.currentUsername")}</span>
              <span className="font-mono font-medium">{currentUsername}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setNewUsername("");
                setUsernameError(null);
                setUsernameMsg(null);
                setUsernameOpen(true);
              }}
            >
              {t("account.edit")}
            </Button>
          </div>
          {usernameMsg && (
            <p
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                usernameMsg.type === "ok"
                  ? "bg-green-50 text-green-600 dark:bg-green-950/20"
                  : "bg-destructive/10 text-destructive"
              )}
            >
              {usernameMsg.type === "ok" && <CheckCircle2 className="h-4 w-4" />}
              {usernameMsg.text}
            </p>
          )}
        </CardContent>
      </Card>

      {/* b) 密码 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-5 w-5" />
            {t("account.passwordSection")}
          </CardTitle>
          <CardDescription>{t("account.passwordHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form {...passwordFields.rootProps} onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
            <div className="space-y-2" data-field="old_password">
              <Label htmlFor="sec-oldPassword">{t("account.oldPassword")}</Label>
              <PasswordInput
                id="sec-oldPassword"
                aria-invalid={!!pfe.old_password}
                value={oldPassword}
                onChange={(e) => {
                  setOldPassword(e.target.value);
                  setPasswordError(null);
                }}
                placeholder={t("account.oldPasswordPlaceholder")}
                autoComplete="current-password"
              />
              <FieldError>{pfe.old_password}</FieldError>
            </div>
            <div className="space-y-2" data-field="new_password">
              <Label htmlFor="sec-newPassword">{t("account.newPassword")}</Label>
              <PasswordInput
                id="sec-newPassword"
                aria-invalid={!!pfe.new_password}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError(null);
                }}
                placeholder={t("account.newPasswordPlaceholder")}
                autoComplete="new-password"
              />
              {/* 强度指示器 */}
              {strength && (
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1.5 flex-1 rounded-full transition-colors",
                          strength === "weak" && (i === 0 ? "bg-red-500" : "bg-muted"),
                          strength === "medium" && (i <= 1 ? "bg-yellow-500" : "bg-muted"),
                          strength === "strong" && "bg-green-500"
                        )}
                      />
                    ))}
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      strength === "weak" && "text-red-500",
                      strength === "medium" && "text-yellow-500",
                      strength === "strong" && "text-green-500"
                    )}
                  >
                    {t(`account.strength.${strength}`)}
                  </span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t("account.passwordRule")}</p>
              <FieldError>{pfe.new_password}</FieldError>
            </div>
            <div className="space-y-2" data-field="confirm_password">
              <Label htmlFor="sec-confirmPassword">{t("account.confirmPassword")}</Label>
              <PasswordInput
                id="sec-confirmPassword"
                aria-invalid={!!pfe.confirm_password}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordError(null);
                }}
                placeholder={t("account.confirmPasswordPlaceholder")}
                autoComplete="new-password"
              />
              <FieldError>{pfe.confirm_password}</FieldError>
            </div>
            {/* 保留当前设备登录（默认勾选；取消 = 全部会话含本机强制下线） */}
            <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                className="size-4 rounded accent-primary cursor-pointer"
                checked={keepCurrentDevice}
                onChange={(e) => setKeepCurrentDevice(e.target.checked)}
              />
              {t("account.keepCurrentDevice")}
            </label>
            <p className="-mt-2 text-xs text-muted-foreground">
              {t("account.keepCurrentDeviceHint")}
            </p>
            {passwordError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {passwordError}
              </p>
            )}
            {passwordSuccess && (
              <p className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-600 dark:bg-green-950/20">
                <CheckCircle2 className="h-4 w-4" />
                {t("account.passwordUpdated")}
              </p>
            )}
            <Button type="submit" disabled={passwordSaving}>
              {passwordSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("setting.saving")}
                </>
              ) : (
                t("account.save")
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* c) 预留入口 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.security.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled>
              {t("setting.security.changeEmail")}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled>
              {t("setting.security.changePhone")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("setting.security.comingSoon")}</p>
        </CardContent>
      </Card>

      {/* Dialog① 输入新用户名 */}
      <Dialog
        open={usernameOpen}
        onOpenChange={(open) => {
          if (!open && !usernameSaving) setUsernameOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("account.newUsername")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUsernameNext} className="space-y-3" noValidate>
            <Input
              value={newUsername}
              onChange={(e) => {
                setNewUsername(e.target.value);
                setUsernameError(null);
              }}
              placeholder={t("account.usernamePlaceholder")}
              autoComplete="off"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{t("account.usernameHint")}</p>
            {usernameError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {usernameError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setUsernameOpen(false)}>
                {t("setting.cancel")}
              </Button>
              <Button type="submit">{t("common.confirm")}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog② 二次确认 */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !usernameSaving) setConfirmOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("account.usernameSection")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("setting.security.usernameConfirm", { name: newUsername.trim() })}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={usernameSaving}>
              {t("setting.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void handleUsernameSubmit()} disabled={usernameSaving}>
              {usernameSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("setting.saving")}
                </>
              ) : (
                t("common.confirm")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
