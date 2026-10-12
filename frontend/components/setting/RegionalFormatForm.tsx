"use client";

/**
 * RegionalFormatForm —— Tab-3 区域格式
 *
 * 对标微软账号 / Apple ID 的区域格式设置：
 * - 主日历 / 第二附加日历 / 一周起始日 / 短日期 / 长日期 / 短时间 / 长时间 / 默认货币
 * - 所有配置仅控制前端展示渲染层；后端、数据库永远存 UTC + ISO8601
 * - 修改选项立刻刷新预览（保存前即可预览效果）
 * - 底部统一【保存更改】按钮一次性提交 PUT /api/auth/profile
 * - 【重置为匹配地区默认值】根据当前 country_code 一键填充对应地区原生格式
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDirtyGuard } from "@/components/setting/SettingGuardContext";
import { fetchProfile, updateProfile } from "@/lib/api/auth";
import type { AdminUser } from "@/types/api";
import { cn } from "@/lib/utils";

const PAGE_KEY = "regional-format";

// ---- 预设选项 ----

const PRIMARY_CALENDAR_OPTIONS = [
  { value: "gregorian", zh: "公历（格里高利历）", en: "Gregorian" },
  { value: "chinese", zh: "农历（中国）", en: "Chinese" },
  { value: "japanese", zh: "和历（日本）", en: "Japanese" },
  { value: "buddhist", zh: "佛历（泰国）", en: "Buddhist" },
] as const;

const SECONDARY_CALENDAR_OPTIONS = [
  { value: "", zh: "关闭（无附加日历）", en: "None" },
  { value: "chinese", zh: "农历", en: "Chinese" },
  { value: "japanese", zh: "和历", en: "Japanese" },
  { value: "buddhist", zh: "佛历", en: "Buddhist" },
] as const;

const WEEK_FIRST_DAY_OPTIONS = [
  { value: "sunday", zh: "周日", en: "Sunday" },
  { value: "monday", zh: "周一", en: "Monday" },
  { value: "tuesday", zh: "周二", en: "Tuesday" },
] as const;

const DATE_SHORT_OPTIONS = [
  "YYYY-MM-DD",
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "YYYY/MM/DD",
  "DD.MM.YYYY",
] as const;

const DATE_LONG_OPTIONS = [
  "YYYY年M月D日",
  "D MMMM YYYY",
  "MMMM D, YYYY",
  "D MMM YYYY",
] as const;

const TIME_SHORT_OPTIONS = [
  "HH:mm",
  "H:mm",
  "h:mm A",
  "hh:mm A",
] as const;

const TIME_LONG_OPTIONS = [
  "HH:mm:ss",
  "H:mm:ss",
  "h:mm:ss A",
] as const;

const CURRENCY_OPTIONS = [
  { value: "CNY", zh: "人民币 ¥", en: "CNY ¥" },
  { value: "USD", zh: "美元 $", en: "USD $" },
  { value: "EUR", zh: "欧元 €", en: "EUR €" },
  { value: "GBP", zh: "英镑 £", en: "GBP £" },
  { value: "JPY", zh: "日元 ¥", en: "JPY ¥" },
] as const;

/** 地区默认格式映射（根据国家代码一键填充） */
const REGION_DEFAULTS: Record<string, {
  primary_calendar: string;
  secondary_calendar: string | null;
  week_first_day: string;
  date_short_pattern: string;
  date_long_pattern: string;
  time_short_pattern: string;
  time_long_pattern: string;
  currency: string;
}> = {
  CN: {
    primary_calendar: "gregorian",
    secondary_calendar: "chinese",
    week_first_day: "monday",
    date_short_pattern: "YYYY-MM-DD",
    date_long_pattern: "YYYY年M月D日",
    time_short_pattern: "HH:mm",
    time_long_pattern: "HH:mm:ss",
    currency: "CNY",
  },
  HK: {
    primary_calendar: "gregorian",
    secondary_calendar: null,
    week_first_day: "sunday",
    date_short_pattern: "DD/MM/YYYY",
    date_long_pattern: "D MMMM YYYY",
    time_short_pattern: "h:mm A",
    time_long_pattern: "h:mm:ss A",
    currency: "HKD",
  },
  MO: {
    primary_calendar: "gregorian",
    secondary_calendar: null,
    week_first_day: "sunday",
    date_short_pattern: "DD/MM/YYYY",
    date_long_pattern: "D MMMM YYYY",
    time_short_pattern: "h:mm A",
    time_long_pattern: "h:mm:ss A",
    currency: "MOP",
  },
  TW: {
    primary_calendar: "gregorian",
    secondary_calendar: null,
    week_first_day: "sunday",
    date_short_pattern: "YYYY/MM/DD",
    date_long_pattern: "YYYY年M月D日",
    time_short_pattern: "HH:mm",
    time_long_pattern: "HH:mm:ss",
    currency: "TWD",
  },
  US: {
    primary_calendar: "gregorian",
    secondary_calendar: null,
    week_first_day: "sunday",
    date_short_pattern: "MM/DD/YYYY",
    date_long_pattern: "MMMM D, YYYY",
    time_short_pattern: "h:mm A",
    time_long_pattern: "h:mm:ss A",
    currency: "USD",
  },
  GB: {
    primary_calendar: "gregorian",
    secondary_calendar: null,
    week_first_day: "monday",
    date_short_pattern: "DD/MM/YYYY",
    date_long_pattern: "D MMMM YYYY",
    time_short_pattern: "HH:mm",
    time_long_pattern: "HH:mm:ss",
    currency: "GBP",
  },
  JP: {
    primary_calendar: "gregorian",
    secondary_calendar: "japanese",
    week_first_day: "sunday",
    date_short_pattern: "YYYY/MM/DD",
    date_long_pattern: "YYYY年M月D日",
    time_short_pattern: "HH:mm",
    time_long_pattern: "HH:mm:ss",
    currency: "JPY",
  },
};

/** 生成实时预览样例 */
function makePreview(pattern: string, type: "date-short" | "date-long" | "time-short" | "time-long"): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const hh = now.getHours();
  const mm = now.getMinutes();
  const ss = now.getSeconds();

  const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MONTHS_EN_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  if (type === "date-short") {
    return pattern
      .replace("YYYY", String(y))
      .replace("MM", String(m).padStart(2, "0"))
      .replace("DD", String(d).padStart(2, "0"));
  }
  if (type === "date-long") {
    if (pattern.includes("MMMM")) {
      return pattern
        .replace("MMMM", MONTHS_EN[m - 1])
        .replace("D", String(d))
        .replace("YYYY", String(y));
    }
    return pattern
      .replace("YYYY", String(y))
      .replace("M月", String(m))
      .replace("D日", String(d));
  }
  if (type === "time-short") {
    if (pattern.includes("A")) {
      const ampm = hh >= 12 ? "PM" : "AM";
      const h12 = hh % 12 || 12;
      return pattern
        .replace("hh", String(h12).padStart(2, "0"))
        .replace("h", String(h12))
        .replace("mm", String(mm).padStart(2, "0"))
        .replace("A", ampm);
    }
    return pattern
      .replace("HH", String(hh).padStart(2, "0"))
      .replace("H", String(hh))
      .replace("mm", String(mm).padStart(2, "0"));
  }
  if (type === "time-long") {
    if (pattern.includes("A")) {
      const ampm = hh >= 12 ? "PM" : "AM";
      const h12 = hh % 12 || 12;
      return pattern
        .replace("hh", String(h12).padStart(2, "0"))
        .replace("h", String(h12))
        .replace("mm", String(mm).padStart(2, "0"))
        .replace("ss", String(ss).padStart(2, "0"))
        .replace("A", ampm);
    }
    return pattern
      .replace("HH", String(hh).padStart(2, "0"))
      .replace("H", String(hh))
      .replace("mm", String(mm).padStart(2, "0"))
      .replace("ss", String(ss).padStart(2, "0"));
  }
  return pattern;
}

/** 原生 <select> 包装组件（适配 iOS/Android/Windows 原生选择器） */
function NativeSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; zh: string; en: string }[];
  placeholder?: string;
}) {
  const { locale } = useI18n();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {locale.startsWith("zh") ? o.zh : o.en}
        </option>
      ))}
    </select>
  );
}

export function RegionalFormatForm() {
  const { t } = useI18n();
  const { registerDirty } = useDirtyGuard();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [profile, setProfile] = useState<AdminUser | null>(null);

  // 表单字段
  const [primaryCalendar, setPrimaryCalendar] = useState("gregorian");
  const [secondaryCalendar, setSecondaryCalendar] = useState("");
  const [weekFirstDay, setWeekFirstDay] = useState("monday");
  const [dateShort, setDateShort] = useState("YYYY-MM-DD");
  const [dateLong, setDateLong] = useState("YYYY年M月D日");
  const [timeShort, setTimeShort] = useState("HH:mm");
  const [timeLong, setTimeLong] = useState("HH:mm:ss");
  const [defaultCurrency, setDefaultCurrency] = useState("CNY");

  // dirty 追踪
  const initialRef = useRef("");
  const dirty = useMemo(() => {
    const current = JSON.stringify({
      pc: primaryCalendar,
      sc: secondaryCalendar,
      wf: weekFirstDay,
      ds: dateShort,
      dl: dateLong,
      ts: timeShort,
      tl: timeLong,
      dc: defaultCurrency,
    });
    return current !== initialRef.current;
  }, [primaryCalendar, secondaryCalendar, weekFirstDay, dateShort, dateLong, timeShort, timeLong, defaultCurrency]);

  useEffect(() => {
    registerDirty(PAGE_KEY, dirty);
  }, [dirty, registerDirty]);

  useEffect(() => {
    fetchProfile()
      .then((p) => {
        setProfile(p);
        setPrimaryCalendar(p.primary_calendar ?? "gregorian");
        setSecondaryCalendar(p.secondary_calendar ?? "");
        setWeekFirstDay(p.week_first_day ?? "monday");
        setDateShort(p.date_short_pattern ?? "YYYY-MM-DD");
        setDateLong(p.date_long_pattern ?? "YYYY年M月D日");
        setTimeShort(p.time_short_pattern ?? "HH:mm");
        setTimeLong(p.time_long_pattern ?? "HH:mm:ss");
        setDefaultCurrency(p.currency ?? "CNY");
        initialRef.current = JSON.stringify({
          pc: p.primary_calendar ?? "gregorian",
          sc: p.secondary_calendar ?? "",
          wf: p.week_first_day ?? "monday",
          ds: p.date_short_pattern ?? "YYYY-MM-DD",
          dl: p.date_long_pattern ?? "YYYY年M月D日",
          ts: p.time_short_pattern ?? "HH:mm",
          tl: p.time_long_pattern ?? "HH:mm:ss",
          dc: p.currency ?? "CNY",
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const updated = await updateProfile({
        primary_calendar: primaryCalendar,
        secondary_calendar: secondaryCalendar || null,
        week_first_day: weekFirstDay,
        date_short_pattern: dateShort,
        date_long_pattern: dateLong,
        time_short_pattern: timeShort,
        time_long_pattern: timeLong,
        currency: defaultCurrency,
      });
      setProfile(updated);
      initialRef.current = JSON.stringify({
        pc: primaryCalendar,
        sc: secondaryCalendar,
        wf: weekFirstDay,
        ds: dateShort,
        dl: dateLong,
        ts: timeShort,
        tl: timeLong,
        dc: defaultCurrency,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.profile.saveError"));
    } finally {
      setSaving(false);
    }
  }

  function handleResetToRegionDefault() {
    if (!profile?.country_code) return;
    const defaults = REGION_DEFAULTS[profile.country_code];
    if (!defaults) return;
    setPrimaryCalendar(defaults.primary_calendar);
    setSecondaryCalendar(defaults.secondary_calendar ?? "");
    setWeekFirstDay(defaults.week_first_day);
    setDateShort(defaults.date_short_pattern);
    setDateLong(defaults.date_long_pattern);
    setTimeShort(defaults.time_short_pattern);
    setTimeLong(defaults.time_long_pattern);
    setDefaultCurrency(defaults.currency);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* 日历设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.regionalFormat.calendarTitle")}</CardTitle>
          <CardDescription>{t("setting.regionalFormat.calendarDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("setting.regionalFormat.primaryCalendar")}</Label>
            <NativeSelect
              value={primaryCalendar}
              onChange={setPrimaryCalendar}
              options={PRIMARY_CALENDAR_OPTIONS}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("setting.regionalFormat.secondaryCalendar")}</Label>
            <NativeSelect
              value={secondaryCalendar}
              onChange={setSecondaryCalendar}
              options={SECONDARY_CALENDAR_OPTIONS}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("setting.regionalFormat.weekFirstDay")}</Label>
            <NativeSelect
              value={weekFirstDay}
              onChange={setWeekFirstDay}
              options={WEEK_FIRST_DAY_OPTIONS}
            />
          </div>
        </CardContent>
      </Card>

      {/* 日期格式 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.regionalFormat.dateTitle")}</CardTitle>
          <CardDescription>{t("setting.regionalFormat.dateDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("setting.regionalFormat.dateShort")}</Label>
            <NativeSelect
              value={dateShort}
              onChange={setDateShort}
              options={DATE_SHORT_OPTIONS.map((v) => ({ value: v, zh: v, en: v }))}
            />
            <p className="text-xs text-muted-foreground font-mono">
              {t("setting.regionalFormat.preview")}: {makePreview(dateShort, "date-short")}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t("setting.regionalFormat.dateLong")}</Label>
            <NativeSelect
              value={dateLong}
              onChange={setDateLong}
              options={DATE_LONG_OPTIONS.map((v) => ({ value: v, zh: v, en: v }))}
            />
            <p className="text-xs text-muted-foreground font-mono">
              {t("setting.regionalFormat.preview")}: {makePreview(dateLong, "date-long")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 时间格式 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.regionalFormat.timeTitle")}</CardTitle>
          <CardDescription>{t("setting.regionalFormat.timeDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("setting.regionalFormat.timeShort")}</Label>
            <NativeSelect
              value={timeShort}
              onChange={setTimeShort}
              options={TIME_SHORT_OPTIONS.map((v) => ({ value: v, zh: v, en: v }))}
            />
            <p className="text-xs text-muted-foreground font-mono">
              {t("setting.regionalFormat.preview")}: {makePreview(timeShort, "time-short")}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t("setting.regionalFormat.timeLong")}</Label>
            <NativeSelect
              value={timeLong}
              onChange={setTimeLong}
              options={TIME_LONG_OPTIONS.map((v) => ({ value: v, zh: v, en: v }))}
            />
            <p className="text-xs text-muted-foreground font-mono">
              {t("setting.regionalFormat.preview")}: {makePreview(timeLong, "time-long")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 货币 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.regionalFormat.currencyTitle")}</CardTitle>
          <CardDescription>{t("setting.regionalFormat.currencyDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>{t("setting.regionalFormat.defaultCurrency")}</Label>
            <NativeSelect
              value={defaultCurrency}
              onChange={setDefaultCurrency}
              options={CURRENCY_OPTIONS}
            />
          </div>
        </CardContent>
      </Card>

      {/* 操作区 */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || !dirty}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("setting.save")}
        </Button>
        {profile?.country_code && REGION_DEFAULTS[profile.country_code] && (
          <Button
            type="button"
            variant="outline"
            onClick={handleResetToRegionDefault}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            {t("setting.regionalFormat.resetToDefault")}
          </Button>
        )}
        {success && (
          <p className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            {t("setting.saved")}
          </p>
        )}
      </div>
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </form>
  );
}
