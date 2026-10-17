"use client";

/**
 * /admin/change-password - 修改密码页
 * 首次登录默认密码强制改密，也可主动修改
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import KeyRound from "@/assets/icons/status/key-round.svg";
import ArrowLeft from "@/assets/icons/navigation/arrow-left.svg";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { changePassword } from "@/lib/api/auth";
import { getSession, isAdminRole } from "@/lib/auth";
import { meetsPasswordPolicy } from "@/lib/passwordPolicy";
import { PasswordInput } from "@/components/ui/password-input";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

/** 后端请求体字段名（data-field 对位，与 1001 data.errors[].field 一致） */
type ChangePasswordField =
  | "old_password" | "new_password" | "confirm_password";

export default function ChangePasswordPage() {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldErrors = useServerFieldErrors<ChangePasswordField>({ fallback: t("admin.changePassword.error") });
  const fe = fieldErrors.errors;
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setError(t("admin.changePassword.mismatch"));
      return;
    }
    if (!meetsPasswordPolicy(newPwd)) {
      setError(t("common.passwordPolicy"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await changePassword({ old_password: oldPwd, new_password: newPwd, confirm_password: confirmPwd });
      setSuccess(true);
      // 管理员回后台；普通成员回前台个人资料页
      const target = isAdminRole(getSession()?.role) ? lp("/admin/dashboard") : lp("/setting/profile");
      setTimeout(() => router.replace(target), 1500);
    } catch (err) {
      setError(fieldErrors.capture(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-background to-muted/30">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <Card className="shadow-xl">
          <CardHeader className="text-center space-y-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mx-auto">
              <KeyRound className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">{t("admin.changePassword.title")}</CardTitle>
            <CardDescription>{t("admin.changePassword.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-lg font-medium">{t("admin.changePassword.success")}</p>
              </div>
            ) : (
              <form {...fieldErrors.rootProps} onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-2" data-field="old_password">
                  <Label htmlFor="old">{t("admin.changePassword.oldPassword")}</Label>
                  <PasswordInput
                    id="old"
                    aria-invalid={!!fe.old_password}
                    autoComplete="current-password"
                    placeholder={t("admin.changePassword.oldPasswordPlaceholder")}
                    value={oldPwd}
                    onChange={(e) => setOldPwd(e.target.value)}
                    required
                  />
                  <FieldError>{fe.old_password}</FieldError>
                </div>
                <div className="space-y-2" data-field="new_password">
                  <Label htmlFor="new">{t("admin.changePassword.newPassword")}</Label>
                  <PasswordInput
                    id="new"
                    aria-invalid={!!fe.new_password}
                    autoComplete="new-password"
                    placeholder={t("admin.changePassword.newPasswordPlaceholder")}
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    required
                  />
                  <FieldError>{fe.new_password}</FieldError>
                </div>
                <div className="space-y-2" data-field="confirm_password">
                  <Label htmlFor="confirm">{t("admin.changePassword.confirmPassword")}</Label>
                  <PasswordInput
                    id="confirm"
                    aria-invalid={!!fe.confirm_password}
                    autoComplete="new-password"
                    placeholder={t("admin.changePassword.confirmPlaceholder")}
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    required
                  />
                  <FieldError>{fe.confirm_password}</FieldError>
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={loading} className="w-full" size="lg">
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("admin.changePassword.submitting")}
                    </>
                  ) : (
                    t("admin.changePassword.submit")
                  )}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center">
              <Button asChild variant="ghost" size="sm">
                <Link href={lp("/login")}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  {t("admin.changePassword.backToLogin")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
