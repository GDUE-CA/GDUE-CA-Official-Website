/**
 * 手动新增报名弹窗：管理员补录线下报名 / 截止后人工增补的报名记录
 * - 不受报名时间窗与人数上限限制（后端 POST /api/registrations/admin/manual）
 * - 字段规范与公开报名表单一致：手机号按区号本地规范校验（phoneRules）
 */
"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createManualRegistration } from "@/lib/api/register";
import { COUNTRY_OPTIONS, PHONE_RULES } from "@/components/join/phoneRules";
import type { Activity, Registration, RegistrationStatus, RegistrationType } from "@/types/api";

/** 意向部门取值与公开社团报名表单一致（存英文键值） */
const DEPARTMENTS = [
  { value: "activity", labelKey: "join.positions.activity" },
  { value: "office", labelKey: "join.positions.office" },
  { value: "liaison", labelKey: "join.positions.liaison" },
  { value: "publicity", labelKey: "join.positions.publicity" },
  { value: "finance", labelKey: "join.positions.finance" },
];

const EMPTY = {
  registrationType: "activity" as RegistrationType,
  activityId: "",
  status: "approved" as RegistrationStatus,
  name: "",
  studentId: "",
  college: "",
  major: "",
  phoneCc: "+86",
  phoneNumber: "",
  email: "",
  position: "",
  introduction: "",
  remark: "",
};

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // 每次打开重置为初始状态
  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setErrors({});
    }
  }, [open]);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = t("join.form.errors.nameRequired");
    if (!form.studentId.trim()) next.studentId = t("join.form.errors.studentIdRequired");
    if (!form.college.trim()) next.college = t("join.form.errors.collegeRequired");
    if (!form.major.trim()) next.major = t("join.form.errors.majorRequired");
    if (!form.phoneCc) next.phoneCc = t("join.form.errors.phoneCcRequired");
    if (!form.phoneNumber.trim()) {
      next.phoneNumber = t("join.form.errors.phoneRequired");
    } else {
      const rule = PHONE_RULES[form.phoneCc];
      const ok = rule
        ? rule.test(form.phoneNumber.replace(/\s/g, ""))
        : /^\d{6,15}$/.test(form.phoneNumber);
      if (!ok) next.phoneNumber = t("join.form.errors.phoneInvalid");
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = t("join.form.errors.emailInvalid");
    }
    if (form.registrationType === "activity" && !form.activityId) {
      next.activityId = t("join.form.errors.activityRequired");
    }
    if (form.registrationType === "club" && !form.position) {
      next.position = t("join.form.errors.positionRequired");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const reg = await createManualRegistration({
        registration_type: form.registrationType,
        activity_id: form.registrationType === "activity" ? Number(form.activityId) : undefined,
        status: form.status,
        name: form.name.trim(),
        student_id: form.studentId.trim(),
        college: form.college.trim(),
        major: form.major.trim(),
        phone_cc: form.phoneCc,
        phone_number: form.phoneNumber.replace(/\s/g, ""),
        email: form.email || undefined,
        position: form.registrationType === "club" ? form.position : undefined,
        introduction: form.introduction || undefined,
        remark: form.remark || undefined,
      });
      alert(t("admin.review.manual.success").replace("{code}", reg.receipt_code));
      onCreated(reg);
      onOpenChange(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("admin.review.manual.error"));
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t("admin.review.manual.title")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t("admin.review.manual.desc")}</p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t("admin.review.manual.type")}</Label>
              <select
                className={selectCls}
                value={form.registrationType}
                onChange={(e) => set("registrationType", e.target.value as RegistrationType)}
              >
                <option value="activity">{t("admin.registrations.typeActivity")}</option>
                <option value="club">{t("admin.registrations.typeClub")}</option>
              </select>
            </div>
            {form.registrationType === "activity" ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("admin.review.manual.activity")}</Label>
                <select
                  className={selectCls}
                  value={form.activityId}
                  onChange={(e) => set("activityId", e.target.value)}
                  aria-invalid={!!errors.activityId}
                >
                  <option value="">{t("admin.registrations.filterActivity")}</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
                {errors.activityId && <p className="text-xs text-destructive">{errors.activityId}</p>}
              </div>
            ) : (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("join.form.position")}</Label>
                <Select value={form.position} onValueChange={(val) => set("position", val)}>
                  <SelectTrigger aria-invalid={!!errors.position}>
                    <SelectValue placeholder={t("join.form.positionPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{t(d.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.position && <p className="text-xs text-destructive">{errors.position}</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("join.form.name")}</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={t("join.form.namePlaceholder")}
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{t("join.form.studentId")}</Label>
              <Input
                value={form.studentId}
                onChange={(e) => set("studentId", e.target.value)}
                placeholder={t("join.form.studentIdPlaceholder")}
                aria-invalid={!!errors.studentId}
              />
              {errors.studentId && <p className="text-xs text-destructive">{errors.studentId}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("join.form.college")}</Label>
              <Input
                value={form.college}
                onChange={(e) => set("college", e.target.value)}
                placeholder={t("join.form.collegePlaceholder")}
                aria-invalid={!!errors.college}
              />
              {errors.college && <p className="text-xs text-destructive">{errors.college}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{t("join.form.major")}</Label>
              <Input
                value={form.major}
                onChange={(e) => set("major", e.target.value)}
                placeholder={t("join.form.majorPlaceholder")}
                aria-invalid={!!errors.major}
              />
              {errors.major && <p className="text-xs text-destructive">{errors.major}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
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
                aria-invalid={!!errors.phoneNumber}
              />
            </div>
            {errors.phoneNumber && <p className="text-xs text-destructive">{errors.phoneNumber}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("join.form.email")}</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder={t("join.form.emailPlaceholder")}
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
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
