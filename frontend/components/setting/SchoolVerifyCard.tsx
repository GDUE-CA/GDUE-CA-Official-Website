"use client";

/**
 * SchoolVerifyCard —— 个人设置-个人资料【学校身份验证】（Module D-1）
 *
 * 四态流转：未提交(none) / 审核中(pending) / 已通过(approved) / 已驳回(rejected)
 * - 审核中禁止重复提交；驳回允许重新提交；通过后学校资料解锁（个人资料区编辑）
 * - 表单：学号（11 位前端预校验，后端二次校验年份区间）+ 学院→年级→专业→班级
 *   联动下拉（数据全部来自 /api/sys/*，后端严格校验整套组合）+ 用户备注 + 可选附件
 */
import { useEffect, useRef, useState } from "react";
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
  EMPTY_SCHOOL_CASCADE,
  SchoolCascadeSelects,
  type SchoolCascadeValue,
} from "@/components/setting/SchoolCascadeSelects";
import { useDirtyGuard } from "@/components/setting/SettingGuardContext";
import {
  getSchoolVerifyStatus,
  submitSchoolVerify,
} from "@/lib/api/schoolVerify";
import { uploadRealnameEvidence } from "@/lib/api/realname";
import type { SchoolVerifyStatusOut } from "@/types/api";
import Building2 from "@/assets/icons/status/building-2.svg";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import Clock from "@/assets/icons/status/clock.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Paperclip from "@/assets/icons/action/paperclip.svg";
import XCircle from "@/assets/icons/status/x-circle.svg";
import { cn } from "@/lib/utils";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

const PAGE_KEY = "school-verify";

const STUDENT_ID_RE = /^\d{11}$/;

function fmtDate(s: string | null | undefined): string {
  if (!s) return "-";
  return s.slice(0, 10);
}

/** 后端请求体字段名（data-field 对位，与 1001 data.errors[].field 一致） */
type SchoolVerifyField =
  | "student_id" | "remark" | "attach_url";

export function SchoolVerifyCard() {
  const { t } = useI18n();
  const { registerDirty } = useDirtyGuard();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldErrors = useServerFieldErrors<SchoolVerifyField>({ fallback: t("setting.school.submitFailed") });
  const fe = fieldErrors.errors;
  const [success, setSuccess] = useState(false);

  const [data, setData] = useState<SchoolVerifyStatusOut | null>(null);
  const [studentId, setStudentId] = useState("");
  const [cascade, setCascade] = useState<SchoolCascadeValue>({ ...EMPTY_SCHOOL_CASCADE });
  const [remark, setRemark] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const d = await getSchoolVerifyStatus();
    setData(d);
    // 已驳回 → 默认展开重新提交表单；未提交 → 展开表单
    if (d.status === "rejected" || d.status === "none") setShowForm(true);
    else setShowForm(false);
  }

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("admin.profile.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formDirty =
    studentId.trim() !== "" || remark.trim() !== "" || attachUrl.trim() !== "" ||
    cascade.college_id != null || cascade.major_id != null ||
    cascade.grade_id != null || cascade.class_id != null;

  useEffect(() => {
    registerDirty(PAGE_KEY, formDirty && showForm);
    return () => registerDirty(PAGE_KEY, false);
  }, [formDirty, showForm, registerDirty]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const url = await uploadRealnameEvidence(file);
      setAttachUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setting.school.attachFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // 前端预校验（仅体验提示；后端为最终校验）
    if (!STUDENT_ID_RE.test(studentId.trim())) {
      setError(t("setting.school.studentIdInvalid"));
      return;
    }
    if (
      cascade.college_id == null || cascade.major_id == null ||
      cascade.grade_id == null || cascade.class_id == null
    ) {
      setError(t("setting.school.incomplete"));
      return;
    }
    setSaving(true);
    try {
      await submitSchoolVerify({
        student_id: studentId.trim(),
        college_id: cascade.college_id,
        major_id: cascade.major_id,
        grade_id: cascade.grade_id,
        class_id: cascade.class_id,
        remark: remark.trim() || null,
        attach_url: attachUrl.trim() || null,
      });
      setStudentId("");
      setCascade({ ...EMPTY_SCHOOL_CASCADE });
      setRemark("");
      setAttachUrl("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await refresh();
    } catch (err) {
      setError(fieldErrors.capture(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = data?.status ?? "none";
  const latest = data?.latest ?? null;
  const schoolSummary = latest
    ? [latest.college_name, latest.major_name, latest.grade_year != null ? `${latest.grade_year} 级` : null, latest.class_display_name]
        .filter(Boolean)
        .join(" / ")
    : "";

  const statusChip = {
    none: { label: t("setting.school.statusNone"), cls: "bg-muted text-muted-foreground", icon: Building2 },
    pending: { label: t("setting.school.statusPending"), cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", icon: Clock },
    approved: { label: t("setting.school.statusApproved"), cls: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300", icon: CheckCircle2 },
    rejected: { label: t("setting.school.statusRejected"), cls: "bg-destructive/10 text-destructive", icon: XCircle },
  }[status];
  const ChipIcon = statusChip.icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="h-4 w-4" />
          {t("setting.school.title")}
          <span className={cn("ml-1 rounded-full px-2.5 py-0.5 text-xs font-medium", statusChip.cls)}>
            <ChipIcon className="mr-1 inline h-3 w-3" />
            {statusChip.label}
          </span>
        </CardTitle>
        <CardDescription>{t("setting.school.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 已通过：展示学校资料摘要（联表文本），提示在个人资料区编辑 */}
        {status === "approved" && (
          <div className="rounded-md bg-muted/40 px-3 py-2.5 text-sm">
            <p className="font-medium">
              {t("setting.school.studentId")}：{latest?.student_id ?? "-"}
            </p>
            <p className="mt-1 text-muted-foreground">{schoolSummary || "-"}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t("setting.school.approvedHint")}</p>
          </div>
        )}

        {/* 审核中：禁止重复提交 */}
        {status === "pending" && latest && (
          <div className="rounded-md bg-amber-50 px-3 py-2.5 text-sm dark:bg-amber-950/20">
            <p className="font-medium text-amber-700 dark:text-amber-300">
              {t("setting.school.pendingHint")}
            </p>
            <p className="mt-1 text-muted-foreground">
              {t("setting.school.studentId")}：{latest.student_id}　{schoolSummary}
            </p>
          </div>
        )}

        {/* 已驳回：驳回理由 + 可重新提交 */}
        {status === "rejected" && latest && (
          <div className="rounded-md bg-destructive/10 px-3 py-2.5 text-sm">
            <p className="font-medium text-destructive">
              {t("setting.school.rejectionReason")}：{latest.admin_remark || "-"}
            </p>
            <p className="mt-1 text-muted-foreground">{t("setting.school.rejectedHint")}</p>
          </div>
        )}

        {/* 提交表单（none / rejected 展开；其余可手动展开查看但按钮禁用） */}
        {showForm && (
          <form {...fieldErrors.rootProps} onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2" data-field="student_id">
                <Label htmlFor="sv-studentId">{t("setting.school.studentId")}</Label>
                <Input
                  id="sv-studentId"
                  aria-invalid={!!fe.student_id}
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  inputMode="numeric"
                  placeholder={t("setting.school.studentIdPlaceholder")}
                  maxLength={11}
                />
                <p className="text-xs text-muted-foreground">{t("setting.school.studentIdHint")}</p>
                <FieldError>{fe.student_id}</FieldError>
              </div>
            </div>

            <SchoolCascadeSelects value={cascade} onChange={setCascade} />

            <div className="space-y-2" data-field="remark">
              <Label htmlFor="sv-remark">{t("setting.school.remark")}</Label>
              <textarea
                id="sv-remark"
                aria-invalid={!!fe.remark}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={t("setting.school.remarkPlaceholder")}
                maxLength={1000}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <FieldError>{fe.remark}</FieldError>
            </div>

            <div className="space-y-2" data-field="attach_url">
              <Label htmlFor="sv-attach">{t("setting.school.attach")}</Label>
              <div className="flex gap-2">
                <Input
                  id="sv-attach"
                  aria-invalid={!!fe.attach_url}
                  value={attachUrl}
                  onChange={(e) => setAttachUrl(e.target.value)}
                  placeholder={t("setting.school.attachPlaceholder")}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  {t("setting.school.attachUpload")}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("setting.school.attachHint")}</p>
              <FieldError>{fe.attach_url}</FieldError>
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            {success && (
              <p className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-600 dark:bg-green-950/20">
                <CheckCircle2 className="h-4 w-4" />
                {t("setting.school.submitted")}
              </p>
            )}

            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("setting.saving")}
                </>
              ) : (
                t("setting.school.submit")
              )}
            </Button>
          </form>
        )}

        {/* 申请历史（全部留存，含驳回记录） */}
        {(data?.history?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <Label>{t("setting.school.history")}</Label>
            <div className="divide-y divide-border rounded-md border border-border">
              {data!.history.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">
                      {h.student_id}
                      {h.college_name || h.major_name ? `　${h.college_name ?? ""} ${h.major_name ?? ""}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(h.created_at)}
                      {h.reviewed_at ? ` → ${fmtDate(h.reviewed_at)}` : ""}
                      {h.status === "rejected" && h.admin_remark ? `　${t("setting.school.rejectionReason")}：${h.admin_remark}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      h.status === "approved" && "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
                      h.status === "pending" && "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                      h.status === "rejected" && "bg-destructive/10 text-destructive"
                    )}
                  >
                    {t(`setting.school.status_${h.status}`)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
