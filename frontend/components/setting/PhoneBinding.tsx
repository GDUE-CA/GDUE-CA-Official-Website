"use client";

/**
 * PhoneBinding —— 绑定手机号（/setting/security/phone）
 *
 * 展示当前绑定（脱敏）+ 更新手机号；PUT /api/auth/profile { phone }，
 * 后端 profile.update 写审计日志。手机号同时是账号找回凭证。
 */
import { useEffect, useRef, useState } from "react";
import CheckCircle2 from "@/assets/icons/status/check-circle-2.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Phone from "@/assets/icons/status/phone.svg";
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
import { useDirtyGuard } from "@/components/setting/SettingGuardContext";
import { fetchProfile, updateProfile } from "@/lib/api/auth";

const PAGE_KEY = "phone-binding";
const PHONE_RE = /^\+?[0-9\- ]{5,32}$/;

/** 手机号脱敏：保留前 3 位与后 2 位 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
}

export function PhoneBinding() {
  const { t } = useI18n();
  const { registerDirty } = useDirtyGuard();

  const [boundPhone, setBoundPhone] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const initialRef = useRef("");

  useEffect(() => {
    (async () => {
      try {
        const p = await fetchProfile();
        setBoundPhone(p.phone ?? "");
        setPhone(p.phone ?? "");
        initialRef.current = p.phone ?? "";
      } catch (err) {
        setError(err instanceof Error ? err.message : t("common.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = phone.trim() !== initialRef.current;
  const valid = PHONE_RE.test(phone.trim());

  useEffect(() => {
    registerDirty(PAGE_KEY, dirty);
    return () => registerDirty(PAGE_KEY, false);
  }, [dirty, registerDirty]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!valid) {
      setError(t("setting.bindPhone.invalid"));
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProfile({ phone: phone.trim() });
      setBoundPhone(updated.phone ?? "");
      setPhone(updated.phone ?? "");
      initialRef.current = updated.phone ?? "";
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Phone className="h-4 w-4" />
          {t("setting.bindPhone.title")}
        </CardTitle>
        <CardDescription>{t("setting.bindPhone.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 rounded-md bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("setting.bindPhone.current")}：</span>
          <span className="font-medium">{boundPhone ? maskPhone(boundPhone) : t("setting.bindPhone.none")}</span>
        </div>
        <form onSubmit={handleSave} className="space-y-4 max-w-md" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="phone-input">{t("setting.bindPhone.newPhone")}</Label>
            <Input
              id="phone-input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("profile.phonePlaceholder")}
              maxLength={32}
              inputMode="tel"
            />
            {phone.trim() !== "" && !valid && (
              <p className="text-xs text-destructive">{t("setting.bindPhone.invalid")}</p>
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
              {t("setting.bindPhone.saved")}
            </p>
          )}

          <Button type="submit" disabled={saving || !dirty || !valid}>
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
      </CardContent>
    </Card>
  );
}
