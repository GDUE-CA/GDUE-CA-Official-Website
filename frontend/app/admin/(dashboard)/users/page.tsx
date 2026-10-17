"use client";

/**
 * /admin/users - 人员管理
 *
 * - 筛选（搜索/角色/状态）+ 状态启停 + 重置密码 + 权限矩阵 + 创建账号（Dialog）
 * - 所有角色可见自己的信息并可编辑；super_admin 可管理所有人
 */
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Trash2 from "@/assets/icons/action/trash-2.svg";
import Plus from "@/assets/icons/action/plus.svg";
import Pencil from "@/assets/icons/action/pencil.svg";
import Power from "@/assets/icons/action/power.svg";
import PowerOff from "@/assets/icons/action/power-off.svg";
import ShieldCheck from "@/assets/icons/status/shield-check.svg";
import Shield from "@/assets/icons/status/shield.svg";
import UserPen from "@/assets/icons/user/user-pen.svg";
import UserRound from "@/assets/icons/user/user-round.svg";
import X from "@/assets/icons/action/x.svg";
import KeyRound from "@/assets/icons/status/key-round.svg";
import SlidersHorizontal from "@/assets/icons/action/sliders-horizontal.svg";
import IdCard from "@/assets/icons/status/id-card.svg";
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
  fetchMe,
} from "@/lib/api/auth";
import { BatchBar } from "@/components/admin/review/BatchBar";
import { useBatchSelection } from "@/components/admin/review/useBatchSelection";
import { AdminList } from "@/components/admin/shared/AdminList";
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
  const [isBreakGlass, setIsBreakGlass] = useState(false);
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
      const me = await fetchMe();
      setMyId(me.id);
      setIsSuperAdmin(me.role === "super_admin");
      setIsBreakGlass(!!me.is_break_glass);
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
      student_id: u.student_id ?? undefined,
      phone: u.phone ?? undefined,
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
    const target = users.find((u) => u.id === id);
    const targetName = target?.username ?? `#${id}`;
    if (!confirm(t("admin.users.deleteConfirm"))) return;
    // Break-Glass：额外强确认——要求输入目标用户名
    if (isBreakGlass) {
      const input = prompt(
        `⚠️ 您当前以 Break-Glass 应急账号执行高风险操作\n\n此操作将永久删除账号「${targetName}」，无法恢复。\n\n请输入目标用户名 "${targetName}" 以确认删除：`,
      );
      if (input?.trim() !== targetName) return;
    }
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
            <AdminList<AdminUser>
              rows={users}
              rowKey={(u) => u.id}
              tableClassName="w-full table-fixed text-sm"
              selectable={isSuperAdmin}
              selectedKeys={selection.selected}
              allSelected={selection.allSelected}
              indeterminate={selection.someSelected && !selection.allSelected}
              onToggleAll={selection.toggleAll}
              onToggleOne={(u) => selection.toggle(u.id)}
              isRowSelectable={(u) => editingId !== u.id && canToggleActive(u)}
              selectAllLabel={t("admin.users.batchSelected", { count: selection.selected.size })}
              checkboxAriaLabel={(u) => u.username}
              actionsHeader={t("admin.users.colActions")}
              actionsHeaderClassName="w-[13%]"
              mobileTitle={(u) => (
                <>
                  {u.username}
                  {u.id === myId && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({t("admin.users.you")})
                    </span>
                  )}
                </>
              )}
              mobileBadge={(u) => roleBadge(u.role)}
              columns={[
                {
                  key: "username",
                  header: t("admin.users.colDisplayName"),
                  headerClassName: "w-[12%]",
                  cellClassName: "font-medium truncate",
                  mobileLabel: t("admin.users.colDisplayName"),
                  render: (u) =>
                    editingId === u.id ? (
                      <Input
                        value={editForm.username ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                        className="h-8"
                      />
                    ) : (
                      u.username
                    ),
                },
                {
                  key: "real_name",
                  header: t("admin.users.colRealName"),
                  headerClassName: "w-[11%]",
                  cellClassName: "truncate",
                  mobileLabel: t("admin.users.colRealName"),
                  render: (u) =>
                    editingId === u.id ? (
                      <Input
                        value={editForm.real_name ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, real_name: e.target.value })}
                        className="h-8"
                      />
                    ) : (
                      u.real_name
                    ),
                },
                {
                  key: "student_id",
                  header: t("admin.users.colStudentId"),
                  headerClassName: "w-[11%]",
                  cellClassName: "font-mono text-xs truncate",
                  mobileLabel: t("admin.users.colStudentId"),
                  mobileMono: true,
                  render: (u) =>
                    editingId === u.id ? (
                      <Input
                        value={editForm.student_id ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, student_id: e.target.value })}
                        className="h-8"
                      />
                    ) : (
                      u.student_id
                    ),
                },
                {
                  key: "phone",
                  header: t("admin.users.colPhone"),
                  headerClassName: "w-[13%]",
                  cellClassName: "font-mono text-xs truncate",
                  mobileLabel: t("admin.users.colPhone"),
                  mobileMono: true,
                  render: (u) =>
                    editingId === u.id ? (
                      <Input
                        value={editForm.phone ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className="h-8"
                      />
                    ) : (
                      u.phone
                    ),
                },
                {
                  key: "email",
                  header: t("admin.users.colEmail"),
                  headerClassName: "w-[15%]",
                  cellClassName: "text-muted-foreground truncate",
                  mobileLabel: t("admin.users.colEmail"),
                  render: (u) =>
                    editingId === u.id ? (
                      <span className="text-muted-foreground text-xs truncate">{u.email}</span>
                    ) : (
                      u.email
                    ),
                },
                {
                  key: "role",
                  header: t("admin.users.colRole"),
                  headerClassName: "w-[12%]",
                  // 角色徽标已在移动端卡片右上角展示，键值区不重复
                  render: (u) =>
                    editingId === u.id ? (
                      isSuperAdmin ? (
                        <select
                          value={editForm.role ?? "member"}
                          onChange={(e) =>
                            setEditForm({ ...editForm, role: e.target.value as AdminRole })
                          }
                          className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                        >
                          {(["super_admin", "admin", "editor", "member"] as AdminRole[]).map(
                            (r) => (
                              <option key={r} value={r}>
                                {t(`admin.users.roles.${r}`)}
                              </option>
                            )
                          )}
                        </select>
                      ) : (
                        roleBadge(u.role)
                      )
                    ) : (
                      roleBadge(u.role)
                    ),
                },
                {
                  key: "status",
                  header: t("admin.users.colStatus"),
                  headerClassName: "w-[9%]",
                  mobileLabel: t("admin.users.colStatus"),
                  mobileRender: (u) =>
                    u.is_active
                      ? t("admin.users.statusActive")
                      : t("admin.users.statusDisabled"),
                  render: (u) =>
                    editingId === u.id ? (
                      <Badge
                        variant={u.is_active ? "outline" : "secondary"}
                        className={
                          u.is_active
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        }
                      >
                        {u.is_active
                          ? t("admin.users.statusActive")
                          : t("admin.users.statusDisabled")}
                      </Badge>
                    ) : canToggleActive(u) ? (
                      <input
                        type="checkbox"
                        checked={u.is_active}
                        disabled={togglingId === u.id}
                        onChange={(e) => handleToggleActive(u, e.target.checked)}
                        className="h-4 w-4 accent-primary cursor-pointer"
                        aria-label={t("admin.users.colStatus")}
                        title={
                          u.is_active
                            ? t("admin.users.statusActive")
                            : t("admin.users.statusDisabled")
                        }
                      />
                    ) : (
                      <Badge
                        variant={u.is_active ? "outline" : "secondary"}
                        className={
                          u.is_active
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        }
                      >
                        {u.is_active
                          ? t("admin.users.statusActive")
                          : t("admin.users.statusDisabled")}
                      </Badge>
                    ),
                },
              ]}
              actions={(u) =>
                editingId === u.id ? (
                  <>
                    <Button size="sm" onClick={() => handleSaveEdit(u.id)} disabled={saving}>
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {t("admin.users.save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      title={t("admin.users.detailBtn")}
                      aria-label={t("admin.users.detailBtn")}
                    >
                      <Link href={`/admin/users/${u.id}`}>
                        <IdCard className="h-4 w-4" />
                      </Link>
                    </Button>
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
                  </>
                )
              }
            />
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
