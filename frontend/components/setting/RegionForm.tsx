"use client";

/**
 * RegionForm —— Tab-2 地区与时区
 *
 * - 自动探测：开启时调 GET /api/geo/detect 仅回填国家（子行政区由用户手动确认）
 * - 国家：SearchableSelect（/api/geo/countries，接口顺序即 CN/HK/MO/TW 置顶）
 * - 选中国家后 fetch /api/geo/subdivisions：
 *   - has_second_level=true → 一级 + 二级两个 SearchableSelect（切一级时二级重置）
 *   - has_second_level=false → 仅一级
 *   - items=[] → 两个下拉隐藏，渲染自由文本 locality_text
 * - 校验：有行政区数据时一级必填、has_second_level 时二级必填
 * - 时区卡片：复用 TimezoneSelect，与地区同一表单一起保存（timezone "" = 自动探测）
 * - 地区与时区互不影响
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
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
import { SearchableSelect, type SearchableSelectOption } from "@/components/setting/SearchableSelect";
import { TimezoneSelect } from "@/components/layout/TimezoneSelect";
import { useDirtyGuard } from "@/components/setting/SettingGuardContext";
import { fetchProfile, updateProfile } from "@/lib/api/auth";
import { fetchGeoCountries, fetchGeoSubdivisions, detectCountry } from "@/lib/api/geo";
import type { AdminUser, GeoCountry, SubdivisionsResponse } from "@/types/api";

const PAGE_KEY = "region";

export function RegionForm() {
  const { t, locale } = useI18n();
  const { registerDirty } = useDirtyGuard();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [countries, setCountries] = useState<GeoCountry[]>([]);
  const [countryCode, setCountryCode] = useState("");
  const [sub, setSub] = useState<SubdivisionsResponse | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subdiv1, setSubdiv1] = useState("");
  const [subdiv2, setSubdiv2] = useState("");
  const [localityText, setLocalityText] = useState("");
  const [timezone, setTimezone] = useState("auto");

  // 自动探测
  const [autoDetect, setAutoDetect] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const initialRef = useRef<string | null>(null);

  const isZh = locale === "zh-cn" || locale === "zh-tw" || locale === "zh-hk";

  useEffect(() => {
    (async () => {
      try {
        const [p, cs] = await Promise.all([fetchProfile(), fetchGeoCountries()]);
        setCountries(cs);
        setTimezone(p.timezone ?? "auto");
        const snap = {
          cc: "",
          s1: "",
          s2: "",
          lt: "",
          tz: p.timezone ?? "auto",
        };
        if (p.country_code) {
          snap.cc = p.country_code;
          setCountryCode(p.country_code);
          try {
            const s = await fetchGeoSubdivisions(p.country_code);
            setSub(s);
            if (s.items.length > 0) {
              const item = s.items.find((i) => i.code === p.subdiv1_code);
              if (p.subdiv1_code && item) {
                snap.s1 = p.subdiv1_code;
                setSubdiv1(p.subdiv1_code);
                if (p.subdiv2_code && item.children.some((c) => c.code === p.subdiv2_code)) {
                  snap.s2 = p.subdiv2_code;
                  setSubdiv2(p.subdiv2_code);
                }
              }
            } else {
              snap.lt = p.locality_text ?? "";
              setLocalityText(p.locality_text ?? "");
            }
          } catch {
            // 行政区数据加载失败：按未收录处理，回退自由文本
            snap.lt = p.locality_text ?? "";
            setLocalityText(p.locality_text ?? "");
          }
        } else if (p.locality_text) {
          snap.lt = p.locality_text;
          setLocalityText(p.locality_text);
        }
        initialRef.current = JSON.stringify(snap);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("admin.profile.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty =
    initialRef.current !== null &&
    JSON.stringify({ cc: countryCode, s1: subdiv1, s2: subdiv2, lt: localityText, tz: timezone }) !==
      initialRef.current;

  useEffect(() => {
    registerDirty(PAGE_KEY, dirty);
    return () => registerDirty(PAGE_KEY, false);
  }, [dirty, registerDirty]);

  const countryOptions = useMemo<SearchableSelectOption[]>(
    () =>
      countries.map((c) => ({
        value: c.iso2,
        label: isZh ? c.display_name_zh : c.name_en,
        keywords: `${c.iso2} ${c.display_name_zh} ${c.name_en} ${c.official_name}`,
      })),
    [countries, isZh]
  );

  const subdiv1Options = useMemo<SearchableSelectOption[]>(
    () =>
      (sub?.items ?? []).map((i) => ({
        value: i.code,
        label: isZh ? i.name_zh : i.name_en,
        keywords: `${i.code} ${i.name_zh} ${i.name_en}`,
      })),
    [sub, isZh]
  );

  const subdiv2Options = useMemo<SearchableSelectOption[]>(() => {
    const item = sub?.items.find((i) => i.code === subdiv1);
    return (item?.children ?? []).map((c) => ({
      value: c.code,
      label: isZh ? c.name_zh : c.name_en,
      keywords: `${c.code} ${c.name_zh} ${c.name_en}`,
    }));
  }, [sub, subdiv1, isZh]);

  const hasSubdivItems = (sub?.items.length ?? 0) > 0;
  const showSecondLevel = hasSubdivItems && !!sub?.has_second_level;

  /** 拉取某国家的行政区划；失败按未收录（自由文本）处理 */
  async function loadSubdivisions(iso2: string) {
    setSubLoading(true);
    try {
      const s = await fetchGeoSubdivisions(iso2);
      setSub(s);
    } catch {
      setSub({ has_second_level: false, items: [] });
    } finally {
      setSubLoading(false);
    }
  }

  function handleCountryChange(v: string) {
    setCountryCode(v);
    setSubdiv1("");
    setSubdiv2("");
    setLocalityText("");
    setSub(null);
    setError(null);
    setDetectMsg(null);
    if (v) void loadSubdivisions(v);
  }

  function handleSubdiv1Change(v: string) {
    setSubdiv1(v);
    // 切换一级时重置二级
    setSubdiv2("");
  }

  /** 自动探测地区：仅回填国家，子行政区提示用户手动确认 */
  async function handleAutoDetect(on: boolean) {
    setAutoDetect(on);
    setDetectMsg(null);
    if (!on) return;
    setDetecting(true);
    try {
      const { iso2 } = await detectCountry();
      if (iso2) {
        if (iso2 !== countryCode) {
          setCountryCode(iso2);
          setSubdiv1("");
          setSubdiv2("");
          setLocalityText("");
          setSub(null);
          await loadSubdivisions(iso2);
        }
        setDetectMsg({ type: "ok", text: t("setting.region.detectSuccess") });
      } else {
        setDetectMsg({ type: "err", text: t("setting.region.detectFailed") });
      }
    } catch {
      setDetectMsg({ type: "err", text: t("setting.region.detectFailed") });
    } finally {
      setDetecting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    // 校验：有标准行政区数据时，一级必填；存在二级时二级必填
    if (hasSubdivItems) {
      if (!subdiv1) {
        setError(t("setting.region.requireSubdiv1"));
        return;
      }
      if (showSecondLevel && !subdiv2) {
        setError(t("setting.region.requireSubdiv2"));
        return;
      }
    }
    setSaving(true);
    try {
      await updateProfile({
        country_code: countryCode,
        subdiv1_code: subdiv1,
        subdiv2_code: subdiv2,
        locality_text: localityText.trim(),
        timezone: timezone === "auto" || !timezone.trim() ? "" : timezone.trim(),
      });
      initialRef.current = JSON.stringify({
        cc: countryCode,
        s1: subdiv1,
        s2: subdiv2,
        lt: localityText.trim(),
        tz: timezone,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.region.title")}</CardTitle>
          <CardDescription>{t("profile.locationHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5" noValidate>
            {/* 自动探测开关 */}
            <div className="flex items-center gap-2">
              <input
                id="rf-autoDetect"
                type="checkbox"
                checked={autoDetect}
                disabled={detecting}
                onChange={(e) => void handleAutoDetect(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-primary"
              />
              <Label htmlFor="rf-autoDetect" className="cursor-pointer text-sm font-normal">
                {t("setting.region.autoDetect")}
              </Label>
              {detecting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {detectMsg && (
              <p
                className={
                  detectMsg.type === "ok"
                    ? "text-sm text-green-600 dark:text-green-500"
                    : "text-sm text-destructive"
                }
              >
                {detectMsg.text}
              </p>
            )}

            {/* 国家 */}
            <div className="space-y-2">
              <Label>{t("setting.region.country")}</Label>
              <SearchableSelect
                value={countryCode}
                onChange={handleCountryChange}
                options={countryOptions}
                placeholder={t("profile.selectCountry")}
                ariaLabel={t("setting.region.country")}
              />
            </div>

            {subLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}

            {/* 行政区：有标准数据 → 下拉；无 → 自由文本 */}
            {countryCode && !subLoading && hasSubdivItems && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("setting.region.subdiv1")}</Label>
                  <SearchableSelect
                    value={subdiv1}
                    onChange={handleSubdiv1Change}
                    options={subdiv1Options}
                    placeholder={t("profile.selectRegion")}
                    ariaLabel={t("setting.region.subdiv1")}
                  />
                </div>
                {showSecondLevel && (
                  <div className="space-y-2">
                    <Label>{t("setting.region.subdiv2")}</Label>
                    <SearchableSelect
                      value={subdiv2}
                      onChange={setSubdiv2}
                      options={subdiv2Options}
                      placeholder={t("profile.selectLocality")}
                      ariaLabel={t("setting.region.subdiv2")}
                    />
                  </div>
                )}
              </div>
            )}
            {countryCode && !subLoading && !hasSubdivItems && (
              <div className="space-y-2">
                <Label htmlFor="rf-localityText">{t("setting.region.subdiv1")}</Label>
                <Input
                  id="rf-localityText"
                  value={localityText}
                  onChange={(e) => setLocalityText(e.target.value)}
                  placeholder={t("setting.region.localityPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("setting.region.freeTextHint")}
                </p>
              </div>
            )}

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            {success && (
              <p className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-600 dark:bg-green-950/20">
                <CheckCircle2 className="h-4 w-4" />
                {t("setting.success")}
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={saving || subLoading || !dirty}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("setting.saving")}
                  </>
                ) : (
                  t("setting.saveChanges")
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 时区卡片（与地区同一表单一起保存，互不影响） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("admin.profile.timezone")}</CardTitle>
          <CardDescription>{t("admin.profile.timezoneHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <TimezoneSelect
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={timezone}
              onChange={setTimezone}
              label={t("admin.profile.timezone")}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
