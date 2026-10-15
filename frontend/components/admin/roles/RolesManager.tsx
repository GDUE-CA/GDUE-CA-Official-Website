"use client";

/**
 * 角色管理页（V0.5.5 §3.2）
 *
 * - 角色为系统内置（lib/permissions.ts ROLE_DEFAULTS），页面不提供角色 CRUD；
 * - 只读展示：4 角色成员分布 + 默认权限矩阵（模块 × 角色）；
 * - 权限覆盖：列出配置了 permission_overrides 的账号，点击复用
 *   PermissionMatrixDialog 编辑（roles.manage，仅 super_admin；无 manage 权限时只读，
 *   前端不做任何硬置灰/disable 锁死，入口可见性即后端鉴权结果）。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import KeyRound from "@/assets/icons/status/key-round.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PermissionMatrixDialog, type PermissionMatrixTarget } from "@/components/admin/users/PermissionMatrixDialog";
import { useEffectivePermissions, PERMISSION_MODULES } from "@/lib/permissions";
import { fetchRoleOverrides, fetchRolesOverview } from "@/lib/api/roles";
import type { OverrideUser, RolesOverview } from "@/types/api";
import { cn } from "@/lib/utils";

/** 角色卡片强调色（仅视觉区分，不承载语义） */
const ROLE_ACCENT: Record<string, string> = {
  super_admin: "bg-destructive/10 text-destructive border-destructive/30",
  admin: "bg-primary/10 text-primary border-primary/30",
  editor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  member: "bg-muted text-muted-foreground border-border",
};

export function RolesManager() {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const { can } = useEffectivePermissions();
  const canManage = can("roles", "manage");

  const [overview, setOverview] = useState<RolesOverview | null>(null);
  const [overrides, setOverrides] = useState<OverrideUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<PermissionMatrixTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [ov, list] = await Promise.all([
        fetchRolesOverview(),
        fetchRoleOverrides(),
      ]);
      setOverview(ov);
      setOverrides(list);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.rolesPage.title")}</h1>
        <div className="rounded-lg border border-border bg-background p-10 text-center">
          <p className="text-sm text-destructive mb-4">{t("admin.rolesPage.loadError")}</p>
          <Button variant="outline" onClick={load}>
            {t("common.refresh")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <KeyRound className="h-6 w-6 text-primary" />
          {t("admin.rolesPage.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.rolesPage.subtitle")}
        </p>
      </div>

      {/* 角色定义卡片 */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">{t("admin.rolesPage.roleDefsTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {overview.roles.map((r) => (
            <div
              key={r.role}
              className="rounded-xl border border-border bg-background p-4"
            >
              <Badge
                variant="outline"
                className={cn("mb-3", ROLE_ACCENT[r.role] ?? ROLE_ACCENT.member)}
              >
                {t(`admin.users.roles.${r.role}`)}
              </Badge>
              <div className="text-sm text-muted-foreground">
                {t("admin.rolesPage.memberCount", { count: r.user_count })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 默认权限矩阵（只读） */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">{t("admin.rolesPage.matrixTitle")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("admin.rolesPage.matrixHint")}
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-background">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr className="text-left">
                <th className="px-4 py-2.5 font-medium text-muted-foreground">
                  {t("admin.rolesPage.colModule")}
                </th>
                {overview.roles.map((r) => (
                  <th
                    key={r.role}
                    className="px-4 py-2.5 text-center font-medium text-muted-foreground"
                  >
                    {t(`admin.users.roles.${r.role}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MODULES.map((mod) => (
                <tr key={mod} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                    {t(`admin.permissions.modules.${mod}`)}
                  </td>
                  {overview.roles.map((r) => {
                    const actions = r.default_modules[mod] ?? [];
                    const level = actions.includes("manage")
                      ? "manage"
                      : actions.includes("view")
                        ? "view"
                        : "none";
                    return (
                      <td key={r.role} className="px-4 py-2.5 text-center">
                        <span
                          className={cn(
                            "inline-block rounded-md px-2 py-0.5 text-xs font-medium",
                            level === "manage" &&
                              "bg-primary/10 text-primary",
                            level === "view" &&
                              "bg-muted text-muted-foreground",
                            level === "none" &&
                              "text-muted-foreground/40"
                          )}
                        >
                          {level === "manage"
                            ? t("admin.rolesPage.actionManage")
                            : level === "view"
                              ? t("admin.rolesPage.actionView")
                              : t("admin.rolesPage.actionNone")}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 权限覆盖账号 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{t("admin.rolesPage.overridesTitle")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("admin.rolesPage.overridesDesc")}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={lp("/admin/users")}>{t("admin.rolesPage.goUsers")}</Link>
          </Button>
        </div>
        {!canManage && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t("admin.rolesPage.manageHint")}
          </div>
        )}
        {overrides.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            {t("admin.rolesPage.emptyOverrides")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-background">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">
                    {t("admin.rolesPage.colUser")}
                  </th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">
                    {t("admin.rolesPage.colRole")}
                  </th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">
                    {t("admin.rolesPage.colModules")}
                  </th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">
                    {t("admin.rolesPage.colStatus")}
                  </th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {overrides.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{u.display_name || u.username}</div>
                      {u.display_name && (
                        <div className="text-xs text-muted-foreground">@{u.username}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={ROLE_ACCENT[u.role] ?? ROLE_ACCENT.member}
                      >
                        {t(`admin.users.roles.${u.role}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {t("admin.rolesPage.moduleCount", {
                        count: Object.keys(u.permission_overrides).length,
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      {u.is_active ? (
                        <span className="text-xs text-green-600 dark:text-green-400">
                          {t("admin.rolesPage.statusActive")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t("admin.rolesPage.statusDisabled")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {/* V0.5.5 §3.2：前端不硬置灰/不锁死；能否写入由后端强制鉴权（403 由弹窗呈现） */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setEditing({
                            id: u.id,
                            username: u.username,
                            role: u.role,
                            permission_overrides: u.permission_overrides,
                          })
                        }
                      >
                        {t("admin.rolesPage.edit")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PermissionMatrixDialog
        user={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}
