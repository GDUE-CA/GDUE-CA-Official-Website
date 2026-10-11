"use client";

/**
 * 权限矩阵弹窗：模块 × 动作（查看/管理）细粒度权限覆盖
 *
 * - 未勾选的模块使用角色默认权限（ROLE_DEFAULTS）
 * - 提供预设角色模板（审核管理员 / 活动管理员）快速填充
 * - 仅 super_admin 可操作，且不能修改自己的覆盖（与后端校验一致）
 */
import { useEffect, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateUser } from "@/lib/api/auth";
import {
  PERMISSION_MODULES,
  ROLE_DEFAULTS,
  type PermissionAction,
} from "@/lib/permissions";
import type { AdminUser } from "@/types/api";

/** 预设角色模板（super_admin 恒有全权限，无需模板） */
const PRESETS: { key: string; overrides: Record<string, string[]> }[] = [
  {
    key: "review",
    overrides: {
      dashboard: ["view"],
      activities: ["view"],
      "review.registrations": ["view", "manage"],
      "review.bugs": ["view", "manage"],
      "review.resets": ["view", "manage"],
    },
  },
  {
    key: "activity",
    overrides: {
      dashboard: ["view"],
      activities: ["view", "manage"],
      "review.bugs": ["view"],
    },
  },
];

function actionChecked(
  overrides: Record<string, string[]>,
  mod: string,
  action: PermissionAction
): boolean {
  return (overrides[mod] ?? []).includes(action);
}

export function PermissionMatrixDialog({
  user,
  onOpenChange,
  onSaved,
}: {
  user: AdminUser | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 打开时以该账号当前覆盖初始化
  useEffect(() => {
    if (user) {
      setOverrides(user.permission_overrides ? { ...user.permission_overrides } : {});
      setError(null);
    }
  }, [user]);

  function toggleAction(mod: string, action: PermissionAction) {
    setOverrides((prev) => {
      const actions = new Set(prev[mod] ?? []);
      if (actions.has(action)) actions.delete(action);
      else actions.add(action);
      const next = { ...prev };
      if (actions.size === 0) delete next[mod];
      else next[mod] = Array.from(actions);
      return next;
    });
  }

  function applyPreset(preset: Record<string, string[]>) {
    setOverrides({ ...preset });
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await updateUser(user.id, { permission_overrides: overrides });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const role = (user?.role ?? "member") as keyof typeof ROLE_DEFAULTS;

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("admin.users.permTitle")}</DialogTitle>
          <DialogDescription>
            {t("admin.users.permDesc", { name: user?.username ?? "" })}
          </DialogDescription>
        </DialogHeader>

        {/* 预设模板 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Wand2 className="h-3.5 w-3.5" />
            {t("admin.users.permPresetsLabel")}
          </span>
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(p.overrides)}
            >
              {t(`admin.users.permPreset_${p.key}`)}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOverrides({})}
            className="text-muted-foreground"
          >
            {t("admin.users.permPresetClear")}
          </Button>
        </div>

        {/* 权限矩阵 */}
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-muted-foreground">
                  {t("admin.permissions.moduleCol")}
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground w-20 text-center">
                  {t("admin.permissions.actions.view")}
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground w-20 text-center">
                  {t("admin.permissions.actions.manage")}
                </th>
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MODULES.map((mod) => {
                const defaults = ROLE_DEFAULTS[role]?.[mod] ?? [];
                const hasDefaultView = defaults.includes("view");
                const hasDefaultManage = defaults.includes("manage");
                const defaultHint = hasDefaultManage
                  ? t("admin.users.permDefaultFull")
                  : hasDefaultView
                    ? t("admin.users.permDefaultView")
                    : t("admin.users.permDefaultNone");
                return (
                  <tr key={mod} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">
                        {t(`admin.permissions.modules.${mod}`)}
                      </div>
                      <div className="text-xs text-muted-foreground">{defaultHint}</div>
                    </td>
                    {(["view", "manage"] as PermissionAction[]).map((action) => (
                      <td key={action} className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={actionChecked(overrides, mod, action)}
                          onChange={() => toggleAction(mod, action)}
                          className="h-4 w-4 accent-primary cursor-pointer"
                          aria-label={`${t(`admin.permissions.modules.${mod}`)} ${t(`admin.permissions.actions.${action}`)}`}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("admin.users.permSave")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
