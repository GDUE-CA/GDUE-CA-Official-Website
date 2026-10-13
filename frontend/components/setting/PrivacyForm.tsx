"use client";

/**
 * PrivacyForm —— 规格 §4.2 隐私设置子栏目
 *
 * - 控制项：个性签名 / 性别 / 生日（public | private）
 * - 硬性约束：地区字段 100% 永久公开，不可关闭（仅作只读展示）
 * - 保存：PUT /api/auth/profile { profile_privacy: {...} }（合并更新）
 * profile_privacy JSON 结构：{ "bio": "public"|"private", "gender": "...", "birthday": "..." }
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
import { CheckCircle2, Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_KEY = "privacy";

/** 单项可见性：true=公开，false=仅自己 */
type VisibilityMap = {
  bio: boolean;
  gender: boolean;
  birthday: boolean;
};

const DEFAULT_VISIBILITY: VisibilityMap = {
  bio: true,
  gender: true,
  birthday: true,
};

/** 从 profile_privacy JSON 解析可见性映射；缺失或非法值默认 true（公开） */
function parsePrivacy(p: Record<string, string> | null | undefined): VisibilityMap {
  const get = (k: keyof VisibilityMap) => p?.[k] !== "private";
  return {
    bio: get("bio"),
    gender: get("gender"),
    birthday: get("birthday"),
  };
}

export function PrivacyForm() {
  const { t } = useI18n();
  const { registerDirty } = useDirtyGuard();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [visibility, setVisibility] = useState<VisibilityMap>(DEFAULT_VISIBILITY);
  const initialRef = useRef<string>("");

  useEffect(() => {
    (async () => {
      try {
        const p = await fetchProfile();
        const v = parsePrivacy(p.profile_privacy);
        setVisibility(v);
        initialRef.current = JSON.stringify(v);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("admin.profile.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = initialRef.current !== "" && JSON.stringify(visibility) !== initialRef.current;

  useEffect(() => {
    registerDirty(PAGE_KEY, dirty);
    return () => registerDirty(PAGE_KEY, false);
  }, [dirty, registerDirty]);

  function toggle(key: keyof VisibilityMap, value: boolean) {
    setVisibility((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const profile_privacy: Record<string, string> = {
        bio: visibility.bio ? "public" : "private",
        gender: visibility.gender ? "public" : "private",
        birthday: visibility.birthday ? "public" : "private",
      };
      const updated = await updateProfile({ profile_privacy });
      const v = parsePrivacy(updated.profile_privacy);
      setVisibility(v);
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
  function Row({
    label,
    fieldKey,
    description,
  }: {
    label: string;
    fieldKey: keyof VisibilityMap;
    description?: string;
  }) {
    const isPublic = visibility[fieldKey];
    return (
      <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">{label}</Label>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex items-center rounded-md border border-input overflow-hidden">
          <button
            type="button"
            onClick={() => toggle(fieldKey, true)}
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
            onClick={() => toggle(fieldKey, false)}
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("setting.privacy.title")}</CardTitle>
        <CardDescription>{t("setting.privacy.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-1" noValidate>
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
            <span className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md">
              {t("setting.privacy.public")}
            </span>
          </div>
          <Row label={t("setting.privacy.bio")} fieldKey="bio" />
          <Row label={t("setting.privacy.gender")} fieldKey="gender" />
          <Row label={t("setting.privacy.birthday")} fieldKey="birthday" />

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive mt-4">
              {error}
            </p>
          )}
          {success && (
            <p className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-600 dark:bg-green-950/20 mt-4">
              <CheckCircle2 className="h-4 w-4" />
              {t("setting.privacy.saved")}
            </p>
          )}

          <div className="flex items-center gap-3 pt-4">
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
  );
}
