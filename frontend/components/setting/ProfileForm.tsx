"use client";

/**
 * ProfileForm —— Tab-1 基础资料
 *
 * - 字段：显示昵称 / 真实姓名 / 学号 / 手机号（区号选择 + 号码）/ 邮箱（只读）
 * - 手机号：区号来自 /api/geo/countries（dial_code 去重升序）；
 *   保存时合并为 "+86 138xxxx"，编辑时按 +区号 号码 拆回
 * - 统一底部【保存更改】按钮一次性 PUT /api/auth/profile（仅 display_name/real_name/student_id/phone）
 * - 头像区 AvatarUploader 独立接口即时生效，不计入 dirty
 * - 永不展示 / 修改 role 字段
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
import { AvatarUploader } from "@/components/setting/AvatarUploader";
import { BannerUploader } from "@/components/setting/BannerUploader";
import {
  EMPTY_SCHOOL_CASCADE,
  SchoolCascadeSelects,
  type SchoolCascadeValue,
} from "@/components/setting/SchoolCascadeSelects";
import { SchoolVerifyCard } from "@/components/setting/SchoolVerifyCard";
import { BadgeList } from "@/components/user/BadgeChip";
import { useDirtyGuard } from "@/components/setting/SettingGuardContext";
import { fetchProfile, updateProfile } from "@/lib/api/auth";
import { fetchPublicProfile } from "@/lib/api/profile";
import { fetchGeoCountries } from "@/lib/api/geo";
import type { AdminUser, BadgeOut, GeoCountry } from "@/types/api";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import QrCode from "@/assets/icons/action/qr-code.svg";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { utcToLocalInput, localInputToUtcIso } from "@/lib/utils";

/** 从 "+86 138xxxx" 拆出区号与号码 */
function parsePhone(phone: string): { dial: string; number: string } {
  const m = phone.trim().match(/^\+(\d+)\s*(.+)$/);
  if (m) return { dial: m[1], number: m[2].trim() };
  return { dial: "", number: phone.trim() };
}

const PAGE_KEY = "profile";

export function ProfileForm() {
  const { t, locale } = useI18n();
  const { registerDirty } = useDirtyGuard();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [profile, setProfile] = useState<AdminUser | null>(null);
  const [countries, setCountries] = useState<GeoCountry[]>([]);
  /** 本人徽章预览（仅展示不可编辑；取自公开主页接口，含系统徽章+自定义徽章） */
  const [badges, setBadges] = useState<BadgeOut[]>([]);

  const [displayName, setDisplayName] = useState("");
  const [realName, setRealName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [dial, setDial] = useState("");
  const [phoneBody, setPhoneBody] = useState("");
  // 规格 §4.1：性别（male/female/hidden）/ 生日 / 个性签名
  const [gender, setGender] = useState("");
  const [birthday, setBirthday] = useState("");
  const [bio, setBio] = useState("");
  // Module D：学校资料（学院/年级/专业/班级外键 ID 联动；仅已验证用户显示）
  const [schoolCascade, setSchoolCascade] = useState<SchoolCascadeValue>({ ...EMPTY_SCHOOL_CASCADE });

  // 初始快照，用于 dirty 判断
  const initialRef = useRef<string | null>(null);
  // 学校资料初始快照（四个外键 ID；独立对比，只有变化才成组提交）
  const initialCascadeRef = useRef<string>("");

  const isZh = locale.startsWith("zh");

  useEffect(() => {
    (async () => {
      try {
        const [p, cs] = await Promise.all([fetchProfile(), fetchGeoCountries()]);
        setCountries(cs);
        setProfile(p);
        setDisplayName(p.display_name ?? "");
        setRealName(p.real_name ?? "");
        setStudentId(p.student_id ?? "");
        // Module D：学校资料（仅已通过学校身份验证的用户可编辑）
        const verified = p.identity_school_verified === true;
        const cascade: SchoolCascadeValue = verified
          ? {
              college_id: p.college_id ?? null,
              major_id: p.major_id ?? null,
              grade_id: p.grade_id ?? null,
              class_id: p.class_id ?? null,
            }
          : { ...EMPTY_SCHOOL_CASCADE };
        setSchoolCascade(cascade);
        initialCascadeRef.current = JSON.stringify(cascade);
        // 徽章预览：走公开主页接口（本人视角，含系统徽章动态计算结果）
        fetchPublicProfile(p.username)
          .then((pub) => setBadges(pub.badges ?? []))
          .catch(() => setBadges([]));
        const { dial: d, number: n } = parsePhone(p.phone ?? "");
        setPhoneBody(n);
        setDial(d || (cs.some((c) => c.dial_code === "86") ? "86" : (cs[0]?.dial_code ?? "")));
        setGender(p.gender ?? "");
        setBirthday(p.birthday ? utcToLocalInput(p.birthday) : "");
        setBio(p.bio ?? "");
        initialRef.current = JSON.stringify({
          dn: p.display_name ?? "",
          rn: p.real_name ?? "",
          si: p.student_id ?? "",
          dial: d || (cs.some((c) => c.dial_code === "86") ? "86" : (cs[0]?.dial_code ?? "")),
          pb: n,
          g: p.gender ?? "",
          bd: p.birthday ? utcToLocalInput(p.birthday) : "",
          bio: p.bio ?? "",
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : t("admin.profile.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 区号选项：dial_code 去重 + 按数值升序，标签 "+86 中文名/英文名"
  const dialOptions = useMemo<SearchableSelectOption[]>(() => {
    const seen = new Map<string, string>();
    for (const c of countries) {
      if (!c.dial_code || seen.has(c.dial_code)) continue;
      seen.set(c.dial_code, isZh ? c.display_name_zh : c.name_en);
    }
    return [...seen.entries()]
      .sort((a, b) => Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10))
      .map(([code, name]) => ({
        value: code,
        label: `+${code} ${name}`,
        keywords: `+${code} ${name} ${code}`,
      }));
  }, [countries, isZh]);

  const dirty =
    initialRef.current !== null &&
    (JSON.stringify({ dn: displayName, rn: realName, si: studentId, dial, pb: phoneBody, g: gender, bd: birthday, bio }) !==
      initialRef.current ||
      JSON.stringify(schoolCascade) !== initialCascadeRef.current);

  // 注册 dirty 到离开守卫
  useEffect(() => {
    registerDirty(PAGE_KEY, dirty);
    return () => registerDirty(PAGE_KEY, false);
  }, [dirty, registerDirty]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const number = phoneBody.trim();
      const phone = !number ? "" : dial ? `+${dial} ${number}` : number;
      const verified = profile?.identity_school_verified === true;

      // Module D：学号仅已验证用户可写（未验证用户输入框隐藏，state 恒为初始值）
      let studentIdPayload: string | undefined;
      if (verified) {
        const sid = studentId.trim();
        if (!/^\d{11}$/.test(sid)) {
          setError(t("setting.school.studentIdInvalid"));
          setSaving(false);
          return;
        }
        studentIdPayload = sid;
      }

      // 学校资料四 ID：只有变化才成组提交（后端要求成组且严格校验层级）
      const cascadeDirty = JSON.stringify(schoolCascade) !== initialCascadeRef.current;
      let schoolIds: { college_id: number; major_id: number; grade_id: number; class_id: number } | undefined;
      if (verified && cascadeDirty) {
        if (
          schoolCascade.college_id == null || schoolCascade.major_id == null ||
          schoolCascade.grade_id == null || schoolCascade.class_id == null
        ) {
          setError(t("setting.school.incomplete"));
          setSaving(false);
          return;
        }
        schoolIds = {
          college_id: schoolCascade.college_id,
          major_id: schoolCascade.major_id,
          grade_id: schoolCascade.grade_id,
          class_id: schoolCascade.class_id,
        };
      }

      const updated = await updateProfile({
        display_name: displayName.trim(),
        real_name: realName.trim(),
        phone,
        gender: gender || "",
        birthday: birthday ? localInputToUtcIso(birthday) : "",
        bio: bio.trim(),
        ...(studentIdPayload !== undefined ? { student_id: studentIdPayload } : {}),
        ...(schoolIds ?? {}),
      });
      setProfile(updated);
      const nextCascade: SchoolCascadeValue = verified
        ? {
            college_id: updated.college_id ?? schoolCascade.college_id,
            major_id: updated.major_id ?? schoolCascade.major_id,
            grade_id: updated.grade_id ?? schoolCascade.grade_id,
            class_id: updated.class_id ?? schoolCascade.class_id,
          }
        : { ...EMPTY_SCHOOL_CASCADE };
      setSchoolCascade(nextCascade);
      initialCascadeRef.current = JSON.stringify(nextCascade);
      initialRef.current = JSON.stringify({
        dn: displayName.trim(),
        rn: realName.trim(),
        si: studentId.trim(),
        dial,
        pb: phoneBody.trim(),
        g: gender,
        bd: birthday,
        bio: bio.trim(),
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
      {/* 头像（独立接口即时生效，不计 dirty） */}
      <AvatarUploader
        avatarUrl={profile?.avatar_url ?? null}
        username={profile?.username ?? ""}
        onChanged={(url) =>
          setProfile((p) => (p ? { ...p, avatar_url: url } : p))
        }
      />

      {/* 个人主页封面（V0.5.5 §9.3：图片 / 纯色 / 系统默认；独立接口即时生效） */}
      <BannerUploader
        bannerUrl={profile?.profile_banner ?? null}
        bannerColor={profile?.profile_banner_color ?? null}
        onChanged={({ banner_url, banner_color }) =>
          setProfile((p) =>
            p
              ? { ...p, profile_banner: banner_url, profile_banner_color: banner_color }
              : p
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.profile.title")}</CardTitle>
          <CardDescription>{t("profile.personalInfoHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pf-displayName">{t("admin.profile.displayName")}</Label>
                <Input
                  id="pf-displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t("admin.profile.displayNamePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-realName">{t("admin.profile.realName")}</Label>
                <Input
                  id="pf-realName"
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder={t("admin.profile.realNamePlaceholder")}
                />
              </div>
              {/* Module D：学号仅学校身份已验证用户可见（社会成员完全隐藏） */}
              {profile?.identity_school_verified && (
                <div className="space-y-2">
                  <Label htmlFor="pf-studentId">{t("admin.profile.studentId")}</Label>
                  <Input
                    id="pf-studentId"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    inputMode="numeric"
                    maxLength={11}
                    placeholder={t("admin.profile.studentIdPlaceholder")}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="pf-phone">{t("admin.profile.phone")}</Label>
                <div className="flex gap-2">
                  <div className="w-36 shrink-0">
                    <SearchableSelect
                      value={dial}
                      onChange={setDial}
                      options={dialOptions}
                      placeholder={t("setting.profile.phoneDialCode")}
                      ariaLabel={t("setting.profile.phoneDialCode")}
                    />
                  </div>
                  <Input
                    id="pf-phone"
                    type="tel"
                    className="flex-1"
                    value={phoneBody}
                    onChange={(e) => setPhoneBody(e.target.value)}
                    placeholder={t("setting.profile.phonePlaceholder")}
                  />
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pf-email">{t("admin.profile.email")}</Label>
                <Input
                  id="pf-email"
                  value={profile?.email ?? ""}
                  disabled
                  className="cursor-not-allowed bg-muted/50"
                />
                <p className="text-xs text-muted-foreground">
                  {t("admin.profile.emailReadonly")}
                </p>
              </div>
              {/* 规格 §4.1：性别 / 生日 / 个性签名 */}
              <div className="space-y-2">
                <Label htmlFor="pf-gender">{t("setting.profile.gender")}</Label>
                <select
                  id="pf-gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">{t("setting.profile.genderPlaceholder")}</option>
                  <option value="male">{t("setting.profile.genderMale")}</option>
                  <option value="female">{t("setting.profile.genderFemale")}</option>
                  <option value="hidden">{t("setting.profile.genderHidden")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-birthday">{t("setting.profile.birthday")}</Label>
                <Input
                  id="pf-birthday"
                  type="date"
                  value={birthday ? birthday.slice(0, 10) : ""}
                  onChange={(e) => setBirthday(e.target.value ? `${e.target.value}T00:00` : "")}
                  placeholder={t("setting.profile.birthdayPlaceholder")}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pf-bio">{t("setting.profile.bio")}</Label>
                <Input
                  id="pf-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t("setting.profile.bioPlaceholder")}
                  maxLength={140}
                />
              </div>
              {/* 徽章预览：仅展示，不可编辑；维护入口在后台用户详情页 */}
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("setting.profile.badgesPreview")}</Label>
                <div className="flex items-center gap-1.5 flex-wrap rounded-md border border-border bg-muted/30 px-3 py-2.5 min-h-10">
                  {badges.length > 0 ? (
                    <BadgeList badges={badges} />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("setting.profile.badgesEmpty")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("setting.profile.badgesPreviewHint")}
                </p>
              </div>
              {/* Module D：学校资料编辑（仅已验证用户；四 ID 成组提交，后端严格校验层级） */}
              {profile?.identity_school_verified && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("setting.school.profileSection")}</Label>
                  <SchoolCascadeSelects value={schoolCascade} onChange={setSchoolCascade} />
                  <p className="text-xs text-muted-foreground">
                    {t("setting.school.profileSectionHint")}
                  </p>
                </div>
              )}
            </div>

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
              <Button type="submit" disabled={saving || !dirty}>
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

      {/* Module D：学校身份验证（四态流转；未验证用户提交申请入口） */}
      <SchoolVerifyCard />

      {/* 个人主页二维码：扫码直达 /{locale}/u/{username} */}
      {profile?.username && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <QrCode className="h-4 w-4" />
              {t("setting.profile.qrTitle")}
            </CardTitle>
            <CardDescription>{t("setting.profile.qrHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 py-4">
            <div className="rounded-lg border border-border bg-white p-3">
              <QRCodeSVG
                value={`${window.location.origin}/${locale}/u/${encodeURIComponent(profile.username)}`}
                size={168}
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center break-all">
              {`${window.location.origin}/${locale}/u/${profile.username}`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
