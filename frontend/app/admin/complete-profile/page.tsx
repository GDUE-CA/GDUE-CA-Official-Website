"use client";

/**
 * /admin/complete-profile - 第三方登录首次注册补资料页
 * 后端 OAuth 回调发现未绑定时下发票据 Cookie 并 302 到此页：
 * - GET /api/oauth/pending 读取预填信息（provider/email/name，仅展示参考）
 * - 用户名必须手动自定义（禁止自动使用第三方昵称），POST /api/oauth/complete
 * - 成功后创建 member 账号并建立会话 → 跳转前台个人资料页
 * - 票据缺失 / 过期（401）→ 回登录页
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, UserPlus } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
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
import { completeOAuthProfile, getPendingOAuthProfile } from "@/lib/api/oauth";
import { saveSession } from "@/lib/auth";
import { COUNTRY_OPTIONS, PHONE_RULES } from "@/components/join/phoneRules";
import type { OAuthProvider, PendingOAuthProfile } from "@/types/api";

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  github: "GitHub",
  microsoft: "Microsoft",
  apple: "Apple",
  google: "Google",
};

export default function CompleteProfilePage() {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();
  const [pending, setPending] = useState<PendingOAuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 表单字段（用户名 / 学号 / 姓名 / 手机号全部手动填写）
  const [username, setUsername] = useState("");
  const [studentId, setStudentId] = useState("");
  const [realName, setRealName] = useState("");
  const [phoneCc, setPhoneCc] = useState("+86");
  const [phoneNumber, setPhoneNumber] = useState("");

  useEffect(() => {
    getPendingOAuthProfile()
      .then(setPending)
      .catch(() => router.replace(lp("/login")))
      .finally(() => setLoading(false));
  }, [router]);

  /** 当前区号对应手机号占位提示 */
  const phonePlaceholder = useMemo(() => {
    return phoneCc === "+86"
      ? "13800138000"
      : phoneCc === "+852"
        ? "91234567"
        : phoneCc === "+44"
          ? "7400123456"
          : t("join.form.phonePlaceholder");
  }, [phoneCc, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !studentId.trim() || !realName.trim() || !phoneNumber.trim()) return;
    const rule = PHONE_RULES[phoneCc];
    if (rule && !rule.test(phoneNumber.trim())) {
      setError(t("join.form.errors.phoneNumberInvalid"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await completeOAuthProfile({
        username: username.trim(),
        student_id: studentId.trim(),
        real_name: realName.trim(),
        phone_cc: phoneCc,
        phone_number: phoneNumber.trim(),
      });
      saveSession(
        {
          username: res.username,
          role: res.role,
          realnameVerified: res.realname_verified,
        },
        res.csrf_token
      );
      router.replace(lp("/setting/profile"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("completeProfile.error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
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
              <UserPlus className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">{t("completeProfile.title")}</CardTitle>
            <CardDescription>
              {t("completeProfile.subtitle", {
                provider: pending ? PROVIDER_LABEL[pending.provider] : "",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* 第三方预填信息仅作参考展示；用户名必须手动自定义 */}
            {pending && (
              <div className="mb-4 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">{t("completeProfile.oauthEmail")}：</span>
                  {pending.email || t("completeProfile.oauthEmailNone")}
                </p>
                {pending.name && (
                  <p>
                    <span className="text-muted-foreground">{t("completeProfile.oauthName")}：</span>
                    {pending.name}
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="username">{t("completeProfile.username")}</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  placeholder={t("completeProfile.usernamePlaceholder")}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={2}
                  maxLength={64}
                />
                <p className="text-xs text-muted-foreground">{t("completeProfile.usernameHint")}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="studentId">{t("completeProfile.studentId")}</Label>
                  <Input
                    id="studentId"
                    placeholder={t("completeProfile.studentIdPlaceholder")}
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    required
                    maxLength={32}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="realName">{t("completeProfile.realName")}</Label>
                  <Input
                    id="realName"
                    placeholder={t("completeProfile.realNamePlaceholder")}
                    value={realName}
                    onChange={(e) => setRealName(e.target.value)}
                    required
                    maxLength={64}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber">{t("completeProfile.phoneNumber")}</Label>
                {/* 区号选择使用系统原生 select，全平台适配（含 iOS 不卡顿） */}
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <select
                    id="phoneCc"
                    aria-label={t("completeProfile.phoneCc")}
                    value={phoneCc}
                    onChange={(e) => setPhoneCc(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {COUNTRY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    id="phoneNumber"
                    inputMode="tel"
                    placeholder={phonePlaceholder}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                    maxLength={32}
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={submitting} className="w-full" size="lg">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("completeProfile.submitting")}
                  </>
                ) : (
                  t("completeProfile.submit")
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
