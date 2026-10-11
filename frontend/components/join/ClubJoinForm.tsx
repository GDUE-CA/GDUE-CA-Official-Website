"use client";

/**
 * 社团报名表单组件
 * - 入会报名，选择意向部门
 * - 提交至 POST /api/registrations/club
 * - 手机号按所选区号本地规范校验
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, Send } from "lucide-react";
import { useI18n } from "@/i18n/provider";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitClubRegistration } from "@/lib/api/register";
import { ReceiptPanel } from "@/components/shared/ReceiptPanel";
import { COUNTRY_OPTIONS, PHONE_RULES } from "./phoneRules";

const DEPARTMENTS = [
  { value: "activity", labelKey: "join.positions.activity" },
  { value: "office", labelKey: "join.positions.office" },
  { value: "liaison", labelKey: "join.positions.liaison" },
  { value: "publicity", labelKey: "join.positions.publicity" },
  { value: "finance", labelKey: "join.positions.finance" },
];

export function ClubJoinForm() {
  const { t } = useI18n();
  const [submitted, setSubmitted] = useState(false);
  const [receiptCode, setReceiptCode] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = z
    .object({
      name: z.string().min(1, t("join.form.errors.nameRequired")),
      studentId: z.string().min(1, t("join.form.errors.studentIdRequired")),
      college: z.string().min(1, t("join.form.errors.collegeRequired")),
      major: z.string().min(1, t("join.form.errors.majorRequired")),
      phoneCc: z.string().min(1, t("join.form.errors.phoneCcRequired")),
      phoneNumber: z.string().min(1, t("join.form.errors.phoneRequired")),
      email: z.string().optional(),
      position: z.string().min(1, t("join.form.errors.positionRequired")),
      introduction: z.string().min(10, t("join.form.errors.introductionMin")),
    })
    .superRefine((data, ctx) => {
      const rule = PHONE_RULES[data.phoneCc];
      const ok = rule
        ? rule.test(data.phoneNumber.replace(/\s/g, ""))
        : /^\d{6,15}$/.test(data.phoneNumber);
      if (!ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phoneNumber"],
          message: t("join.form.errors.phoneInvalid"),
        });
      }
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["email"],
          message: t("join.form.errors.emailInvalid"),
        });
      }
    });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      studentId: "",
      college: "",
      major: "",
      phoneCc: "+86",
      phoneNumber: "",
      email: "",
      position: "",
      introduction: "",
    },
  });

  const phoneCcValue = watch("phoneCc");
  const positionValue = watch("position");

  async function onSubmit(data: FormValues) {
    setSubmitError(null);
    try {
      const resp = await submitClubRegistration({
        name: data.name,
        student_id: data.studentId,
        college: data.college,
        major: data.major,
        phone_cc: data.phoneCc,
        phone_number: data.phoneNumber.replace(/\s/g, ""),
        email: data.email || undefined,
        position: data.position,
        introduction: data.introduction,
      });
      setReceiptCode(resp.receipt_code);
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("join.form.errors.submitError");
      setSubmitError(msg);
    }
  }

  function handleReset() {
    reset();
    setSubmitted(false);
    setReceiptCode(null);
    setSubmitError(null);
  }

  const phonePlaceholder = phoneCcValue === "+86"
    ? "11 位手机号，如 13812345678"
    : phoneCcValue === "+852"
    ? "8 位号码，如 51234567"
    : phoneCcValue === "+44"
    ? "10 位号码，如 7123456789"
    : t("join.form.phoneNumberPlaceholder");

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-xl">{t("register.clubTitle")}</CardTitle>
        <CardDescription>{t("register.clubDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {submitted ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="text-center py-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 text-green-600 mb-4"
              >
                <CheckCircle2 className="h-8 w-8" />
              </motion.div>
              <h3 className="text-lg font-semibold mb-2">{t("join.form.success")}</h3>
              <p className="text-sm text-muted-foreground mb-5">{t("join.form.successDesc")}</p>
              {receiptCode && (
                <div className="mb-6 flex justify-center">
                  <ReceiptPanel receiptCode={receiptCode} />
                </div>
              )}
              <Button onClick={handleReset} variant="outline">
                {t("join.form.submitAnother")}
              </Button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-5"
              noValidate
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("join.form.name")}</Label>
                  <Input id="name" placeholder={t("join.form.namePlaceholder")}
                    aria-invalid={!!errors.name} {...register("name")} />
                  {errors.name && <p className="text-xs text-destructive">{String(errors.name.message)}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studentId">{t("join.form.studentId")}</Label>
                  <Input id="studentId" placeholder={t("join.form.studentIdPlaceholder")}
                    aria-invalid={!!errors.studentId} {...register("studentId")} />
                  {errors.studentId && <p className="text-xs text-destructive">{String(errors.studentId.message)}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="college">{t("join.form.college")}</Label>
                  <Input id="college" placeholder={t("join.form.collegePlaceholder")}
                    aria-invalid={!!errors.college} {...register("college")} />
                  {errors.college && <p className="text-xs text-destructive">{String(errors.college.message)}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="major">{t("join.form.major")}</Label>
                  <Input id="major" placeholder={t("join.form.majorPlaceholder")}
                    aria-invalid={!!errors.major} {...register("major")} />
                  {errors.major && <p className="text-xs text-destructive">{String(errors.major.message)}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber">{t("join.form.phoneNumber")}</Label>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <Select value={phoneCcValue} onValueChange={(val) => setValue("phoneCc", val)}>
                    <SelectTrigger id="phoneCc" aria-label={t("join.form.phoneCc")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="phoneNumber" inputMode="tel" placeholder={phonePlaceholder}
                    aria-invalid={!!errors.phoneNumber} {...register("phoneNumber")}
                  />
                </div>
                {errors.phoneNumber && <p className="text-xs text-destructive">{String(errors.phoneNumber.message)}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t("join.form.email")}</Label>
                <Input id="email" type="email" placeholder={t("join.form.emailPlaceholder")}
                  aria-invalid={!!errors.email} {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{String(errors.email.message)}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="position">{t("register.selectPosition")}</Label>
                <Select value={positionValue} onValueChange={(val) => setValue("position", val)}>
                  <SelectTrigger id="position" aria-invalid={!!errors.position}>
                    <SelectValue placeholder={t("join.form.positionPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{t(d.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.position && <p className="text-xs text-destructive">{String(errors.position.message)}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="introduction">{t("join.form.introduction")}</Label>
                <Textarea id="introduction" rows={4}
                  placeholder={t("join.form.introductionPlaceholder")}
                  aria-invalid={!!errors.introduction} {...register("introduction")} />
                {errors.introduction && <p className="text-xs text-destructive">{String(errors.introduction.message)}</p>}
              </div>

              {submitError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{submitError}</p>
              )}

              <Button type="submit" disabled={isSubmitting} className="w-full" size="lg">
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />{t("join.form.submitting")}</>
                ) : (
                  <><Send className="h-4 w-4" />{t("join.form.submit")}</>
                )}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
