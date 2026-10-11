"use client";

/**
 * BugForm - Bug 反馈提交表单组件
 * - 字段：标题/描述（合并为 description）、联系方式（邮箱或手机号，二选一）、页面 URL（extra）
 * - 提交至后端 POST /api/bugs（公开接口，无需登录）
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
import { submitBugReport } from "@/lib/api/bugReport";
import { ReceiptPanel } from "@/components/shared/ReceiptPanel";

export function BugForm() {
  const { t } = useI18n();
  const [submitted, setSubmitted] = useState(false);
  const [receiptCode, setReceiptCode] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 联系方式可以是邮箱或手机号
  const schema = z.object({
    title: z.string().min(3, t("bug.form.errors.titleMin")),
    description: z.string().min(10, t("bug.form.errors.descriptionMin")),
    contact: z
      .string()
      .optional()
      .refine(
        (val) =>
          !val ||
          /^1[3-9]\d{9}$/.test(val) ||
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
        t("bug.form.errors.contactInvalid")
      ),
    url: z.string().optional(),
  });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      contact: "",
      url: "",
    },
  });

  /** 表单提交：发送至后端 /api/bugs */
  async function onSubmit(data: FormValues) {
    setSubmitError(null);
    // 拼合标题+描述，后端只有 description 字段
    const fullDescription = `${data.title}\n\n${data.description}`;
    // 判断 contact 是邮箱还是手机号
    const isEmail = data.contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact);
    try {
      const resp = await submitBugReport({
        description: fullDescription,
        contact_email: isEmail ? data.contact : undefined,
        contact_phone: !isEmail && data.contact ? data.contact : undefined,
        extra: data.url || undefined,
      });
      setReceiptCode(resp.receipt_code);
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("bug.form.errors.submitError");
      setSubmitError(msg);
    }
  }

  function handleReset() {
    reset();
    setSubmitted(false);
    setReceiptCode(null);
    setSubmitError(null);
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-xl">{t("bug.form.title")}</CardTitle>
        <CardDescription>{t("bug.subtitle")}</CardDescription>
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
              <h3 className="text-lg font-semibold mb-2">
                {t("bug.form.success")}
              </h3>
              <p className="text-sm text-muted-foreground mb-5">
                {t("bug.form.successDesc")}
              </p>
              {receiptCode && (
                <div className="mb-6 flex justify-center">
                  <ReceiptPanel receiptCode={receiptCode} />
                </div>
              )}
              <Button onClick={handleReset} variant="outline">
                {t("bug.form.submitAnother")}
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
              {/* 标题 */}
              <div className="space-y-2">
                <Label htmlFor="title">{t("bug.form.titleLabel")}</Label>
                <Input
                  id="title"
                  placeholder={t("bug.form.titlePlaceholder")}
                  aria-invalid={!!errors.title}
                  {...register("title")}
                />
                {errors.title && (
                  <p className="text-xs text-destructive">
                    {errors.title.message}
                  </p>
                )}
              </div>

              {/* 详细描述 */}
              <div className="space-y-2">
                <Label htmlFor="description">{t("bug.form.descriptionLabel")}</Label>
                <Textarea
                  id="description"
                  rows={5}
                  placeholder={t("bug.form.descriptionPlaceholder")}
                  aria-invalid={!!errors.description}
                  {...register("description")}
                />
                {errors.description && (
                  <p className="text-xs text-destructive">
                    {errors.description.message}
                  </p>
                )}
              </div>

              {/* 联系方式（可选） */}
              <div className="space-y-2">
                <Label htmlFor="contact">{t("bug.form.contactLabel")}</Label>
                <Input
                  id="contact"
                  placeholder={t("bug.form.contactPlaceholder")}
                  aria-invalid={!!errors.contact}
                  {...register("contact")}
                />
                {errors.contact && (
                  <p className="text-xs text-destructive">
                    {errors.contact.message}
                  </p>
                )}
              </div>

              {/* 页面 URL（可选） */}
              <div className="space-y-2">
                <Label htmlFor="url">{t("bug.form.urlLabel")}</Label>
                <Input
                  id="url"
                  placeholder={t("bug.form.urlPlaceholder")}
                  {...register("url")}
                />
              </div>

              {submitError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {submitError}
                </p>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full"
                size="lg"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("bug.form.submitting")}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {t("bug.form.submit")}
                  </>
                )}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
