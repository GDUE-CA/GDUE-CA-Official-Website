"use client";

/**
 * SecurityForm —— Tab-4 账号安全
 *
 * a) 用户名：仅只读展示（V0.6.1 需求5：注册确认后永久不可修改，
 *    前端移除了全部修改入口与二次确认弹窗；后端同样拒绝改用户名请求）
 * b) 密码：旧密码/新密码/确认（统一 PasswordInput 眼睛切换）+ 强度指示器，
 *    POST /api/auth/change-password；强制旧密码，不提供邮箱验证码绕过入口；
 *    「保留当前设备登录」默认勾选，取消 = 全部会话（含本机）强制下线
 * c) 一次性安全恢复码
 * d) 预留入口：更换绑定邮箱 / 手机号（disabled + comingSoon 说明）
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
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchProfile, changePassword } from "@/lib/api/auth";
import { clearLocalSession } from "@/lib/auth";
import { meetsPasswordPolicy, passwordClassCount } from "@/lib/passwordPolicy";
import { RecoveryCodesCard } from "./RecoveryCodesCard";
import { cn } from "@/lib/utils";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

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

  // 当前用户名（只读展示）
  const [currentUsername, setCurrentUsername] = useState("");
  const [loading, setLoading] = useState(true);

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
      {/* a) 用户名（只读：注册确认后永久不可修改） */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserCog className="h-5 w-5" />
            {t("account.usernameSection")}
          </CardTitle>
          <CardDescription>{t("account.usernameImmutable")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("account.currentUsername")}</span>
            <span className="font-mono font-medium">{currentUsername}</span>
          </div>
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

      {/* c) 一次性安全恢复码（V0.5.8 §4 账号兜底找回密钥） */}
      <RecoveryCodesCard />

      {/* d) 预留入口 */}
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
    </div>
  );
}
