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
import { getSession, saveSession } from "@/lib/auth";
import { meetsPasswordPolicy, passwordClassCount } from "@/lib/passwordPolicy";
import { CheckCircle2, Loader2, KeyRound, UserCog, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function AccountSecurityCard({ currentUsername, onUsernameUpdated }: Props) {
  const { t } = useI18n();

  // ---- 用户名修改 ----
  const [newUsername, setNewUsername] = useState("");
  const [usernameEditing, setUsernameEditing] = useState(false);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState(false);

  // ---- 密码修改 ----
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

  function validateUsername(name: string): string | null {
    if (!name) return t("account.usernameRequired");
    if (name.length < 4) return t("account.usernameTooShort");
    if (!USERNAME_RE.test(name)) return t("account.usernameInvalid");
    if (name === currentUsername) return t("account.usernameSame");
    return null;
  }

  function validatePassword(oldp: string, newp: string, confirm: string): string | null {
    if (!oldp) return t("account.oldPasswordRequired");
    if (!meetsPasswordPolicy(newp)) return t("account.passwordTooShort");
    if (newp === oldp) return t("account.passwordSame");
    if (newp !== confirm) return t("account.passwordMismatch");
    return null;
  }

  async function handleUsernameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateUsername(newUsername);
    if (err) { setUsernameError(err); return; }
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
      setUsernameError(err instanceof Error ? err.message : t("account.usernameSaveError"));
    } finally {
      setUsernameSaving(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validatePassword(oldPassword, newPassword, confirmPassword);
    if (err) { setPasswordError(err); return; }
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordSuccess(false);
    try {
      await changePassword({ old_password: oldPassword, new_password: newPassword });
      setPasswordSuccess(true);
      setPasswordEditing(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : t("account.passwordSaveError"));
    } finally {
      setPasswordSaving(false);
    }
  }

  function resetUsername() {
    setUsernameEditing(false);
    setNewUsername("");
    setUsernameError(null);
  }

  function resetPassword() {
    setPasswordEditing(false);
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
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
            <form onSubmit={handleUsernameSubmit} className="space-y-3" noValidate>
              <div className="space-y-2">
                <Label htmlFor="newUsername" className="text-xs text-muted-foreground">
                  {t("account.newUsername")}
                </Label>
                <Input
                  id="newUsername"
                  value={newUsername}
                  onChange={(e) => { setNewUsername(e.target.value); setUsernameError(null); }}
                  placeholder={t("account.usernamePlaceholder")}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">{t("account.usernameHint")}</p>
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
            <form onSubmit={handlePasswordSubmit} className="space-y-3" noValidate>
              <div className="space-y-2">
                <Label htmlFor="oldPassword" className="text-xs text-muted-foreground">
                  {t("account.oldPassword")}
                </Label>
                <div className="relative">
                  <Input
                    id="oldPassword"
                    type={showOld ? "text" : "password"}
                    value={oldPassword}
                    onChange={(e) => { setOldPassword(e.target.value); setPasswordError(null); }}
                    placeholder={t("account.oldPasswordPlaceholder")}
                    autoComplete="current-password"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOld(!showOld)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-xs text-muted-foreground">
                  {t("account.newPassword")}
                </Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }}
                    placeholder={t("account.newPasswordPlaceholder")}
                    autoComplete="new-password"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-xs text-muted-foreground">
                  {t("account.confirmPassword")}
                </Label>
                <Input
                  id="confirmPassword"
                  type={showNew ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null); }}
                  placeholder={t("account.confirmPasswordPlaceholder")}
                  autoComplete="new-password"
                />
              </div>
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
