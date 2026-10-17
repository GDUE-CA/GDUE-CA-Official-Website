/**
 * 手动新增报名弹窗：管理员补录线下报名 / 截止后人工增补的报名记录
 * - 不受报名时间窗与人数上限限制（后端 POST /api/registrations/admin/manual）
 * - 字段规范与公开报名表单一致：手机号按区号本地规范校验（phoneRules）
 */
"use client";

import { useState } from "react";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import UserPlus from "@/assets/icons/user/user-plus.svg";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createManualRegistration } from "@/lib/api/register";
import { COUNTRY_OPTIONS, PHONE_RULES } from "@/components/join/phoneRules";
import type { Activity, Registration, RegistrationStatus } from "@/types/api";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

const EMPTY = {
  activityId: "",
  status: "approved" as RegistrationStatus,
  name: "",
  studentId: "",
  college: "",
  major: "",
  phoneCc: "+86",
  phoneNumber: "",
  email: "",
  introduction: "",
  remark: "",
};

/** 后端 ManualRegistrationIn 字段名（前端预校验与后端 1001 错误共用，data-field 对位） */
type ManualField =
  | "registration_type" | "activity_id" | "status" | "name"
  | "student_id" | "college" | "major" | "phone_cc"
  | "phone_number" | "email" | "introduction"
  | "remark";

export function ManualRegistrationDialog({
  open,
  onOpenChange,
  activities,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activities: Activity[];
  onCreated: (reg: Registration) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(EMPTY);
  const fieldErrors = useServerFieldErrors<ManualField>({
    // 区号与号码同处一栏，区号错误显示在号码下方
    fieldMap: { phone_cc: "phone_number" },
    fallback: t("admin.review.manual.error"),
  });
  const errors = fieldErrors.errors;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 每次打开重置为初始状态（渲染期对比前值，避免 effect 内同步 setState 引发级联渲染）
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(EMPTY);
      fieldErrors.clear();
      setSubmitError(null);
    }
  }

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const next: Partial<Record<ManualField, string>> = {};
    if (!form.name.trim()) next.name = t("join.form.errors.nameRequired");
    if (!form.studentId.trim()) next.student_id = t("join.form.errors.studentIdRequired");
    if (!form.college.trim()) next.college = t("join.form.errors.collegeRequired");
    if (!form.major.trim()) next.major = t("join.form.errors.majorRequired");
    if (!form.phoneCc) {
      next.phone_number = t("join.form.errors.phoneCcRequired");
    } else if (!form.phoneNumber.trim()) {
      next.phone_number = t("join.form.errors.phoneRequired");
    } else {
      const rule = PHONE_RULES[form.phoneCc];
      const ok = rule
        ? rule.test(form.phoneNumber.replace(/\s/g, ""))
        : /^\d{6,15}$/.test(form.phoneNumber);
      if (!ok) next.phone_number = t("join.form.errors.phoneInvalid");
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = t("join.form.errors.emailInvalid");
    }
    if (!form.activityId) {
      next.activity_id = t("join.form.errors.activityRequired");
    }
    return !fieldErrors.set(next);
  }

  async function submit() {
    setSubmitError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const reg = await createManualRegistration({
        registration_type: "activity",
        activity_id: Number(form.activityId),
        status: form.status,
        name: form.name.trim(),
        student_id: form.studentId.trim(),
        college: form.college.trim(),
        major: form.major.trim(),
        phone_cc: form.phoneCc,
        phone_number: form.phoneNumber.replace(/\s/g, ""),
        email: form.email || undefined,
        introduction: form.introduction || undefined,
        remark: form.remark || undefined,
      });
      alert(t("admin.review.manual.success").replace("{code}", reg.receipt_code));
      onCreated(reg);
      onOpenChange(false);
    } catch (e) {
      setSubmitError(fieldErrors.capture(e));
    } finally {
      setSubmitting(false);
    }
  }

  const phonePlaceholder =
    form.phoneCc === "+86"
      ? "11 位手机号，如 13812345678"
      : form.phoneCc === "+852"
      ? "8 位号码，如 51234567"
      : form.phoneCc === "+44"
      ? "10 位号码，如 7123456789"
      : t("join.form.phoneNumberPlaceholder");

  const selectCls = "h-9 rounded-md border border-input bg-background px-3 text-sm w-full";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...fieldErrors.rootProps} className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t("admin.review.manual.title")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t("admin.review.manual.desc")}</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* 仅补录活动报名；社团报名统一走「社团报名审核」（账号内报名，含回执码） */}
          <div className="space-y-1.5" data-field="activity_id">
            <Label>{t("admin.review.manual.activity")}</Label>
            <select
              className={selectCls}
              value={form.activityId}
              onChange={(e) => set("activityId", e.target.value)}
              aria-invalid={!!errors.activity_id}
            >
              <option value="">{t("admin.registrations.filterActivity")}</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
            <FieldError>{errors.activity_id}</FieldError>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5" data-field="name">
              <Label>{t("join.form.name")}</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={t("join.form.namePlaceholder")}
                aria-invalid={!!errors.name}
              />
              <FieldError>{errors.name}</FieldError>
            </div>
            <div className="space-y-1.5" data-field="student_id">
              <Label>{t("join.form.studentId")}</Label>
              <Input
                value={form.studentId}
                onChange={(e) => set("studentId", e.target.value)}
                placeholder={t("join.form.studentIdPlaceholder")}
                aria-invalid={!!errors.student_id}
              />
              <FieldError>{errors.student_id}</FieldError>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5" data-field="college">
              <Label>{t("join.form.college")}</Label>
              <Input
                value={form.college}
                onChange={(e) => set("college", e.target.value)}
                placeholder={t("join.form.collegePlaceholder")}
                aria-invalid={!!errors.college}
              />
              <FieldError>{errors.college}</FieldError>
            </div>
            <div className="space-y-1.5" data-field="major">
              <Label>{t("join.form.major")}</Label>
              <Input
                value={form.major}
                onChange={(e) => set("major", e.target.value)}
                placeholder={t("join.form.majorPlaceholder")}
                aria-invalid={!!errors.major}
              />
              <FieldError>{errors.major}</FieldError>
            </div>
          </div>

          <div className="space-y-1.5" data-field="phone_number">
            <Label>{t("join.form.phoneNumber")}</Label>
            <div className="grid grid-cols-[150px_1fr] gap-2">
              <select
                className={selectCls}
                value={form.phoneCc}
                onChange={(e) => set("phoneCc", e.target.value)}
                aria-label={t("join.form.phoneCc")}
              >
                {COUNTRY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <Input
                inputMode="tel"
                value={form.phoneNumber}
                onChange={(e) => set("phoneNumber", e.target.value)}
                placeholder={phonePlaceholder}
                aria-invalid={!!errors.phone_number}
              />
            </div>
            <FieldError>{errors.phone_number}</FieldError>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5" data-field="email">
              <Label>{t("join.form.email")}</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder={t("join.form.emailPlaceholder")}
                aria-invalid={!!errors.email}
              />
              <FieldError>{errors.email}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.review.manual.status")}</Label>
              <select
                className={selectCls}
                value={form.status}
                onChange={(e) => set("status", e.target.value as RegistrationStatus)}
              >
                <option value="approved">{t("admin.registrations.statuses.approved")}</option>
                <option value="pending">{t("admin.registrations.statuses.pending")}</option>
                <option value="rejected">{t("admin.registrations.statuses.rejected")}</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("join.form.introduction")}</Label>
            <Textarea
              rows={3}
              value={form.introduction}
              onChange={(e) => set("introduction", e.target.value)}
              placeholder={t("join.form.introductionPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("admin.review.manual.remark")}</Label>
            <Textarea
              rows={2}
              value={form.remark}
              onChange={(e) => set("remark", e.target.value)}
              placeholder={t("admin.review.manual.remarkPlaceholder")}
            />
          </div>
        </div>

        {submitError && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{submitError}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{t("admin.review.manual.submitting")}</>
            ) : (
              <><UserPlus className="h-4 w-4" />{t("admin.review.manual.submit")}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
