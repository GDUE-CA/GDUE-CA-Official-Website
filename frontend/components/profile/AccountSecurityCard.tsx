"use client";

/**
 * AccountSecurityCard —— 修改账户信息（用户名 + 密码）
 *
 * 用户名：≥4 字符，仅字母/数字/下划线，调 updateProfile
 * 密码：≥8 位含大小写+数字，需验证当前密码，调 changePassword
 * 客户端验证 → AJAX 异步提交 → 成功后更新本地缓存
 */
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateProfile, changePassword } from "@/lib/api/auth";
import { getSession, saveSession, clearLocalSession } from "@/lib/auth";
import { meetsPasswordPolicy, passwordClassCount } from "@/lib/passwordPolicy";
import { PasswordInput } from "@/components/ui/password-input";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import KeyRound from "@/assets/icons/status/key-round.svg";
import UserCog from "@/assets/icons/user/user-cog.svg";
import { cn } from "@/lib/utils";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

/** 用户名格式：≥4 字符，字母/数字/下划线 */
const USERNAME_RE = /^[A-Za-z0-9_]{4,}$/;
/** 密码强度提示：不满足强口令策略为 weak，满足后按长度 / 字符类别区分 medium / strong */
function passwordStrength(pwd: string): "weak" | "medium" | "strong" {
  if (!meetsPasswordPolicy(pwd)) return "weak";
  return pwd.length >= 14 && passwordClassCount(pwd) === 4 ? "strong" : "medium";
}

interface Props {
  currentUsername: string;
  onUsernameUpdated?: (newName: string) => void;
}

/** 后端请求体字段名（data-field 对位，与 1001 data.errors[].field 一致） */
type UsernameField =
  | "username";

/** 后端请求体字段名（data-field 对位，与 1001 data.errors[].field 一致） */
type PasswordField =
  | "old_password" | "new_password" | "confirm_password";

export function AccountSecurityCard({ currentUsername, onUsernameUpdated }: Props) {
  const { t } = useI18n();

  // ---- 用户名修改 ----
  const [newUsername, setNewUsername] = useState("");
  const [usernameEditing, setUsernameEditing] = useState(false);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const usernameFields = useServerFieldErrors<UsernameField>({ fallback: t("account.usernameSaveError") });
  const ufe = usernameFields.errors;
  const [usernameSuccess, setUsernameSuccess] = useState(false);

  // ---- 密码修改 ----
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordFields = useServerFieldErrors<PasswordField>({ fallback: t("account.passwordSaveError") });
  const pfe = passwordFields.errors;
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [keepCurrentDevice, setKeepCurrentDevice] = useState(true);

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

  async function handleUsernameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (usernameFields.set({ username: validateUsername(newUsername) ?? undefined })) return;
    setUsernameSaving(true);
    setUsernameError(null);
    setUsernameSuccess(false);
    try {
      const updated = await updateProfile({ username: newUsername });
      // 更新本地缓存
      const session = getSession();
      if (session) saveSession({ ...session, username: updated.username });
      onUsernameUpdated?.(updated.username);
      setUsernameSuccess(true);
      setUsernameEditing(false);
      setNewUsername("");
      setTimeout(() => setUsernameSuccess(false), 3000);
    } catch (err) {
      setUsernameError(usernameFields.capture(err));
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
      setPasswordSuccess(true);
      setPasswordEditing(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // 未保留当前设备：后端已撤销全部会话（含本机），清理本地并跳登录页
      if (res.current_session_revoked) {
        clearLocalSession();
        setTimeout(() => { window.location.href = "/login"; }, 1500);
        return;
      }
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      setPasswordError(passwordFields.capture(err));
    } finally {
      setPasswordSaving(false);
    }
  }

  function resetUsername() {
    setUsernameEditing(false);
    setNewUsername("");
    setUsernameError(null);
    usernameFields.clear();
  }

  function resetPassword() {
    setPasswordEditing(false);
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    passwordFields.clear();
  }

  const strength = newPassword ? passwordStrength(newPassword) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <UserCog className="h-5 w-5" />
          {t("account.title")}
        </CardTitle>
        <CardDescription>{t("account.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ---- 用户名修改 ---- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{t("account.usernameSection")}</Label>
            {!usernameEditing && (
              <Button variant="ghost" size="sm" onClick={() => { setUsernameEditing(true); setUsernameSuccess(false); }}>
                {t("account.edit")}
              </Button>
            )}
          </div>

          {!usernameEditing ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("account.currentUsername")}</span>
              <span className="font-mono font-medium">{currentUsername}</span>
            </div>
          ) : (
            <form {...usernameFields.rootProps} onSubmit={handleUsernameSubmit} className="space-y-3" noValidate>
              <div className="space-y-2" data-field="username">
                <Label htmlFor="newUsername" className="text-xs text-muted-foreground">
                  {t("account.newUsername")}
                </Label>
                <Input
                  id="newUsername"
                  aria-invalid={!!ufe.username}
                  value={newUsername}
                  onChange={(e) => { setNewUsername(e.target.value); setUsernameError(null); }}
                  placeholder={t("account.usernamePlaceholder")}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">{t("account.usernameHint")}</p>
                <FieldError>{ufe.username}</FieldError>
              </div>
              {usernameError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {usernameError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={usernameSaving}>
                  {usernameSaving ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />{t("account.saving")}</>
                  ) : (
                    t("account.save")
                  )}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={resetUsername}>
                  {t("account.cancel")}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* 分隔线 */}
        <div className="border-t" />

        {/* ---- 密码修改 ---- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{t("account.passwordSection")}</Label>
            {!passwordEditing && (
              <Button variant="ghost" size="sm" onClick={() => { setPasswordEditing(true); setPasswordSuccess(false); }}>
                <KeyRound className="h-3.5 w-3.5" />
                {t("account.edit")}
              </Button>
            )}
          </div>

          {!passwordEditing ? (
            <p className="text-sm text-muted-foreground">{t("account.passwordHint")}</p>
          ) : (
            <form {...passwordFields.rootProps} onSubmit={handlePasswordSubmit} className="space-y-3" noValidate>
              <div className="space-y-2" data-field="old_password">
                <Label htmlFor="oldPassword" className="text-xs text-muted-foreground">
                  {t("account.oldPassword")}
                </Label>
                <PasswordInput
                  id="oldPassword"
                  aria-invalid={!!pfe.old_password}
                  value={oldPassword}
                  onChange={(e) => { setOldPassword(e.target.value); setPasswordError(null); }}
                  placeholder={t("account.oldPasswordPlaceholder")}
                  autoComplete="current-password"
                />
                <FieldError>{pfe.old_password}</FieldError>
              </div>
              <div className="space-y-2" data-field="new_password">
                <Label htmlFor="newPassword" className="text-xs text-muted-foreground">
                  {t("account.newPassword")}
                </Label>
                <PasswordInput
                  id="newPassword"
                  aria-invalid={!!pfe.new_password}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }}
                  placeholder={t("account.newPasswordPlaceholder")}
                  autoComplete="new-password"
                />
                {/* 密码强度指示器 */}
                {strength && (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 flex-1">
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
                    <span className={cn(
                      "text-xs font-medium",
                      strength === "weak" && "text-red-500",
                      strength === "medium" && "text-yellow-500",
                      strength === "strong" && "text-green-500"
                    )}>
                      {t(`account.strength.${strength}`)}
                    </span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{t("account.passwordRule")}</p>
                <FieldError>{pfe.new_password}</FieldError>
              </div>
              <div className="space-y-2" data-field="confirm_password">
                <Label htmlFor="confirmPassword" className="text-xs text-muted-foreground">
                  {t("account.confirmPassword")}
                </Label>
                <PasswordInput
                  id="confirmPassword"
                  aria-invalid={!!pfe.confirm_password}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null); }}
                  placeholder={t("account.confirmPasswordPlaceholder")}
                  autoComplete="new-password"
                />
                <FieldError>{pfe.confirm_password}</FieldError>
              </div>
              {/* 保留当前设备登录（默认勾选；取消=全部设备含本机下线） */}
              <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded accent-primary cursor-pointer"
                  checked={keepCurrentDevice}
                  onChange={(e) => setKeepCurrentDevice(e.target.checked)}
                />
                <span>
                  {t("account.keepCurrentDevice")}
                  <span className="block text-xs text-muted-foreground">{t("account.keepCurrentDeviceHint")}</span>
                </span>
              </label>
              {passwordError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {passwordError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={passwordSaving}>
                  {passwordSaving ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />{t("account.saving")}</>
                  ) : (
                    t("account.save")
                  )}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={resetPassword}>
                  {t("account.cancel")}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* 成功提示 */}
        {(usernameSuccess || passwordSuccess) && (
          <p className="text-sm text-green-600 bg-green-50 dark:bg-green-950/20 px-3 py-2 rounded-md flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {usernameSuccess && t("account.usernameUpdated")}
            {passwordSuccess && t("account.passwordUpdated")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
