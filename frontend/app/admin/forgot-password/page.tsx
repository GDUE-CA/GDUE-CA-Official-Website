"use client";

/**
 * /admin/forgot-password - 忘记密码申请页（公开）
 * 提交申请到后端，管理员审核后手动联系
 */
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import MailQuestion from "@/assets/icons/status/mail-question.svg";
import ArrowLeft from "@/assets/icons/navigation/arrow-left.svg";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { submitForgotPassword } from "@/lib/api/auth";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

/** 后端请求体字段名（data-field 对位，与 1001 data.errors[].field 一致） */
type ForgotRequestField =
  | "contact_email" | "username_hint" | "reason";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const [email, setEmail] = useState("");
  const [usernameHint, setUsernameHint] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldErrors = useServerFieldErrors<ForgotRequestField>({ fallback: t("admin.forgotPassword.error") });
  const fe = fieldErrors.errors;
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !reason) return;
    setLoading(true);
    setError(null);
    try {
      await submitForgotPassword({
        contact_email: email,
        username_hint: usernameHint || undefined,
        reason,
      });
      setSuccess(true);
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
              <MailQuestion className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">{t("admin.forgotPassword.title")}</CardTitle>
            <CardDescription>{t("admin.forgotPassword.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-center text-lg font-medium">{t("admin.forgotPassword.success")}</p>
              </div>
            ) : (
              <form {...fieldErrors.rootProps} onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-2" data-field="contact_email">
                  <Label htmlFor="email">{t("admin.forgotPassword.contactEmail")}</Label>
                  <Input
                    id="email"
                    aria-invalid={!!fe.contact_email}
                    type="email"
                    placeholder={t("admin.forgotPassword.contactEmailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <FieldError>{fe.contact_email}</FieldError>
                </div>
                <div className="space-y-2" data-field="username_hint">
                  <Label htmlFor="hint">{t("admin.forgotPassword.usernameHint")}</Label>
                  <Input
                    id="hint"
                    aria-invalid={!!fe.username_hint}
                    placeholder={t("admin.forgotPassword.usernameHintPlaceholder")}
                    value={usernameHint}
                    onChange={(e) => setUsernameHint(e.target.value)}
                  />
                  <FieldError>{fe.username_hint}</FieldError>
                </div>
                <div className="space-y-2" data-field="reason">
                  <Label htmlFor="reason">{t("admin.forgotPassword.reason")}</Label>
                  <Textarea
                    id="reason"
                    aria-invalid={!!fe.reason}
                    placeholder={t("admin.forgotPassword.reasonPlaceholder")}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    required
                  />
                  <FieldError>{fe.reason}</FieldError>
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
                      {t("admin.forgotPassword.submitting")}
                    </>
                  ) : (
                    t("admin.forgotPassword.submit")
                  )}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center">
              <Button asChild variant="ghost" size="sm">
                <Link href={lp("/login")}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  {t("admin.forgotPassword.backToLogin")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
