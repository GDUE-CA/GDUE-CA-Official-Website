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
import { submitClubApply } from "@/lib/api/clubApply";
import { listSysColleges, listSysMajors } from "@/lib/api/sysData";
import type { SysCollege, SysMajor } from "@/types/api";
import { COUNTRY_OPTIONS, PHONE_RULES } from "./phoneRules";
import { cn } from "@/lib/utils";

const DEPARTMENTS = [
  { value: "activity", labelKey: "join.positions.activity" },
  { value: "office", labelKey: "join.positions.office" },
  { value: "liaison", labelKey: "join.positions.liaison" },
  { value: "publicity", labelKey: "join.positions.publicity" },
  { value: "finance", labelKey: "join.positions.finance" },
];

const STUDENT_ID_RE = /^\d{11}$/;
const CLASS_SUFFIX_RE = /^[A-Z]$/;

export function ClubJoinForm() {
  const { t } = useI18n();
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 通用
  const [realName, setRealName] = useState("");
  const [phoneCc, setPhoneCc] = useState("+86");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [intro, setIntro] = useState("");

  // 本校在读学生必填
  const [studentId, setStudentId] = useState("");
  const [colleges, setColleges] = useState<SysCollege[]>([]);
  const [collegeId, setCollegeId] = useState("");
  const [majors, setMajors] = useState<SysMajor[]>([]);
  const [majorId, setMajorId] = useState("");
  const [enrollYear, setEnrollYear] = useState("");
  const [classSuffix, setClassSuffix] = useState("");
  const [collegesLoaded, setCollegesLoaded] = useState(false);

  // 学院列表（挂载时拉取）
  useEffect(() => {
    if (collegesLoaded) return;
    setCollegesLoaded(true);
    listSysColleges()
      .then(setColleges)
      .catch(() => setColleges([]));
  }, [collegesLoaded]);

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

  function toggleDepartment(value: string) {
    setDepartments((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    // 前端预校验（仅体验提示；后端为最终校验）
    if (!realName.trim()) {
      setSubmitError(t("join.form.errors.nameRequired"));
      return;
    }
    const phone = `${phoneCc} ${phoneNumber.replace(/\s/g, "")}`.trim();
    const rule = PHONE_RULES[phoneCc];
    if (!phoneNumber.trim() || (rule ? !rule.test(phoneNumber.replace(/\s/g, "")) : !/^\d{6,15}$/.test(phoneNumber.replace(/\s/g, "")))) {
      setSubmitError(t("join.form.errors.phoneInvalid"));
      return;
    }
    if (departments.length === 0) {
      setSubmitError(t("join.form.errors.positionRequired"));
      return;
    }
    // 本校在读学生必填校验
    if (!STUDENT_ID_RE.test(studentId.trim())) {
      setSubmitError(t("setting.school.studentIdInvalid"));
      return;
    }
    if (!collegeId || !majorId) {
      setSubmitError(t("join.form.errors.collegeRequired"));
      return;
    }
    if (!/^\d{4}$/.test(enrollYear.trim())) {
      setSubmitError(t("join.form.errors.enrollYearInvalid"));
      return;
    }
    const suffix = classSuffix.trim().toUpperCase();
    if (suffix && !CLASS_SUFFIX_RE.test(suffix)) {
      setSubmitError(t("join.form.errors.classSuffixInvalid"));
      return;
    }

    setSubmitting(true);
    try {
      await submitClubApply({
        real_name: realName.trim(),
        phone,
        email: email.trim() || null,
        applicant_type: "school",
        departments: departments,
        intro: intro.trim() || null,
        student_id: studentId.trim(),
        college_id: Number(collegeId),
        major_id: Number(majorId),
        enroll_year: Number(enrollYear.trim()),
        class_suffix: classSuffix.trim().toUpperCase() || null,
      });
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("join.form.errors.submitError");
      setSubmitError(
        msg === "Not authenticated" || msg.includes("401")
          ? t("join.form.loginRequired")
          : msg
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSubmitted(false);
    setSubmitError(null);
    setRealName("");
    setPhoneNumber("");
    setEmail("");
    setDepartments([]);
    setIntro("");
    setStudentId("");
    setCollegeId("");
    setMajorId("");
    setMajors([]);
    setEnrollYear("");
    setClassSuffix("");
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
              <p className="text-sm text-muted-foreground mb-6">{t("join.form.successDesc")}</p>
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
              className="space-y-5"
              noValidate
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="cj-name">{t("join.form.name")}</Label>
                  <Input
                    id="cj-name"
                    value={realName}
                    onChange={(e) => setRealName(e.target.value)}
                    maxLength={64}
                    placeholder={t("join.form.namePlaceholder")}
                  />
                </div>
                {/* 学号（11 位） */}
                <div className="space-y-2">
                  <Label htmlFor="cj-studentId">{t("join.form.studentId")}</Label>
                  <Input
                    id="cj-studentId"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    inputMode="numeric"
                    maxLength={11}
                    placeholder={t("join.form.studentIdPlaceholder")}
                  />
                </div>
              </div>

              {/* 学院/专业/入学年份/班号后缀 */}
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label>{t("join.form.college")}</Label>
                    <Select value={collegeId} onValueChange={handleCollegeChange}>
                      <SelectTrigger aria-label={t("join.form.college")}>
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
                  </div>
                  <div className="space-y-2">
                    <Label>{t("join.form.major")}</Label>
                    <Select
                      value={majorId}
                      onValueChange={setMajorId}
                      disabled={!collegeId}
                    >
                      <SelectTrigger aria-label={t("join.form.major")}>
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
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="cj-year">{t("join.form.enrollYear")}</Label>
                    <Input
                      id="cj-year"
                      value={enrollYear}
                      onChange={(e) => setEnrollYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="2026"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cj-suffix">{t("join.form.classSuffix")}</Label>
                    <Input
                      id="cj-suffix"
                      value={classSuffix}
                      onChange={(e) => setClassSuffix(e.target.value.toUpperCase().slice(0, 1))}
                      maxLength={1}
                      placeholder="A"
                    />
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

              <div className="space-y-2">
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
                    placeholder={phonePlaceholder}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cj-email">{t("join.form.email")}</Label>
                <Input
                  id="cj-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("join.form.emailPlaceholder")}
                />
              </div>

              {/* 意向部门（多选） */}
              <div className="space-y-2">
                <Label>{t("register.selectPosition")}</Label>
                <div className="flex flex-wrap gap-2">
                  {DEPARTMENTS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDepartment(t(d.labelKey))}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                        departments.includes(t(d.labelKey))
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:bg-muted"
                      )}
                      aria-pressed={departments.includes(t(d.labelKey))}
                    >
                      {t(d.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cj-intro">{t("join.form.introduction")}</Label>
                <Textarea
                  id="cj-intro"
                  rows={4}
                  value={intro}
                  onChange={(e) => setIntro(e.target.value)}
                  maxLength={2000}
                  placeholder={t("join.form.introductionPlaceholder")}
                />
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
