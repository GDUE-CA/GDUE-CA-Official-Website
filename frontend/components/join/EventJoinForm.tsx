"use client";

/**
 * 活动报名表单组件
 * - 用户先选活动，再填写个人信息
 * - 提交至 POST /api/registrations/for/{activityId}
 * - 手机号按所选区号本地规范校验
 */
import { useEffect, useState } from "react";
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
import { listActivities } from "@/lib/api/activities";
import { submitRegistration } from "@/lib/api/register";
import { ReceiptPanel } from "@/components/shared/ReceiptPanel";
import type { Activity } from "@/types/api";
import { COUNTRY_OPTIONS, PHONE_RULES } from "./phoneRules";

export function EventJoinForm() {
  const { t } = useI18n();
  const [submitted, setSubmitted] = useState(false);
  const [receiptCode, setReceiptCode] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    listActivities().then(setActivities).catch(() => setActivities([]));
  }, []);

  const schema = z
    .object({
      activityId: z.string().min(1, t("register.selectEvent")),
      name: z.string().min(1, t("join.form.errors.nameRequired")),
      studentId: z.string().min(1, t("join.form.errors.studentIdRequired")),
      college: z.string().min(1, t("join.form.errors.collegeRequired")),
      major: z.string().min(1, t("join.form.errors.majorRequired")),
      phoneCc: z.string().min(1, t("join.form.errors.phoneCcRequired")),
      phoneNumber: z.string().min(1, t("join.form.errors.phoneRequired")),
      email: z.string().optional(),
      introduction: z.string().min(10, t("join.form.errors.introductionMin")),
    })
    .superRefine((data, ctx) => {
      // phoneNumber 正则按 phoneCc 校验
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
      // email 格式
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
      activityId: "",
      name: "",
      studentId: "",
      college: "",
      major: "",
      phoneCc: "+86",
      phoneNumber: "",
      email: "",
      introduction: "",
    },
  });

  const activityValue = watch("activityId");
  const phoneCcValue = watch("phoneCc");

  /** 表单提交 */
  async function onSubmit(data: FormValues) {
    setSubmitError(null);
    try {
      const resp = await submitRegistration(Number(data.activityId), {
        name: data.name,
        student_id: data.studentId,
        college: data.college,
        major: data.major,
        phone_cc: data.phoneCc,
        phone_number: data.phoneNumber.replace(/\s/g, ""),
        email: data.email || undefined,
        introduction: data.introduction || undefined,
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
        <CardTitle className="text-xl">{t("register.eventTitle")}</CardTitle>
        <CardDescription>{t("register.eventDesc")}</CardDescription>
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
              <div className="space-y-2">
                <Label htmlFor="activityId">{t("register.selectEvent")}</Label>
                <Select
                  value={activityValue}
                  onValueChange={(val) => setValue("activityId", val)}
                >
                  <SelectTrigger id="activityId" aria-invalid={!!errors.activityId}>
                    <SelectValue placeholder={t("register.selectEvent")} />
                  </SelectTrigger>
                  <SelectContent>
                    {activities.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.activityId && (
                  <p className="text-xs text-destructive">{String(errors.activityId.message)}</p>
                )}
              </div>

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
