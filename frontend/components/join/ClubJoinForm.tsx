"use client";

/**
 * 社团报名表单组件（Module D-2 重写）
 *
 * - 报名主体仅限本校在读学生（校外社会报名通道已移除）
 * - 学院/专业下拉（数据全部来自 /api/sys/* 公开接口，禁止硬编码）、
 *   入学年份 4 位数字、班号后缀 A-Z（允许空）、学号 11 位前端预校验
 * - 完整班级字符串由后端拼接 {入学年份后两位}{专业}{班号后缀}，前端仅只读预览
 * - 宽松校验：仅校验学院/专业 ID，不校验年级班级是否存在于 sys_class（兼容新生）
 * - 重要隔离：报名 ≠ 学校身份验证，不会自动开启 identity_school_verified
 * - 提交至 POST /api/club-apply（需登录；限流 10 次/10 分钟）
 */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import Send from "@/assets/icons/action/send.svg";
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
import { submitClubApply, sendClubApplyGuestCode, submitClubApplyGuest, listClubDepartments } from "@/lib/api/clubApply";
import { fetchMe } from "@/lib/api/auth";
import { ReceiptPanel } from "@/components/shared/ReceiptPanel";
import { ApiError } from "@/lib/api/client";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";
import { BizCode } from "@/types/response";
import { listSysColleges, listSysMajors } from "@/lib/api/sysData";
import type { SysCollege, SysMajor } from "@/types/api";
import { COUNTRY_OPTIONS, PHONE_RULES } from "./phoneRules";
import { cn } from "@/lib/utils";

/** 意向部门选项：从 /api/club-apply/departments 动态加载（V0.6.0 Issue6）；
 *  接口失败时回落到与后端 seed 一致的内置列表兜底 */
const FALLBACK_DEPARTMENTS = [
  { id: -1, name_zh: "活动部", name_en: "Events Department" },
  { id: -2, name_zh: "办公部", name_en: "Office" },
  { id: -3, name_zh: "联络部", name_en: "Liaison Department" },
  { id: -4, name_zh: "宣传部", name_en: "Publicity Department" },
  { id: -5, name_zh: "财务部", name_en: "Finance Department" },
];

const STUDENT_ID_RE = /^\d{11}$/;
const CLASS_SUFFIX_RE = /^[A-Z]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 访客验证码重发冷却（秒）：与后端同邮箱重发间隔对齐 */
const RESEND_COOLDOWN_SECONDS = 60;

/** 后端 ClubApplyIn 字段名（data-field 对位用；前端预校验与后端错误共用） */
type ClubField =
  | "real_name" | "student_id" | "college_id" | "major_id" | "enroll_year"
  | "class_suffix" | "phone" | "email" | "departments" | "intro";

export function ClubJoinForm() {
  const { t, locale } = useI18n();
  const [submitted, setSubmitted] = useState(false);
  const [receiptCode, setReceiptCode] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fieldErrors = useServerFieldErrors<ClubField>({
    fallback: t("join.form.errors.submitError"),
  });
  const fe = fieldErrors.errors;

  // 通用
  const [realName, setRealName] = useState("");
  const [phoneCc, setPhoneCc] = useState("+86");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  // 意向部门：选中选项 id（提交时解析为当前 locale 显示名，与历史文本快照语义一致）
  const [deptOptions, setDeptOptions] = useState<{ id: number; label: string }[]>([]);
  const [deptIds, setDeptIds] = useState<number[]>([]);
  const [intro, setIntro] = useState("");

  // 本校在读学生必填
  const [studentId, setStudentId] = useState("");
  const [colleges, setColleges] = useState<SysCollege[]>([]);
  const [collegeId, setCollegeId] = useState("");
  const [majors, setMajors] = useState<SysMajor[]>([]);
  const [majorId, setMajorId] = useState("");
  const [enrollYear, setEnrollYear] = useState("");
  const [classSuffix, setClassSuffix] = useState("");

  // 登录态：null = 检测中；false = 访客（免注册邮箱验证报名）
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  // 访客邮箱验证区块
  const [guestEmail, setGuestEmail] = useState("");
  const [guestCode, setGuestCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeTip, setCodeTip] = useState<string | null>(null);
  const [guestBlockError, setGuestBlockError] = useState<string | null>(null);

  // 挂载时检测登录态（fetchMe 成功即已登录；失败视为访客）
  useEffect(() => {
    let alive = true;
    fetchMe()
      .then(() => { if (alive) setLoggedIn(true); })
      .catch(() => { if (alive) setLoggedIn(false); });
    return () => { alive = false; };
  }, []);

  // 访客验证码冷却倒计时
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /** 访客：发送邮箱验证码（ok:false 时展示 message，不进入倒计时） */
  async function handleSendGuestCode() {
    const addr = guestEmail.trim();
    if (!addr || !EMAIL_RE.test(addr)) {
      setGuestBlockError(t("join.guest.emailInvalid"));
      return;
    }
    setSendingCode(true);
    setGuestBlockError(null);
    try {
      const res = await sendClubApplyGuestCode(addr);
      if (!res.ok) {
        setGuestBlockError(res.message || t("join.guest.sendFailed"));
        return;
      }
      setCodeSent(true);
      setCodeTip(res.message || t("join.guest.codeSentTip"));
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setGuestBlockError(err instanceof Error ? err.message : t("join.guest.sendFailed"));
    } finally {
      setSendingCode(false);
    }
  }

  /** 更换邮箱后验证码状态重置 */
  function handleGuestEmailChange(v: string) {
    setGuestEmail(v);
    setGuestBlockError(null);
    if (codeSent) {
      setCodeSent(false);
      setGuestCode("");
      setCodeTip(null);
      setCooldown(0);
    }
  }

  // 学院列表（挂载时拉取一次；卸载后丢弃过期结果）
  useEffect(() => {
    let alive = true;
    listSysColleges()
      .then((list) => { if (alive) setColleges(list); })
      .catch(() => { if (alive) setColleges([]); });
    return () => { alive = false; };
  }, []);

  // 意向部门选项（V0.6.0 Issue6 动态加载；失败回落内置列表）；zh 系语言用中文名，其余用英文名
  const isZhLocale = locale.startsWith("zh");
  useEffect(() => {
    let alive = true;
    const mapOpts = (list: { id: number; name_zh: string; name_en: string }[]) =>
      list.map((d) => ({ id: d.id, label: isZhLocale ? d.name_zh : d.name_en }));
    listClubDepartments()
      .then((res) => { if (alive) setDeptOptions(mapOpts(res.departments)); })
      .catch(() => { if (alive) setDeptOptions(mapOpts(FALLBACK_DEPARTMENTS)); });
    return () => { alive = false; };
  }, [isZhLocale]);

  // 专业联动
  function handleCollegeChange(v: string) {
    setCollegeId(v);
    setMajorId("");
    setMajors([]);
    if (v) {
      listSysMajors(Number(v))
        .then(setMajors)
        .catch(() => setMajors([]));
    }
  }

  /** 班级只读预览：{入学年份后两位}{专业}{班号后缀}（与后端拼接规则一致） */
  const classPreview = useMemo(() => {
    const y = enrollYear.trim();
    if (!/^\d{4}$/.test(y)) return "";
    const majorName = majors.find((m) => String(m.id) === majorId)?.major_name ?? "";
    return `${y.slice(2)}${majorName}${classSuffix.toUpperCase()}`;
  }, [enrollYear, majorId, majors, classSuffix]);

  function toggleDepartment(id: number) {
    setDeptIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
    fieldErrors.clear("departments");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    fieldErrors.clear();

    // 选中意向部门解析为显示名（提交文本快照，与历史记录语义一致）
    const selectedDepartments = deptIds
      .map((id) => deptOptions.find((o) => o.id === id)?.label)
      .filter((v): v is string => Boolean(v));

    // 前端预校验（仅体验提示；后端为最终校验）：一次收集全部错误，行内展示
    const digits = phoneNumber.replace(/\s/g, "");
    const phone = `${phoneCc} ${digits}`.trim();
    const rule = PHONE_RULES[phoneCc];
    const suffix = classSuffix.trim().toUpperCase();
    const localErrors: Partial<Record<ClubField, string>> = {};
    if (!realName.trim()) localErrors.real_name = t("join.form.errors.nameRequired");
    if (!STUDENT_ID_RE.test(studentId.trim())) {
      localErrors.student_id = t("setting.school.studentIdInvalid");
    }
    if (!collegeId) localErrors.college_id = t("join.form.errors.collegeRequired");
    if (!majorId) localErrors.major_id = t("join.form.errors.majorRequired");
    if (!/^\d{4}$/.test(enrollYear.trim())) {
      localErrors.enroll_year = t("join.form.errors.enrollYearInvalid");
    }
    if (suffix && !CLASS_SUFFIX_RE.test(suffix)) {
      localErrors.class_suffix = t("join.form.errors.classSuffixInvalid");
    }
    if (!digits || (rule ? !rule.test(digits) : !/^\d{6,15}$/.test(digits))) {
      localErrors.phone = t("join.form.errors.phoneInvalid");
    }
    if (selectedDepartments.length === 0) {
      localErrors.departments = t("join.form.errors.positionRequired");
    }
    // 访客：邮箱 + 验证码前端预校验（行内标到访客区块的 email 字段）
    if (!loggedIn) {
      if (!guestEmail.trim() || !EMAIL_RE.test(guestEmail.trim())) {
        localErrors.email = t("join.guest.emailInvalid");
      }
    }
    if (fieldErrors.set(localErrors)) return;
    if (!loggedIn) {
      if (!codeSent) {
        setGuestBlockError(t("join.guest.sendCodeFirst"));
        return;
      }
      if (!/^\d{6}$/.test(guestCode.trim())) {
        setGuestBlockError(t("join.guest.codeRequired"));
        return;
      }
    }

    setSubmitting(true);
    try {
      const receipt = loggedIn
        ? await submitClubApply({
            real_name: realName.trim(),
            phone,
            email: email.trim() || null,
            applicant_type: "school",
            departments: selectedDepartments,
            intro: intro.trim() || null,
            student_id: studentId.trim(),
            college_id: Number(collegeId),
            major_id: Number(majorId),
            enroll_year: Number(enrollYear.trim()),
            class_suffix: classSuffix.trim().toUpperCase() || null,
          })
        : await submitClubApplyGuest({
            email: guestEmail.trim(),
            code: guestCode.trim(),
            real_name: realName.trim(),
            phone,
            departments: selectedDepartments,
            intro: intro.trim() || null,
            student_id: studentId.trim(),
            college_id: Number(collegeId),
            major_id: Number(majorId),
            enroll_year: Number(enrollYear.trim()),
            class_suffix: classSuffix.trim().toUpperCase() || null,
          });
      setReceiptCode(receipt.receipt_code);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === BizCode.Unauthorized) {
        setSubmitError(t("join.form.loginRequired"));
      } else {
        // 字段级错误标到对应输入框，其余进横幅（访客 409/400 亦走此）
        setSubmitError(fieldErrors.capture(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSubmitted(false);
    setReceiptCode(null);
    setSubmitError(null);
    fieldErrors.clear();
    setRealName("");
    setPhoneNumber("");
    setEmail("");
    setDeptIds([]);
    setIntro("");
    setStudentId("");
    setCollegeId("");
    setMajorId("");
    setMajors([]);
    setEnrollYear("");
    setClassSuffix("");
    setGuestEmail("");
    setGuestCode("");
    setCodeSent(false);
    setCooldown(0);
    setCodeTip(null);
    setGuestBlockError(null);
  }

  const phonePlaceholder = phoneCc === "+86"
    ? "11 位手机号，如 13812345678"
    : phoneCc === "+852"
    ? "8 位号码，如 51234567"
    : phoneCc === "+44"
    ? "10 位号码，如 7123456789"
    : t("join.form.phoneNumberPlaceholder");

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-xl">{t("register.clubTitle")}</CardTitle>
        <CardDescription>{t("register.clubDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loggedIn === null ? (
          // 登录态检测中：避免访客区块闪现
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
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
              onSubmit={handleSubmit}
              {...fieldErrors.rootProps}
              className="space-y-5"
              noValidate
            >
              {/* 访客邮箱验证区块（免注册报名）：已登录时不渲染 */}
              {!loggedIn && (
                <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold">{t("join.guest.sectionTitle")}</h4>
                    <p className="text-xs text-muted-foreground">{t("join.guest.hint")}</p>
                  </div>
                  <div className="space-y-2" data-field="email">
                    <Label htmlFor="cj-guest-email">{t("join.guest.email")}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="cj-guest-email"
                        type="email"
                        autoComplete="email"
                        value={guestEmail}
                        onChange={(e) => handleGuestEmailChange(e.target.value)}
                        aria-invalid={!!fe.email}
                        placeholder={t("join.guest.emailPlaceholder")}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        disabled={sendingCode || cooldown > 0}
                        onClick={handleSendGuestCode}
                      >
                        {sendingCode ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : cooldown > 0 ? (
                          t("join.guest.resendIn", { seconds: cooldown })
                        ) : codeSent ? (
                          t("join.guest.resend")
                        ) : (
                          t("join.guest.sendCode")
                        )}
                      </Button>
                    </div>
                    <FieldError>{fe.email}</FieldError>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cj-guest-code">{t("join.guest.code")}</Label>
                    <Input
                      id="cj-guest-code"
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                      value={guestCode}
                      onChange={(e) => {
                        setGuestCode(e.target.value.replace(/\D/g, ""));
                        setGuestBlockError(null);
                      }}
                      placeholder={t("join.guest.codePlaceholder")}
                    />
                    <p className="text-xs text-muted-foreground">{t("join.guest.codeHint")}</p>
                  </div>
                  {codeTip && (
                    <p className="text-sm text-muted-foreground bg-muted/60 px-3 py-2 rounded-md">
                      {codeTip}
                    </p>
                  )}
                  {guestBlockError && (
                    <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                      {guestBlockError}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2" data-field="real_name">
                  <Label htmlFor="cj-name">{t("join.form.name")}</Label>
                  <Input
                    id="cj-name"
                    value={realName}
                    onChange={(e) => setRealName(e.target.value)}
                    maxLength={64}
                    aria-invalid={!!fe.real_name}
                    placeholder={t("join.form.namePlaceholder")}
                  />
                  <FieldError>{fe.real_name}</FieldError>
                </div>
                {/* 学号（11 位） */}
                <div className="space-y-2" data-field="student_id">
                  <Label htmlFor="cj-studentId">{t("join.form.studentId")}</Label>
                  <Input
                    id="cj-studentId"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    inputMode="numeric"
                    maxLength={11}
                    aria-invalid={!!fe.student_id}
                    placeholder={t("join.form.studentIdPlaceholder")}
                  />
                  <FieldError>{fe.student_id}</FieldError>
                </div>
              </div>

              {/* 学院/专业/入学年份/班号后缀 */}
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2" data-field="college_id">
                    <Label htmlFor="cj-college">{t("join.form.college")}</Label>
                    <Select
                      value={collegeId}
                      onValueChange={(v) => { handleCollegeChange(v); fieldErrors.clear("college_id"); }}
                    >
                      <SelectTrigger id="cj-college" aria-label={t("join.form.college")} aria-invalid={!!fe.college_id}>
                        <SelectValue placeholder={t("join.form.collegePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {colleges.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.college_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError>{fe.college_id}</FieldError>
                  </div>
                  <div className="space-y-2" data-field="major_id">
                    <Label htmlFor="cj-major">{t("join.form.major")}</Label>
                    <Select
                      value={majorId}
                      onValueChange={(v) => { setMajorId(v); fieldErrors.clear("major_id"); }}
                      disabled={!collegeId}
                    >
                      <SelectTrigger id="cj-major" aria-label={t("join.form.major")} aria-invalid={!!fe.major_id}>
                        <SelectValue
                          placeholder={
                            collegeId ? t("join.form.majorPlaceholder") : t("setting.school.majorSelectCollegeFirst")
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {majors.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.major_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError>{fe.major_id}</FieldError>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2" data-field="enroll_year">
                    <Label htmlFor="cj-year">{t("join.form.enrollYear")}</Label>
                    <Input
                      id="cj-year"
                      value={enrollYear}
                      onChange={(e) => setEnrollYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      inputMode="numeric"
                      maxLength={4}
                      aria-invalid={!!fe.enroll_year}
                      placeholder="2026"
                    />
                    <FieldError>{fe.enroll_year}</FieldError>
                  </div>
                  <div className="space-y-2" data-field="class_suffix">
                    <Label htmlFor="cj-suffix">{t("join.form.classSuffix")}</Label>
                    <Input
                      id="cj-suffix"
                      value={classSuffix}
                      onChange={(e) => setClassSuffix(e.target.value.toUpperCase().slice(0, 1))}
                      maxLength={1}
                      aria-invalid={!!fe.class_suffix}
                      placeholder="A"
                    />
                    <FieldError>{fe.class_suffix}</FieldError>
                  </div>
                </div>
                {/* 班级只读预览（后端拼接生成，用户不可直接编辑） */}
                {classPreview && (
                  <div className="rounded-md bg-muted/40 px-3 py-2.5 text-sm">
                    <span className="text-muted-foreground">{t("join.form.classPreview")}：</span>
                    <span className="font-medium">{classPreview}</span>
                  </div>
                )}
              </>

              <div className="space-y-2" data-field="phone">
                <Label htmlFor="cj-phone">{t("join.form.phoneNumber")}</Label>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <Select value={phoneCc} onValueChange={setPhoneCc}>
                    <SelectTrigger id="cj-phoneCc" aria-label={t("join.form.phoneCc")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="cj-phone"
                    inputMode="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    aria-invalid={!!fe.phone}
                    placeholder={phonePlaceholder}
                  />
                </div>
                <FieldError>{fe.phone}</FieldError>
              </div>

              {/* 选填邮箱仅登录用户可见；访客的邮箱在顶部验证区块 */}
              {loggedIn && (
                <div className="space-y-2" data-field="email">
                  <Label htmlFor="cj-email">{t("join.form.email")}</Label>
                  <Input
                    id="cj-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={!!fe.email}
                    placeholder={t("join.form.emailPlaceholder")}
                  />
                  <FieldError>{fe.email}</FieldError>
                </div>
              )}

              {/* 意向部门（多选，V0.6.0 Issue6 动态选项） */}
              <div className="space-y-2" data-field="departments">
                <Label>{t("register.selectPosition")}</Label>
                <div className="flex flex-wrap gap-2">
                  {deptOptions.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDepartment(d.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                        deptIds.includes(d.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:bg-muted"
                      )}
                      aria-pressed={deptIds.includes(d.id)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <FieldError>{fe.departments}</FieldError>
              </div>

              <div className="space-y-2" data-field="intro">
                <Label htmlFor="cj-intro">{t("join.form.introduction")}</Label>
                <Textarea
                  id="cj-intro"
                  rows={4}
                  value={intro}
                  onChange={(e) => setIntro(e.target.value)}
                  maxLength={2000}
                  aria-invalid={!!fe.intro}
                  placeholder={t("join.form.introductionPlaceholder")}
                />
                <FieldError>{fe.intro}</FieldError>
              </div>

              {submitError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {submitError}
                </p>
              )}

              <Button type="submit" disabled={submitting} className="w-full" size="lg">
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />{t("join.form.submitting")}</>
                ) : (
                  <><Send className="h-4 w-4" />{loggedIn ? t("join.form.submit") : t("join.guest.submit")}</>
                )}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
        )}
      </CardContent>
    </Card>
  );
}
