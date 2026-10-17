"use client";

/**
 * /admin/realname - 实名验证页（admin/editor 未实名进后台时被守卫跳转至此）
 * - GET /api/realname/status：已实名展示状态；未实名展示提交表单
 * - 待审核（pending）时禁止重复提交；被拒绝（rejected）展示原因可修改重交
 * - 凭证图片（学生证/校园卡）先上传 POST /api/realname/evidence 换 URL 再提交
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import BadgeCheck from "@/assets/icons/status/badge-check.svg";
import Clock from "@/assets/icons/status/clock.svg";
import ShieldAlert from "@/assets/icons/status/shield-alert.svg";
import Upload from "@/assets/icons/action/upload.svg";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
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
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import {
  getRealnameStatus,
  submitRealname,
  uploadRealnameEvidence,
} from "@/lib/api/realname";
import { getSession, isAdminRole } from "@/lib/auth";
import { COUNTRY_OPTIONS, PHONE_RULES } from "@/components/join/phoneRules";
import type { RealnameRequest, RealnameStatusOut } from "@/types/api";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

/** 状态徽章通用样式 */
/** 后端请求体字段名（data-field 对位，与 1001 data.errors[].field 一致） */
type RealnameField =
  | "student_id" | "real_name" | "phone_number" | "evidence_url";

function StatusBadge({ status }: { status: RealnameRequest["status"] }) {
  const { t } = useI18n();
  const map = {
    pending: {
      icon: <Clock className="h-3.5 w-3.5" />,
      cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      label: t("realname.statusPending"),
    },
    approved: {
      icon: <BadgeCheck className="h-3.5 w-3.5" />,
      cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      label: t("realname.statusApproved"),
    },
    rejected: {
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      cls: "bg-destructive/15 text-destructive",
      label: t("realname.statusRejected"),
    },
  } as const;
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

export default function RealnamePage() {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const router = useRouter();
  const [status, setStatus] = useState<RealnameStatusOut | null>(null);
  const [loading, setLoading] = useState(true);

  // 表单
  const [studentId, setStudentId] = useState("");
  const [realName, setRealName] = useState("");
  const [phoneCc, setPhoneCc] = useState("+86");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldErrors = useServerFieldErrors<RealnameField>({ fallback: t("realname.submitError") });
  const fe = fieldErrors.errors;
  const [success, setSuccess] = useState(false);

  /** 未登录回登录页；登录后加载实名状态 */
  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace(lp("/login"));
      return;
    }
    getRealnameStatus()
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : null))
      .finally(() => setLoading(false));
  }, [router]);

  /** 最近一次申请：pending 审核中禁止重复提交 */
  const latest = status?.latest ?? null;
  const canSubmit = !!status && !status.verified && latest?.status !== "pending";

  async function handleEvidence(file: File) {
    setEvidenceUploading(true);
    setError(null);
    try {
      const url = await uploadRealnameEvidence(file);
      setEvidenceUrl(url);
      setEvidencePreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("realname.evidenceError"));
    } finally {
      setEvidenceUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId.trim() || !realName.trim() || !phoneNumber.trim()) return;
    const rule = PHONE_RULES[phoneCc];
    if (rule && !rule.test(phoneNumber.trim())) {
      setError(t("join.form.errors.phoneNumberInvalid"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitRealname({
        student_id: studentId.trim(),
        real_name: realName.trim(),
        phone_cc: phoneCc,
        phone_number: phoneNumber.trim(),
        evidence_url: evidenceUrl ?? undefined,
      });
      setSuccess(true);
      const refreshed = await getRealnameStatus();
      setStatus(refreshed);
    } catch (err) {
      setError(fieldErrors.capture(err));
    } finally {
      setSubmitting(false);
    }
  }

  const backHref = isAdminRole(getSession()?.role) ? lp("/admin/dashboard") : lp("/setting/profile");

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
              <BadgeCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">{t("realname.title")}</CardTitle>
            <CardDescription>{t("realname.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* 已实名 */}
            {status?.verified && (
              <div className="rounded-lg border bg-emerald-500/10 px-4 py-3 space-y-1.5">
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  {t("realname.statusVerified")}
                </p>
                {status.verified_at && (
                  <p className="text-xs text-muted-foreground">
                    {t("realname.verifiedAt")}：
                    <FormattedUserActionTime utcIso={status.verified_at} />
                  </p>
                )}
              </div>
            )}

            {/* 未实名：最近申请状态（审核中 / 被拒原因） */}
            {!status?.verified && latest && (
              <div className="rounded-lg border px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t("realname.latest")}</span>
                  <StatusBadge status={latest.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("realname.submittedAt")}：
                  <FormattedUserActionTime utcIso={latest.submitted_at} />
                </p>
                {latest.status === "rejected" && latest.note && (
                  <p className="text-xs text-destructive">
                    {t("realname.rejectReason")}：{latest.note}
                  </p>
                )}
                {latest.status === "pending" && (
                  <p className="text-xs text-muted-foreground">{t("realname.pendingHint")}</p>
                )}
              </div>
            )}

            {/* 提交成功提示 */}
            {success && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-md">
                {t("realname.submitSuccess")}
              </p>
            )}

            {/* 提交表单（已实名 / 审核中隐藏） */}
            {canSubmit && !success && (
              <form {...fieldErrors.rootProps} onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2" data-field="student_id">
                    <Label htmlFor="studentId">{t("realname.form.studentId")}</Label>
                    <Input
                      id="studentId"
                      aria-invalid={!!fe.student_id}
                      placeholder={t("realname.form.studentIdPlaceholder")}
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      required
                      maxLength={32}
                    />
                    <FieldError>{fe.student_id}</FieldError>
                  </div>
                  <div className="space-y-2" data-field="real_name">
                    <Label htmlFor="realName">{t("realname.form.realName")}</Label>
                    <Input
                      id="realName"
                      aria-invalid={!!fe.real_name}
                      placeholder={t("realname.form.realNamePlaceholder")}
                      value={realName}
                      onChange={(e) => setRealName(e.target.value)}
                      required
                      maxLength={64}
                    />
                    <FieldError>{fe.real_name}</FieldError>
                  </div>
                </div>

                <div className="space-y-2" data-field="phone_number">
                  <Label htmlFor="phoneNumber">{t("realname.form.phoneNumber")}</Label>
                  {/* 区号选择使用系统原生 select，全平台适配 */}
                  <div className="grid grid-cols-[140px_1fr] gap-2">
                    <select
                      id="phoneCc"
                      aria-label={t("realname.form.phoneCc")}
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
                      aria-invalid={!!fe.phone_number}
                      inputMode="tel"
                      placeholder={phoneCc === "+86" ? "13800138000" : t("realname.form.phonePlaceholder")}
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      required
                      maxLength={32}
                    />
                  </div>
                  <FieldError>{fe.phone_number}</FieldError>
                </div>

                {/* 凭证图片（可选）：先上传换 URL，预览本地文件 */}
                <div className="space-y-2" data-field="evidence_url">
                  <Label htmlFor="evidence">{t("realname.form.evidence")}</Label>
                  <input
                    ref={fileInputRef}
                    id="evidence"
                    aria-invalid={!!fe.evidence_url}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleEvidence(file);
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={evidenceUploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {evidenceUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {evidenceUploading ? t("realname.form.evidenceUploading") : t("realname.form.evidencePick")}
                    </Button>
                    <span className="text-xs text-muted-foreground">{t("realname.form.evidenceHint")}</span>
                  </div>
                  {evidencePreview && (
                    // 本地预览（上传已换 evidence_url 提交）
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={evidencePreview}
                      alt={t("realname.form.evidence")}
                      className="mt-1 max-h-40 rounded-md border object-contain"
                    />
                  )}
                  <FieldError>{fe.evidence_url}</FieldError>
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
                      {t("realname.submitting")}
                    </>
                  ) : (
                    t("realname.submit")
                  )}
                </Button>
              </form>
            )}

            <div className="text-center pt-1">
              <Button asChild variant="ghost" size="sm">
                <Link href={backHref}>{t("realname.back")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
