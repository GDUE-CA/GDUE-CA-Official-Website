"use client";

/**
 * /admin/users - 人员管理
 *
 * - 筛选（搜索/角色/状态）+ 状态启停 + 重置密码 + 权限矩阵 + 创建账号（Dialog）
 * - 所有角色可见自己的信息并可编辑；super_admin 可管理所有人
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2,
  Trash2,
  Plus,
  Pencil,
  Power,
  PowerOff,
  ShieldCheck,
  Shield,
  UserPen,
  UserRound,
  X,
  KeyRound,
  SlidersHorizontal,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  listUsers,
  batchUpdateUsers,
  deleteUser,
  updateUser,
  fetchProfile,
} from "@/lib/api/auth";
import { BatchBar } from "@/components/admin/review/BatchBar";
import { useBatchSelection } from "@/components/admin/review/useBatchSelection";
import { UserFilterBar, type UserFilters } from "@/components/admin/users/UserFilterBar";
import { UserCreateDialog } from "@/components/admin/users/UserCreateDialog";
import { ResetPasswordDialog } from "@/components/admin/users/ResetPasswordDialog";
import { PermissionMatrixDialog } from "@/components/admin/users/PermissionMatrixDialog";
import type { AdminUser, AdminRole, UserUpdatePayload } from "@/types/api";

export default function UsersPage() {
  const { t } = useI18n();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [myId, setMyId] = useState<number | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState<UserFilters>({ q: "", role: "all", active: "all" });
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<UserUpdatePayload>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [permTarget, setPermTarget] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 筛选防抖触发
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  const load = useCallback(async (f?: UserFilters) => {
    const filter = f;
    setLoading(true);
    setError(null);
    try {
      const me = await fetchProfile();
      setMyId(me.id);
      setIsSuperAdmin(me.role === "super_admin");
      const canList = me.role !== "member";
      if (canList) {
        const list = await listUsers({
          q: filter?.q || undefined,
          role: filter && filter.role !== "all" ? filter.role : undefined,
          is_active:
            filter && filter.active !== "all" ? filter.active === "active" : undefined,
        });
        // 非 super_admin 不展示 super_admin 账号
        setUsers(me.role === "super_admin" ? list : list.filter((u) => u.role !== "super_admin"));
      } else {
        setUsers([me]);
      }
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(filters), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  function startEdit(u: AdminUser) {
    setEditingId(u.id);
    setEditForm({
      username: u.username,
      real_name: u.real_name,
      student_id: u.student_id,
      phone: u.phone,
      role: u.role as AdminRole,
      is_active: u.is_active,
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  async function handleSaveEdit(id: number) {
    setSaving(true);
    setError(null);
    try {
      await updateUser(id, editForm);
      setEditingId(null);
      setEditForm({});
      await load(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("admin.users.deleteConfirm"))) return;
    setDeletingId(id);
    setError(null);
    try {
      await deleteUser(id);
      await load(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleActive(u: AdminUser, next: boolean) {
    setTogglingId(u.id);
    setError(null);
    try {
      await updateUser(u.id, { is_active: next });
      await load(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTogglingId(null);
    }
  }

  function roleBadge(role: string) {
    if (role === "member")
      return (
        <Badge variant="outline" className="gap-1">
          <UserRound className="h-3 w-3" />
          {t("admin.users.roles.member")}
        </Badge>
      );
    if (role === "super_admin")
      return (
        <Badge variant="default" className="gap-1">
          <ShieldCheck className="h-3 w-3" />
          {t("admin.users.roles.super_admin")}
        </Badge>
      );
    if (role === "admin")
      return (
        <Badge variant="secondary" className="gap-1">
          <Shield className="h-3 w-3" />
          {t("admin.users.roles.admin")}
        </Badge>
      );
    return (
      <Badge variant="outline" className="gap-1">
        <UserPen className="h-3 w-3" />
        {t("admin.users.roles.editor")}
      </Badge>
    );
  }

  const canEdit = (u: AdminUser) => isSuperAdmin || u.id === myId;
  const canDelete = (u: AdminUser) => isSuperAdmin && u.id !== myId;
  const canResetPwd = (u: AdminUser) => isSuperAdmin && u.id !== myId;
  const canPerm = (u: AdminUser) =>
    isSuperAdmin && u.id !== myId && u.role !== "super_admin";
  const canToggleActive = (u: AdminUser) => isSuperAdmin && u.id !== myId;

  // 批量启停：仅 super_admin 可选他人（自己不可选，后端同样拒绝含自己的请求）
  const [batching, setBatching] = useState(false);
  const selection = useBatchSelection(users, canToggleActive);

  async function handleBatch(next: boolean) {
    const ids = [...selection.selected];
    if (ids.length === 0) return;
    if (!next && !confirm(t("admin.users.batchDisableConfirm", { count: ids.length }))) return;
    setBatching(true);
    setError(null);
    try {
      await batchUpdateUsers(ids, next);
      selection.clear();
      await load(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatching(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">
            {t("admin.users.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSuperAdmin
              ? t("admin.users.subtitleSuper")
              : t("admin.users.subtitle")}
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("admin.users.create")}
          </Button>
        )}
      </div>

      {/* 筛选栏（可查看全员时显示） */}
      {!loading && users.length > 0 && (
        <UserFilterBar filters={filters} onChange={setFilters} />
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {/* 用户列表 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {filters.q || filters.role !== "all" || filters.active !== "all"
              ? t("admin.users.emptyFiltered")
              : t("admin.users.empty")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr className="text-left">
                    {isSuperAdmin && (
                      <th className="px-3 py-3 w-[4%]">
                        <input
                          type="checkbox"
                          checked={selection.allSelected}
                          onChange={selection.toggleAll}
                          className="h-4 w-4 accent-primary cursor-pointer"
                          aria-label={t("admin.users.batchSelected", { count: selection.selected.size })}
                        />
                      </th>
                    )}
                    <th className="px-3 py-3 font-medium text-muted-foreground w-[12%]">{t("admin.users.colDisplayName")}</th>
                    <th className="px-3 py-3 font-medium text-muted-foreground w-[11%]">{t("admin.users.colRealName")}</th>
                    <th className="px-3 py-3 font-medium text-muted-foreground w-[11%]">{t("admin.users.colStudentId")}</th>
                    <th className="px-3 py-3 font-medium text-muted-foreground w-[13%]">{t("admin.users.colPhone")}</th>
                    <th className="px-3 py-3 font-medium text-muted-foreground w-[15%]">{t("admin.users.colEmail")}</th>
                    <th className="px-3 py-3 font-medium text-muted-foreground w-[12%]">{t("admin.users.colRole")}</th>
                    <th className="px-3 py-3 font-medium text-muted-foreground w-[9%]">{t("admin.users.colStatus")}</th>
                    <th className="px-3 py-3 font-medium text-muted-foreground text-right w-[13%]">{t("admin.users.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20 align-top">
                      {isSuperAdmin && (
                        <td className="px-3 py-3">
                          {editingId === u.id ? null : canToggleActive(u) ? (
                            <input
                              type="checkbox"
                              checked={selection.selected.has(u.id)}
                              onChange={() => selection.toggle(u.id)}
                              className="h-4 w-4 accent-primary cursor-pointer"
                              aria-label={u.username}
                            />
                          ) : null}
                        </td>
                      )}
                      {editingId === u.id ? (
                        /* 编辑行 */
                        <>
                          <td className="px-3 py-3">
                            <Input
                              value={editForm.username ?? ""}
                              onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                              className="h-8"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <Input
                              value={editForm.real_name ?? ""}
                              onChange={(e) => setEditForm({ ...editForm, real_name: e.target.value })}
                              className="h-8"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <Input
                              value={editForm.student_id ?? ""}
                              onChange={(e) => setEditForm({ ...editForm, student_id: e.target.value })}
                              className="h-8"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <Input
                              value={editForm.phone ?? ""}
                              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                              className="h-8"
                            />
                          </td>
                          <td className="px-3 py-3 text-muted-foreground text-xs truncate">{u.email}</td>
                          <td className="px-3 py-3">
                            {isSuperAdmin ? (
                              <select
                                value={editForm.role ?? "member"}
                                onChange={(e) => setEditForm({ ...editForm, role: e.target.value as AdminRole })}
                                className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                              >
                                {(["super_admin", "admin", "editor", "member"] as AdminRole[]).map((r) => (
                                  <option key={r} value={r}>
                                    {t(`admin.users.roles.${r}`)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              roleBadge(u.role)
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant={u.is_active ? "outline" : "secondary"} className={u.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                              {u.is_active ? t("admin.users.statusActive") : t("admin.users.statusDisabled")}
                            </Badge>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                onClick={() => handleSaveEdit(u.id)}
                                disabled={saving}
                              >
                                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                {t("admin.users.save")}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={cancelEdit}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        /* 只读行 */
                        <>
                          <td className="px-3 py-3 font-medium truncate">
                            {u.username}
                            {u.id === myId && (
                              <span className="ml-2 text-xs text-muted-foreground">({t("admin.users.you")})</span>
                            )}
                          </td>
                          <td className="px-3 py-3 truncate">{u.real_name}</td>
                          <td className="px-3 py-3 font-mono text-xs truncate">{u.student_id}</td>
                          <td className="px-3 py-3 font-mono text-xs truncate">{u.phone}</td>
                          <td className="px-3 py-3 text-muted-foreground truncate">{u.email}</td>
                          <td className="px-3 py-3">{roleBadge(u.role)}</td>
                          <td className="px-3 py-3">
                            {canToggleActive(u) ? (
                              <input
                                type="checkbox"
                                checked={u.is_active}
                                disabled={togglingId === u.id}
                                onChange={(e) => handleToggleActive(u, e.target.checked)}
                                className="h-4 w-4 accent-primary cursor-pointer"
                                aria-label={t("admin.users.colStatus")}
                                title={u.is_active ? t("admin.users.statusActive") : t("admin.users.statusDisabled")}
                              />
                            ) : (
                              <Badge variant={u.is_active ? "outline" : "secondary"} className={u.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                                {u.is_active ? t("admin.users.statusActive") : t("admin.users.statusDisabled")}
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-1">
                              {canEdit(u) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => startEdit(u)}
                                  aria-label="edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {canPerm(u) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setPermTarget(u)}
                                  title={t("admin.users.permBtn")}
                                  aria-label={t("admin.users.permBtn")}
                                >
                                  <SlidersHorizontal className="h-4 w-4" />
                                </Button>
                              )}
                              {canResetPwd(u) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setResetTarget(u)}
                                  title={t("admin.users.resetPwdBtn")}
                                  aria-label={t("admin.users.resetPwdBtn")}
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                              )}
                              {canDelete(u) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(u.id)}
                                  disabled={deletingId === u.id}
                                  aria-label="delete"
                                >
                                  {deletingId === u.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 批量操作浮栏 */}
      {selection.someSelected && (
        <BatchBar
          countLabel={t("admin.users.batchSelected", { count: selection.selected.size })}
          loading={batching}
          actions={[
            { key: "enable", label: t("admin.users.batchEnable"), icon: Power, onClick: () => handleBatch(true) },
            { key: "disable", label: t("admin.users.batchDisable"), icon: PowerOff, variant: "destructive", onClick: () => handleBatch(false) },
          ]}
          cancelLabel={t("admin.users.cancel")}
          onCancel={selection.clear}
        />
      )}

      {/* 新建账号弹窗 */}
      <UserCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => load(filters)}
      />

      {/* 重置密码弹窗 */}
      <ResetPasswordDialog user={resetTarget} onOpenChange={(o) => !o && setResetTarget(null)} />

      {/* 权限矩阵弹窗 */}
      <PermissionMatrixDialog
        user={permTarget}
        onOpenChange={(o) => !o && setPermTarget(null)}
        onSaved={() => load(filters)}
      />
    </div>
  );
}
