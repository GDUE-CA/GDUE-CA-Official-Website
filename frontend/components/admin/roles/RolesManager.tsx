"use client";

/**
 * 角色管理页（V0.5.5 §3.2 + V0.6.3 需求7）
 *
 * - 角色卡片：内置 4 角色 + 自定义角色组；自定义角色组完整 CRUD（manage 权限）
 *   内置保护规则：super_admin 仅查看（矩阵列锁定）；admin/editor/member 无删除入口，
 *   其权限通过矩阵单元格编辑；
 * - 三级权限矩阵：每模块一行、每角色一列，单元格分段按钮 允许=[view,manage] /
 *   只读=[view] / 拒绝=[]，保存调 PUT /matrix 原子生效；无 manage 权限时整表只读；
 * - 权限覆盖账号：列出配置了 permission_overrides 的账号，复用 PermissionMatrixDialog
 *   编辑（账号级覆盖为二级矩阵，保持不动）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import KeyRound from "@/assets/icons/status/key-round.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Plus from "@/assets/icons/action/plus.svg";
import Pencil from "@/assets/icons/action/pencil.svg";
import Trash2 from "@/assets/icons/action/trash-2.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PermissionMatrixDialog, type PermissionMatrixTarget } from "@/components/admin/users/PermissionMatrixDialog";
import { useEffectivePermissions, PERMISSION_MODULES } from "@/lib/permissions";
import {
  createCustomRole,
  deleteCustomRole,
  fetchRoleOverrides,
  fetchRolesOverview,
  saveRolesMatrix,
  updateCustomRole,
} from "@/lib/api/roles";
import type { CustomRoleDef, OverrideUser, RolesOverview } from "@/types/api";
import { cn } from "@/lib/utils";

/** 角色卡片强调色（仅视觉区分，不承载语义） */
const ROLE_ACCENT: Record<string, string> = {
  super_admin: "bg-destructive/10 text-destructive border-destructive/30",
  admin: "bg-primary/10 text-primary border-primary/30",
  editor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  member: "bg-muted text-muted-foreground border-border",
};

/** 自定义角色组卡片强调色 */
const CUSTOM_ACCENT =
  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";

/** 矩阵单元格三级：允许=[view,manage] / 只读=[view] / 拒绝=[] */
type Level = "allow" | "view" | "none";

function actionsToLevel(actions: string[] | undefined): Level {
  if (!actions) return "none";
  if (actions.includes("manage")) return "allow";
  if (actions.includes("view")) return "view";
  return "none";
}

function levelToActions(level: Level): string[] {
  if (level === "allow") return ["view", "manage"];
  if (level === "view") return ["view"];
  return [];
}

const LEVELS: Level[] = ["allow", "view", "none"];
const LEVEL_LABEL_KEY: Record<Level, string> = {
  allow: "admin.rolesPage.levelAllow",
  view: "admin.rolesPage.levelView",
  none: "admin.rolesPage.levelNone",
};
const LEVEL_ACTIVE_CLS: Record<Level, string> = {
  allow: "bg-primary/15 text-primary font-medium",
  view: "bg-muted text-foreground font-medium",
  none: "bg-border text-muted-foreground font-medium",
};

/** 矩阵列：内置角色（id=role key）+ 自定义角色组（id="c:{id}"） */
interface MatrixColumn {
  id: string;
  label: string;
  locked: boolean;
}

export function RolesManager() {
  const { t } = useI18n();
  const lp = useLocalizedPath();
  const { can } = useEffectivePermissions();
  const canManage = can("roles", "manage");

  const [overview, setOverview] = useState<RolesOverview | null>(null);
  const [overrides, setOverrides] = useState<OverrideUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<PermissionMatrixTarget | null>(null);

  // 三级矩阵草稿：列 id -> 模块 -> Level
  const [draft, setDraft] = useState<Record<string, Record<string, Level>>>({});
  const [initial, setInitial] = useState<Record<string, Record<string, Level>>>({});
  const [savingMatrix, setSavingMatrix] = useState(false);

  // 自定义角色组新建/编辑弹窗
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleEditing, setRoleEditing] = useState<CustomRoleDef | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleDeletingId, setRoleDeletingId] = useState<number | null>(null);

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
      // 初始化矩阵草稿（内置 + 自定义）
      const d: Record<string, Record<string, Level>> = {};
      for (const r of ov.roles) {
        d[r.role] = {};
        for (const m of PERMISSION_MODULES) {
          d[r.role][m] = actionsToLevel(r.default_modules[m]);
        }
      }
      for (const c of ov.custom_roles) {
        d[`c:${c.id}`] = {};
        for (const m of PERMISSION_MODULES) {
          d[`c:${c.id}`][m] = actionsToLevel(c.permissions[m]);
        }
      }
      setDraft(d);
      setInitial(d);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns: MatrixColumn[] = useMemo(() => {
    if (!overview) return [];
    return [
      ...overview.roles.map((r) => ({
        id: r.role,
        label: t(`admin.users.roles.${r.role}`),
        locked: r.role === "super_admin",
      })),
      ...overview.custom_roles.map((c) => ({
        id: `c:${c.id}`,
        label: c.name,
        locked: false,
      })),
    ];
  }, [overview, t]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initial),
    [draft, initial]
  );

  function setCell(columnId: string, module: string, level: Level) {
    setDraft((d) => ({
      ...d,
      [columnId]: { ...d[columnId], [module]: level },
    }));
  }

  /** 保存三级矩阵：全量原子提交（super_admin 列不提交） */
  async function handleSaveMatrix() {
    if (!overview) return;
    setSavingMatrix(true);
    setNotice(null);
    try {
      const builtin: Record<string, Record<string, string[]>> = {};
      for (const r of overview.roles) {
        if (r.role === "super_admin") continue;
        builtin[r.role] = {};
        for (const m of PERMISSION_MODULES) {
          builtin[r.role][m] = levelToActions(draft[r.role]?.[m] ?? "none");
        }
      }
      const custom: Record<string, Record<string, string[]>> = {};
      for (const c of overview.custom_roles) {
        custom[String(c.id)] = {};
        for (const m of PERMISSION_MODULES) {
          custom[String(c.id)][m] = levelToActions(draft[`c:${c.id}`]?.[m] ?? "none");
        }
      }
      await saveRolesMatrix({ builtin, custom });
      setNotice(t("admin.rolesPage.matrixSaved"));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingMatrix(false);
    }
  }

  function openCreateRole() {
    setRoleEditing(null);
    setRoleName("");
    setRoleDesc("");
    setRoleError(null);
    setRoleDialogOpen(true);
  }

  function openEditRole(c: CustomRoleDef) {
    setRoleEditing(c);
    setRoleName(c.name);
    setRoleDesc(c.description ?? "");
    setRoleError(null);
    setRoleDialogOpen(true);
  }

  async function handleRoleSave() {
    setRoleError(null);
    if (!roleName.trim()) {
      setRoleError(t("admin.activities.fieldRequired"));
      return;
    }
    setRoleSaving(true);
    try {
      const payload = {
        name: roleName.trim(),
        description: roleDesc.trim() || null,
      };
      if (roleEditing) {
        await updateCustomRole(roleEditing.id, payload);
      } else {
        await createCustomRole(payload);
      }
      setRoleDialogOpen(false);
      await load();
    } catch (e) {
      setRoleError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setRoleSaving(false);
    }
  }

  async function handleRoleDelete(c: CustomRoleDef) {
    if (
      !confirm(
        t("admin.rolesPage.deleteConfirm")
          .replace("{name}", c.name)
          .replace("{count}", String(c.user_count))
      )
    )
      return;
    setRoleDeletingId(c.id);
    try {
      await deleteCustomRole(c.id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setRoleDeletingId(null);
    }
  }

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

      {notice && (
        <p className="text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-md">
          {notice}
        </p>
      )}

      {/* 角色定义卡片（内置 + 自定义角色组） */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t("admin.rolesPage.roleDefsTitle")}</h2>
          {canManage && (
            <Button size="sm" onClick={openCreateRole}>
              <Plus className="h-4 w-4 mr-1" />
              {t("admin.rolesPage.addRole")}
            </Button>
          )}
        </div>
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
          {overview.custom_roles.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-border bg-background p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <Badge variant="outline" className={CUSTOM_ACCENT}>
                  {c.name}
                </Badge>
                {canManage && (
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEditRole(c)}
                      aria-label={t("admin.rolesPage.customRoleEdit")}
                      title={t("admin.rolesPage.customRoleEdit")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleRoleDelete(c)}
                      disabled={roleDeletingId === c.id}
                      aria-label={t("admin.rolesPage.customRoleDelete")}
                      title={t("admin.rolesPage.customRoleDelete")}
                    >
                      {roleDeletingId === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {t("admin.rolesPage.memberCount", { count: c.user_count })}
              </div>
              {c.description && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {c.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 三级权限矩阵 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{t("admin.rolesPage.matrixTitle")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("admin.rolesPage.matrixHint")}
            </p>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              {dirty && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {t("admin.rolesPage.matrixDirtyHint")}
                </span>
              )}
              <Button
                size="sm"
                onClick={handleSaveMatrix}
                disabled={!dirty || savingMatrix}
              >
                {savingMatrix && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t("admin.rolesPage.matrixSave")}
              </Button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-background">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr className="text-left">
                <th className="px-4 py-2.5 font-medium text-muted-foreground">
                  {t("admin.rolesPage.colModule")}
                </th>
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className="px-4 py-2.5 text-center font-medium text-muted-foreground"
                  >
                    {col.label}
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
                  {columns.map((col) => {
                    const level = draft[col.id]?.[mod] ?? "none";
                    // 只读模式（无 manage 权限）或锁定列（super_admin）：静态徽章
                    if (!canManage || col.locked) {
                      return (
                        <td key={col.id} className="px-4 py-2.5 text-center">
                          <span
                            className={cn(
                              "inline-block rounded-md px-2 py-0.5 text-xs font-medium",
                              level === "allow" && "bg-primary/10 text-primary",
                              level === "view" && "bg-muted text-muted-foreground",
                              level === "none" && "text-muted-foreground/40"
                            )}
                          >
                            {level === "allow"
                              ? t("admin.rolesPage.levelAllow")
                              : level === "view"
                                ? t("admin.rolesPage.levelView")
                                : t("admin.rolesPage.actionNone")}
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td key={col.id} className="px-4 py-2.5 text-center">
                        <div
                          className="inline-flex overflow-hidden rounded-md border border-border"
                          role="group"
                          aria-label={`${col.label} · ${t(`admin.permissions.modules.${mod}`)}`}
                        >
                          {LEVELS.map((lv) => (
                            <button
                              key={lv}
                              type="button"
                              onClick={() => setCell(col.id, mod, lv)}
                              aria-pressed={level === lv}
                              className={cn(
                                "px-1.5 py-0.5 text-[11px] leading-4 transition-colors",
                                level === lv
                                  ? LEVEL_ACTIVE_CLS[lv]
                                  : "text-muted-foreground/60 hover:bg-muted"
                              )}
                            >
                              {t(LEVEL_LABEL_KEY[lv])}
                            </button>
                          ))}
                        </div>
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

      {/* 自定义角色组 新建/编辑弹窗（权限在矩阵区配置） */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {roleEditing
                ? t("admin.rolesPage.dialogEditTitle")
                : t("admin.rolesPage.dialogCreateTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom-role-name">{t("admin.rolesPage.fieldName")}</Label>
              <Input
                id="custom-role-name"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder={t("admin.rolesPage.fieldNamePlaceholder")}
                maxLength={64}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-role-desc">{t("admin.rolesPage.fieldDesc")}</Label>
              <Textarea
                id="custom-role-desc"
                rows={3}
                value={roleDesc}
                onChange={(e) => setRoleDesc(e.target.value)}
                placeholder={t("admin.rolesPage.fieldDescPlaceholder")}
                maxLength={200}
              />
            </div>
            {roleError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {roleError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleRoleSave} disabled={roleSaving}>
                {roleSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
