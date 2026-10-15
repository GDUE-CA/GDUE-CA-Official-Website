"use client";

/**
 * PrivacyForm —— 隐私设置（2026-10 扩展版）
 *
 * 三组控制（合并存储于 User.profile_privacy JSON）：
 * A. 个人资料可见权限：个性签名 / 性别 / 生日（public | private）；地区永久公开（只读）
 * B. 发现 & 搜索权限：discoverability = all | members | none
 * C. 内容默认可见范围：default_scope = public | members | private
 *
 * 黑名单管理在独立子页 /setting/privacy/blocks。
 * 保存：PUT /api/auth/profile { profile_privacy: {...} }（后端合并更新）
 */
import { useEffect, useRef, useState } from "react";
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
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Lock from "@/assets/icons/status/lock.svg";
import Eye from "@/assets/icons/status/eye.svg";
import EyeOff from "@/assets/icons/status/eye-off.svg";
import Search from "@/assets/icons/action/search.svg";
import FileEdit from "@/assets/icons/action/file-edit.svg";
import { cn } from "@/lib/utils";

const PAGE_KEY = "privacy";

type Discoverability = "all" | "members" | "none";
type DefaultScope = "public" | "members" | "private";

/** 单项可见性：true=公开，false=仅自己 */
type VisibilityMap = {
  bio: boolean;
  gender: boolean;
  birthday: boolean;
  /** 真实姓名对外展示开关（默认关闭，语义与其他字段相反：缺失=不展示） */
  real_name: boolean;
  /** 学校信息（学院/班级/学号）对外展示开关（默认关闭，语义同 real_name） */
  school_info: boolean;
};

interface PrivacyState extends VisibilityMap {
  discoverability: Discoverability;
  default_scope: DefaultScope;
}

const DEFAULT_STATE: PrivacyState = {
  bio: true,
  gender: true,
  birthday: true,
  real_name: false,
  school_info: false,
  discoverability: "all",
  default_scope: "public",
};

/** 从 profile_privacy JSON 解析；缺失项走默认值（real_name 默认关闭，需显式 public 才开启） */
function parsePrivacy(p: Record<string, string> | null | undefined): PrivacyState {
  const get = (k: keyof VisibilityMap) => p?.[k] !== "private";
  const disc = p?.discoverability;
  const scope = p?.default_scope;
  return {
    bio: get("bio"),
    gender: get("gender"),
    birthday: get("birthday"),
    real_name: p?.real_name === "public",
    school_info: p?.school_info === "public",
    discoverability:
      disc === "members" || disc === "none" ? disc : "all",
    default_scope:
      scope === "members" || scope === "private" ? scope : "public",
  };
}

export function PrivacyForm() {
  const { t } = useI18n();
  const { registerDirty } = useDirtyGuard();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [state, setState] = useState<PrivacyState>(DEFAULT_STATE);
  const initialRef = useRef<string>("");

  useEffect(() => {
    (async () => {
      try {
        const p = await fetchProfile();
        const v = parsePrivacy(p.profile_privacy);
        setState(v);
        initialRef.current = JSON.stringify(v);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("admin.profile.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = initialRef.current !== "" && JSON.stringify(state) !== initialRef.current;

  useEffect(() => {
    registerDirty(PAGE_KEY, dirty);
    return () => registerDirty(PAGE_KEY, false);
  }, [dirty, registerDirty]);

  function setVis(key: keyof VisibilityMap, value: boolean) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const profile_privacy: Record<string, string> = {
        bio: state.bio ? "public" : "private",
        gender: state.gender ? "public" : "private",
        birthday: state.birthday ? "public" : "private",
        real_name: state.real_name ? "public" : "private",
        school_info: state.school_info ? "public" : "private",
        discoverability: state.discoverability,
        default_scope: state.default_scope,
      };
      const updated = await updateProfile({ profile_privacy });
      const v = parsePrivacy(updated.profile_privacy);
      setState(v);
      initialRef.current = JSON.stringify(v);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setting.privacy.saveFailed"));
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

  /** 单行可见性切换：公开 ↔ 仅自己 */
  function VisibilityRow({
    label,
    fieldKey,
    desc,
  }: {
    label: string;
    fieldKey: keyof VisibilityMap;
    desc?: string;
  }) {
    const isPublic = state[fieldKey];
    return (
      <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">{label}</Label>
          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
        </div>
        <div className="flex items-center rounded-md border border-input overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setVis(fieldKey, true)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
              isPublic
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent"
            )}
            aria-pressed={isPublic}
          >
            <Eye className="h-3 w-3" />
            {t("setting.privacy.public")}
          </button>
          <button
            type="button"
            onClick={() => setVis(fieldKey, false)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 border-l border-input",
              !isPublic
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent"
            )}
            aria-pressed={!isPublic}
          >
            <EyeOff className="h-3 w-3" />
            {t("setting.privacy.private")}
          </button>
        </div>
      </div>
    );
  }

  /** 三选一选项行 */
  function OptionRow<T extends string>({
    value,
    current,
    onSelect,
    label,
    desc,
  }: {
    value: T;
    current: T;
    onSelect: (v: T) => void;
    label: string;
    desc?: string;
  }) {
    const active = current === value;
    return (
      <button
        type="button"
        onClick={() => onSelect(value)}
        className={cn(
          "w-full text-left rounded-md border px-3 py-2.5 transition-colors",
          active
            ? "border-primary bg-secondary/60"
            : "border-border hover:bg-muted"
        )}
        aria-pressed={active}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-3.5 w-3.5 rounded-full border flex items-center justify-center shrink-0",
              active ? "border-primary" : "border-muted-foreground/50"
            )}
          >
            {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
          </span>
          <span className="text-sm font-medium">{label}</span>
        </div>
        {desc && <p className="mt-1 pl-5 ml-5 text-xs text-muted-foreground">{desc}</p>}
      </button>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6" noValidate>
      {/* A. 个人资料可见权限 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.privacy.title")}</CardTitle>
          <CardDescription>{t("setting.privacy.hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {/* 地区：硬性约束永久公开 */}
          <div className="flex items-center justify-between gap-4 py-3 border-b border-border bg-muted/30 -mx-3 px-3 rounded-md">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                {t("setting.privacy.regionPermanent")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("setting.privacy.regionPermanentHint")}
              </p>
            </div>
            <span className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md shrink-0">
              {t("setting.privacy.public")}
            </span>
          </div>
          <VisibilityRow label={t("setting.privacy.bio")} fieldKey="bio" />
          <VisibilityRow label={t("setting.privacy.gender")} fieldKey="gender" />
          <VisibilityRow label={t("setting.privacy.birthday")} fieldKey="birthday" />
          {/* 真实姓名对外展示开关：默认关闭；本人浏览自己主页不受开关影响 */}
          <VisibilityRow
            label={t("setting.privacy.realName")}
            fieldKey="real_name"
            desc={t("setting.privacy.realNameHint")}
          />
          {/* 学校信息（学院/班级/学号）对外展示开关：默认关闭；本人浏览自己主页不受开关影响 */}
          <VisibilityRow
            label={t("setting.privacy.schoolInfo")}
            fieldKey="school_info"
            desc={t("setting.privacy.schoolInfoHint")}
          />
        </CardContent>
      </Card>

      {/* B. 发现 & 搜索权限 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-4 w-4" />
            {t("setting.privacy.discoverTitle")}
          </CardTitle>
          <CardDescription>{t("setting.privacy.discoverHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <OptionRow
            value="all"
            current={state.discoverability}
            onSelect={(v) => setState((p) => ({ ...p, discoverability: v }))}
            label={t("setting.privacy.discoverAll")}
          />
          <OptionRow
            value="members"
            current={state.discoverability}
            onSelect={(v) => setState((p) => ({ ...p, discoverability: v }))}
            label={t("setting.privacy.discoverMembers")}
          />
          <OptionRow
            value="none"
            current={state.discoverability}
            onSelect={(v) => setState((p) => ({ ...p, discoverability: v }))}
            label={t("setting.privacy.discoverNone")}
          />
        </CardContent>
      </Card>

      {/* C. 内容默认可见范围 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileEdit className="h-4 w-4" />
            {t("setting.privacy.scopeTitle")}
          </CardTitle>
          <CardDescription>{t("setting.privacy.scopeHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <OptionRow
            value="public"
            current={state.default_scope}
            onSelect={(v) => setState((p) => ({ ...p, default_scope: v }))}
            label={t("setting.privacy.scopePublic")}
          />
          <OptionRow
            value="members"
            current={state.default_scope}
            onSelect={(v) => setState((p) => ({ ...p, default_scope: v }))}
            label={t("setting.privacy.scopeMembers")}
          />
          <OptionRow
            value="private"
            current={state.default_scope}
            onSelect={(v) => setState((p) => ({ ...p, default_scope: v }))}
            label={t("setting.privacy.scopePrivate")}
          />
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-600 dark:bg-green-950/20">
          <CheckCircle2 className="h-4 w-4" />
          {t("setting.privacy.saved")}
        </p>
      )}

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
    </form>
  );
}
