"use client";

/**
 * 新建账号弹窗：单 Dialog 完成创建，避免页面内嵌表单的跳转与拥挤
 * 创建的账号为管理员代设初始密码，首次登录强制修改（后端 must_change_password）
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createUser } from "@/lib/api/auth";
import type { AdminRole, UserCreatePayload } from "@/types/api";

const ROLE_OPTIONS: AdminRole[] = ["member", "editor", "admin", "super_admin"];

const EMPTY: UserCreatePayload = {
  username: "",
  email: "",
  password: "",
  role: "member",
  student_id: "",
  real_name: "",
  phone: "",
};

export function UserCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<UserCreatePayload>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 关闭时重置表单
  useEffect(() => {
    if (!open) {
      setForm(EMPTY);
      setFieldErrors({});
      setError(null);
    }
  }, [open]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.username.trim()) next.username = t("admin.users.displayNameRequired");
    if (!form.real_name.trim()) next.real_name = t("admin.users.realNameRequired");
    if (!form.student_id.trim()) next.student_id = t("admin.users.studentIdRequired");
    if (!form.phone.trim()) {
      next.phone = t("admin.users.phoneRequired");
    } else if (!/^\+?\d{6,15}$/.test(form.phone.replace(/[\s-]/g, ""))) {
      next.phone = t("admin.users.phoneInvalid");
    }
    if (!form.email.trim()) {
      next.email = t("admin.users.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = t("admin.users.emailInvalid");
    }
    if (form.password.length < 10) next.password = t("admin.users.passwordTooShort");
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      await createUser(form);
      onOpenChange(false);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof UserCreatePayload, label: string, placeholder: string) {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          {label} <span className="text-destructive">*</span>
        </label>
        <Input
          value={(form[key] as string) ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={placeholder}
        />
        {fieldErrors[key] && (
          <p className="text-xs text-destructive">{fieldErrors[key]}</p>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("admin.users.formTitle")}</DialogTitle>
          <DialogDescription>{t("admin.users.createDesc")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field("username", t("admin.users.displayName"), t("admin.users.displayNamePlaceholder"))}
          {field("real_name", t("admin.users.realName"), t("admin.users.realNamePlaceholder"))}
          {field("student_id", t("admin.users.studentId"), t("admin.users.studentIdPlaceholder"))}
          {field("phone", t("admin.users.phone"), t("admin.users.phonePlaceholder"))}
          {field("email", t("admin.users.email"), t("admin.users.emailPlaceholder"))}
          {field("password", t("admin.users.password"), t("admin.users.passwordPlaceholder"))}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("admin.users.role")} <span className="text-destructive">*</span>
            </label>
            <Select
              value={form.role}
              onValueChange={(v) => setForm({ ...form, role: v as AdminRole })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`admin.users.roles.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("admin.users.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("admin.users.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
