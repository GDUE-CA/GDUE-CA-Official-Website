"use client";

/**
 * LocalizationForm —— Tab-2 本地化系统（UI 语言 / 时区 / 区域格式 / 货币）
 *
 * 三级优先级（规范 localiation-system.md 第二节）：
 *   用户字段非空 → 用户值；用户字段 NULL → 系统全局默认（sys_default_*）
 *
 * 关键约束：
 * - UI 翻译语言（locale）仅控制菜单/按钮文字；
 * - 区域格式（region_code）独立控制日期/货币/数字格式化；
 * - 二者可独立选择，互不强制联动。
 *
 * 下拉「跟随系统」语义：
 *   选项值为 ""（空字符串）→ 提交时后端转为 NULL（user.* 字段存 NULL）；
 *   界面显示「[跟随系统：{当前系统默认实际值}]」。
 *
 * 「恢复为系统默认」按钮：4 字段一次性置空（NULL）。
 * 「切换语言时同步更新区域格式」复选框：默认关闭；勾选后改 locale 会联动 region_code。
 * 「切换语言时保存为我的默认界面语言」复选框：勾选后保存时跳转到新 locale URL。
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
import { fetchPublicSettings } from "@/lib/api/system";
import {
  supportedLocales,
  localeNames,
  localeToRegion,
  type Locale,
} from "@/lib/i18n";
import { COMMON_TIMEZONES } from "@/components/layout/TimezoneSelect";
import type { AdminUser, PublicSystemSettings } from "@/types/api";

const PAGE_KEY = "localization";

/** 哨兵值：表示「跟随系统」（提交时映射为空字符串 → 后端存 NULL） */
const SYS_FOLLOW = "";

/** 货币选项（ISO-4217；与后端 currency 白名单一致，含 KRW/HKD/SGD/TWD/RUB） */
const CURRENCY_OPTIONS: { value: string; zh: string; en: string }[] = [
  { value: "CNY", zh: "人民币 ¥", en: "CNY ¥" },
  { value: "USD", zh: "美元 $", en: "USD $" },
  { value: "EUR", zh: "欧元 €", en: "EUR €" },
  { value: "GBP", zh: "英镑 £", en: "GBP £" },
  { value: "JPY", zh: "日元 ¥", en: "JPY ¥" },
  { value: "KRW", zh: "韩元 ₩", en: "KRW ₩" },
  { value: "HKD", zh: "港元 HK$", en: "HKD HK$" },
  { value: "SGD", zh: "新加坡元 S$", en: "SGD S$" },
  { value: "TWD", zh: "新台币 NT$", en: "TWD NT$" },
  { value: "RUB", zh: "俄罗斯卢堡 ₽", en: "RUB ₽" },
  { value: "MOP", zh: "澳门元 MOP$", en: "MOP MOP$" },
  { value: "AUD", zh: "澳元 A$", en: "AUD A$" },
  { value: "CAD", zh: "加元 C$", en: "CAD C$" },
  { value: "CHF", zh: "瑞士法郎 Fr", en: "CHF Fr" },
];

/** 区域选项（ISO-3166-1 alpha-2 国家代码，覆盖 13 语种对应国家 + 其他主要地区） */
const REGION_OPTIONS: { value: string; zh: string; en: string }[] = [
  { value: "CN", zh: "中国大陆", en: "China" },
  { value: "SG", zh: "新加坡", en: "Singapore" },
  { value: "TW", zh: "中国台湾", en: "Taiwan" },
  { value: "HK", zh: "中国香港", en: "Hong Kong" },
  { value: "MO", zh: "中国澳门", en: "Macao" },
  { value: "JP", zh: "日本", en: "Japan" },
  { value: "KR", zh: "韩国", en: "South Korea" },
  { value: "GB", zh: "英国", en: "United Kingdom" },
  { value: "US", zh: "美国", en: "United States" },
  { value: "ES", zh: "西班牙", en: "Spain" },
  { value: "FR", zh: "法国", en: "France" },
  { value: "DE", zh: "德国", en: "Germany" },
  { value: "RU", zh: "俄罗斯", en: "Russia" },
  { value: "AU", zh: "澳大利亚", en: "Australia" },
  { value: "CA", zh: "加拿大", en: "Canada" },
  { value: "CH", zh: "瑞士", en: "Switzerland" },
];

/** 展示某 sys_default 值的可读标签 */
function sysDisplay(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  return value;
}

export function LocalizationForm() {
  const { t, locale } = useI18n();
  const { registerDirty } = useDirtyGuard();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [profile, setProfile] = useState<AdminUser | null>(null);
  const [sysSettings, setSysSettings] = useState<PublicSystemSettings | null>(null);

  // 4 个本地化字段（"" = 跟随系统；非空 = 用户持久值）
  const [userLocale, setUserLocale] = useState<string>("");
  const [userTimezone, setUserTimezone] = useState<string>("");
  const [userRegion, setUserRegion] = useState<string>("");
  const [userCurrency, setUserCurrency] = useState<string>("");

  // 2 个可选复选框
  const [syncRegionWithLang, setSyncRegionWithLang] = useState(false);
  const [rememberAsDefault, setRememberAsDefault] = useState(false);

  // dirty 追踪
  const initialRef = useRef("");
  const dirty = useMemo(() => {
    const current = JSON.stringify({
      l: userLocale,
      tz: userTimezone,
      r: userRegion,
      c: userCurrency,
    });
    return current !== initialRef.current;
  }, [userLocale, userTimezone, userRegion, userCurrency]);

  useEffect(() => {
    registerDirty(PAGE_KEY, dirty);
    return () => registerDirty(PAGE_KEY, false);
  }, [dirty, registerDirty]);

  // 加载用户 profile + 系统默认配置
  useEffect(() => {
    Promise.all([fetchProfile(), fetchPublicSettings()])
      .then(([p, s]) => {
        setProfile(p);
        setSysSettings(s);
        setUserLocale(p.locale ?? "");
        setUserTimezone(p.timezone ?? "");
        setUserRegion(p.region_code ?? "");
        setUserCurrency(p.currency ?? "");
        initialRef.current = JSON.stringify({
          l: p.locale ?? "",
          tz: p.timezone ?? "",
          r: p.region_code ?? "",
          c: p.currency ?? "",
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t("admin.profile.loadFailed"));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 切换 locale 时，若勾选「同步更新区域格式」，联动 region_code */
  function handleLocaleChange(newLocale: string) {
    setUserLocale(newLocale);
    if (syncRegionWithLang && newLocale) {
      const mapped = localeToRegion[newLocale as Locale];
      if (mapped) setUserRegion(mapped);
    }
  }

  /** 「同步区域格式」复选框切换：开启时立即把当前 locale 联动到 region */
  function handleSyncRegionToggle(checked: boolean) {
    setSyncRegionWithLang(checked);
    if (checked && userLocale) {
      const mapped = localeToRegion[userLocale as Locale];
      if (mapped) setUserRegion(mapped);
    }
  }

  /** 恢复为系统默认：4 字段全部置空（NULL） */
  function handleRestoreDefault() {
    setUserLocale(SYS_FOLLOW);
    setUserTimezone(SYS_FOLLOW);
    setUserRegion(SYS_FOLLOW);
    setUserCurrency(SYS_FOLLOW);
  }

  /** 读取浏览器本地时区（Intl API）写入 user.timezone */
  function handleUseBrowserTimezone() {
    try {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (browserTz) setUserTimezone(browserTz);
    } catch {
      // 浏览器不支持 Intl：静默忽略
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const updated = await updateProfile({
        locale: userLocale,
        timezone: userTimezone,
        region_code: userRegion,
        currency: userCurrency,
      });
      setProfile(updated);
      initialRef.current = JSON.stringify({
        l: userLocale,
        tz: userTimezone,
        r: userRegion,
        c: userCurrency,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      // 勾选「记住为默认界面语言」且 locale 变化：跳转到新 locale URL
      if (rememberAsDefault && userLocale && userLocale !== locale) {
        const newPath = `/${userLocale}/setting/localization`;
        window.location.href = newPath;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.profile.saveError"));
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

  const isZh = locale.startsWith("zh");

  // 系统默认值展示（用于「跟随系统：xxx」标签）
  const sysLocaleDisplay = sysSettings?.sys_default_locale
    ? (localeNames[sysSettings.sys_default_locale as Locale] ?? sysSettings.sys_default_locale)
    : t("setting.localization.notSet");
  const sysTzDisplay = sysDisplay(sysSettings?.sys_default_timezone, t("setting.localization.notSet"));
  const sysRegionDisplay = (() => {
    const code = sysSettings?.sys_default_region;
    if (!code) return t("setting.localization.notSet");
    const found = REGION_OPTIONS.find((o) => o.value === code);
    return found ? (isZh ? found.zh : found.en) : code;
  })();
  const sysCurrencyDisplay = (() => {
    const code = sysSettings?.sys_default_currency;
    if (!code) return t("setting.localization.notSet");
    const found = CURRENCY_OPTIONS.find((o) => o.value === code);
    return found ? (isZh ? found.zh : found.en) : code;
  })();

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* 免责声明 */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            {t("setting.localization.disclaimer")}
          </p>
        </CardContent>
      </Card>

      {/* UI 界面语言 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.localization.localeTitle")}</CardTitle>
          <CardDescription>{t("setting.localization.localeDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("setting.localization.uiLanguage")}</Label>
            <select
              value={userLocale}
              onChange={(e) => handleLocaleChange(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={SYS_FOLLOW}>
                {t("setting.localization.followSystem", { value: sysLocaleDisplay })}
              </option>
              {supportedLocales.map((l) => (
                <option key={l} value={l}>
                  {localeNames[l]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t("setting.localization.localeHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 时区 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.localization.timezoneTitle")}</CardTitle>
          <CardDescription>{t("setting.localization.timezoneDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("setting.localization.timezone")}</Label>
            <select
              value={userTimezone}
              onChange={(e) => setUserTimezone(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={SYS_FOLLOW}>
                {t("setting.localization.followSystem", { value: sysTzDisplay })}
              </option>
              {COMMON_TIMEZONES.map((tzName) => (
                <option key={tzName} value={tzName}>
                  {tzName}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUseBrowserTimezone}
          >
            {t("setting.localization.useBrowserTimezone")}
          </Button>
        </CardContent>
      </Card>

      {/* 区域格式 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.localization.regionTitle")}</CardTitle>
          <CardDescription>{t("setting.localization.regionDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("setting.localization.regionCode")}</Label>
            <select
              value={userRegion}
              onChange={(e) => setUserRegion(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={SYS_FOLLOW}>
                {t("setting.localization.followSystem", { value: sysRegionDisplay })}
              </option>
              {REGION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {isZh ? o.zh : o.en}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t("setting.localization.regionHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 货币 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.localization.currencyTitle")}</CardTitle>
          <CardDescription>{t("setting.localization.currencyDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("setting.localization.currency")}</Label>
            <select
              value={userCurrency}
              onChange={(e) => setUserCurrency(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={SYS_FOLLOW}>
                {t("setting.localization.followSystem", { value: sysCurrencyDisplay })}
              </option>
              {CURRENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {isZh ? o.zh : o.en}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* 选项区 */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={syncRegionWithLang}
              onChange={(e) => handleSyncRegionToggle(e.target.checked)}
              className="h-4 w-4 mt-0.5 cursor-pointer accent-primary"
            />
            <span className="text-sm">
              {t("setting.localization.syncRegionWithLang")}
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberAsDefault}
              onChange={(e) => setRememberAsDefault(e.target.checked)}
              className="h-4 w-4 mt-0.5 cursor-pointer accent-primary"
            />
            <span className="text-sm">
              {t("setting.localization.rememberAsDefault")}
            </span>
          </label>
        </CardContent>
      </Card>

      {/* 操作区 */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || !dirty}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("setting.save")}
        </Button>
        <Button type="button" variant="outline" onClick={handleRestoreDefault}>
          <RotateCcw className="h-4 w-4 mr-1" />
          {t("setting.localization.restoreDefault")}
        </Button>
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
