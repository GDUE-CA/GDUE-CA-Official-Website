"use client";

/**
 * /admin/recover - 账号紧急恢复页（公开）
 * 所有管理员失能时，答对安全问题 → 重置超管密码
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, LifeBuoy, ArrowLeft, CheckCircle2 } from "lucide-react";
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
import {
  fetchSecurityQuestion,
  recoverViaSecurityQuestion,
} from "@/lib/api/auth";
import { meetsPasswordPolicy } from "@/lib/passwordPolicy";

export default function RecoverPage() {
  const { t } = useI18n();
  const [question, setQuestion] = useState<string>("");
  const [answer, setAnswer] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [qLoading, setQLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchSecurityQuestion()
      .then((q) => setQuestion(q.question))
      .catch(() => setQuestion(""))
      .finally(() => setQLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer) return;
    if (!meetsPasswordPolicy(newPwd)) {
      setError(t("common.passwordPolicy"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await recoverViaSecurityQuestion({ answer, new_password: newPwd });
      setSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("admin.recover.error");
      setError(msg);
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
              <LifeBuoy className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">{t("admin.recover.title")}</CardTitle>
            <CardDescription>{t("admin.recover.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-center text-lg font-medium">{t("admin.recover.success")}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* 安全问题展示 */}
                <div className="space-y-2">
                  <Label>{t("admin.recover.securityQuestion")}</Label>
                  <div className="rounded-md border border-border bg-muted/50 px-3 py-2.5 text-sm">
                    {qLoading ? "..." : question || "—"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="answer">{t("admin.recover.securityAnswer")}</Label>
                  <Input
                    id="answer"
                    placeholder={t("admin.recover.securityAnswerPlaceholder")}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newpwd">{t("admin.recover.newPassword")}</Label>
                  <Input
                    id="newpwd"
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("admin.recover.newPasswordPlaceholder")}
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={loading || !question} className="w-full" size="lg">
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("admin.recover.submitting")}
                    </>
                  ) : (
                    t("admin.recover.submit")
                  )}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center">
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/login">
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  {t("admin.recover.backToLogin")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
