"use client";

/**
 * /admin/users/[id] - 用户详情页
 *
 * - 基本信息卡：账号资料只读展示 + 社团职务（club_position，仅 super_admin 可改，纯展示与权限解耦）
 * - 用户徽章管理：系统徽章只读（跟随角色自动生成）；自定义徽章增删改 + 上下移排序，active 上限 3 枚
 *   需要 badges 模块权限（view 可读 / manage 可写）
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BadgeChip } from "@/components/user/BadgeChip";
import { fetchUserDetail, updateUser } from "@/lib/api/auth";
import {
  createUserBadge,
  deleteUserBadge,
  fetchUserBadges,
  reorderUserBadges,
  updateUserBadge,
} from "@/lib/api/badges";
import { useEffectivePermissions } from "@/lib/permissions";
import type { AdminBadgeListOut, AdminCustomBadge } from "@/types/api";

const CLUB_POSITIONS = ["president", "vice_president", "member"] as const;

export default function AdminUserDetailPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = Number(params.id);
  const { ready, can, role } = useEffectivePermissions();
  const isSuperAdmin = role === "super_admin";

  const [user, setUser] = useState<Awaited<
    ReturnType<typeof fetchUserDetail>
  > | null>(null);
  const [badges, setBadges] = useState<AdminBadgeListOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canViewBadges = can("badges", "view");
  const canManageBadges = can("badges", "manage");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const u = await fetchUserDetail(userId);
      setUser(u);
      try {
        setBadges(await fetchUserBadges(userId));
      } catch {
        setBadges(null); // 无 badges view 权限时不阻塞基本信息展示
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (ready && Number.isFinite(userId)) load();
  }, [ready, userId, load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  }

  /* ---------- 社团职务（super_admin） ---------- */
  async function handlePositionChange(value: string) {
    if (!user) return;
    setError(null);
    try {
      const updated = await updateUser(user.id, { club_position: value || null });
      setUser(updated);
      // 职务影响系统徽章：重新拉取徽章列表
      fetchUserBadges(user.id).then(setBadges).catch(() => {});
      flash(t("admin.users.detail.positionSaved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!ready || loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !user) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => router.push("/admin/users")} label={t("admin.users.detail.back")} />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("admin.users.detail.notFound")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <BackLink onClick={() => router.push("/admin/users")} label={t("admin.users.detail.back")} />
        <h1 className="text-2xl font-display font-bold">
          {t("admin.users.detail.title")} · {user.display_name || user.username}
        </h1>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}
      {notice && (
        <Card className="border-emerald-500/40">
          <CardContent className="py-3 text-sm text-emerald-600 dark:text-emerald-400">
            {notice}
          </CardContent>
        </Card>
      )}

      {/* 基本信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("admin.users.detail.basicInfo")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <InfoRow label={t("admin.users.colDisplayName")} value={user.display_name || user.username} />
            <InfoRow label="ID" value={`@${user.username} (#${user.id})`} mono />
            <InfoRow label={t("admin.users.colRealName")} value={user.real_name || "—"} />
            <InfoRow label={t("admin.users.colStudentId")} value={user.student_id || "—"} mono />
            <InfoRow label={t("admin.users.colPhone")} value={user.phone || "—"} mono />
            <InfoRow label={t("admin.users.colEmail")} value={user.email} />
            <div className="space-y-1">
              <dt className="text-xs text-muted-foreground">{t("admin.users.colRole")}</dt>
              <dd>
                <Badge variant="outline">{t(`admin.users.roles.${user.role}`)}</Badge>
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs text-muted-foreground">{t("admin.users.colStatus")}</dt>
              <dd>
                <Badge
                  variant={user.is_active ? "outline" : "secondary"}
                  className={user.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}
                >
                  {user.is_active ? t("admin.users.statusActive") : t("admin.users.statusDisabled")}
                </Badge>
              </dd>
            </div>
            {/* 社团职务：纯展示层，与权限解耦；仅 super_admin 可修改，变更写审计 */}
            <div className="space-y-1 sm:col-span-2">
              <dt className="text-xs text-muted-foreground">
                {t("admin.users.detail.clubPosition")}
              </dt>
              <dd>
                {isSuperAdmin ? (
                  <select
                    value={user.club_position ?? ""}
                    onChange={(e) => handlePositionChange(e.target.value)}
                    className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm max-md:h-11"
                    aria-label={t("admin.users.detail.clubPosition")}
                  >
                    <option value="">{t("admin.users.detail.positionNone")}</option>
                    {CLUB_POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {t(`admin.users.detail.positions.${p}`)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm">
                    {user.club_position
                      ? t(`admin.users.detail.positions.${user.club_position}`)
                      : t("admin.users.detail.positionNone")}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* 用户徽章管理 */}
      {canViewBadges && badges && (
        <BadgePanel
          userId={user.id}
          data={badges}
          canManage={canManageBadges}
          onChanged={(b) => setBadges(b)}
          onError={(msg) => setError(msg)}
          onNotice={flash}
        />
      )}
    </div>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="gap-1 max-md:h-11">
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : ""}>{value}</dd>
    </div>
  );
}

/* ==================== 用户徽章管理板块 ==================== */

interface BadgePanelProps {
  userId: number;
  data: AdminBadgeListOut;
  canManage: boolean;
  onChanged: (b: AdminBadgeListOut) => void;
  onError: (msg: string) => void;
  onNotice: (msg: string) => void;
}

const emptyForm = { name: "", emoji: "", bg_color: "#6366f1", text_color: "#ffffff" };

function BadgePanel({ userId, data, canManage, onChanged, onError, onNotice }: BadgePanelProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const activeCount = data.custom.filter((b) => b.is_active).length;
  const limitReached = activeCount >= data.custom_limit;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    onError("");
    try {
      await fn();
      onChanged(await fetchUserBadges(userId));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleCreate() {
    if (!form.name.trim()) return;
    run(async () => {
      await createUserBadge(userId, {
        name: form.name.trim(),
        emoji: form.emoji.trim() || null,
        bg_color: form.bg_color,
        text_color: form.text_color,
      });
      setForm(emptyForm);
      setAdding(false);
      onNotice(t("admin.badges.saved"));
    });
  }

  function handleUpdate(id: number) {
    run(async () => {
      await updateUserBadge(userId, id, {
        name: editForm.name.trim(),
        emoji: editForm.emoji.trim() || null,
        bg_color: editForm.bg_color,
        text_color: editForm.text_color,
      });
      setEditingId(null);
      onNotice(t("admin.badges.saved"));
    });
  }

  function handleDelete(b: AdminCustomBadge) {
    if (!confirm(t("admin.badges.deleteConfirm", { name: b.name }))) return;
    run(() => deleteUserBadge(userId, b.id));
  }

  function handleToggle(b: AdminCustomBadge) {
    run(() => updateUserBadge(userId, b.id, { is_active: !b.is_active }));
  }

  /** 上下移：本地交换后整体提交 id 数组（后端校验集合一致） */
  function handleMove(index: number, dir: -1 | 1) {
    const list = [...data.custom];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    // 乐观刷新
    onChanged({ ...data, custom: list });
    run(() => reorderUserBadges(userId, list.map((b) => b.id)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("admin.badges.title")}</CardTitle>
        <CardDescription>{t("admin.badges.limit", { limit: data.custom_limit })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 系统徽章：只读 */}
        <div className="space-y-2">
          <Label>{t("admin.badges.systemTitle")}</Label>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 min-h-10">
            {data.system_key ? (
              <BadgeChip badge={{ type: "system", key: data.system_key }} />
            ) : (
              <span className="text-xs text-muted-foreground">{t("admin.badges.systemNone")}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("admin.badges.systemHint")}</p>
        </div>

        {/* 自定义徽章 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label>{t("admin.badges.customTitle")}</Label>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || limitReached || adding}
                onClick={() => setAdding(true)}
                className="gap-1 max-md:h-11"
                title={limitReached ? t("admin.badges.limitReached", { limit: data.custom_limit }) : undefined}
              >
                <Plus className="h-4 w-4" />
                {t("admin.badges.add")}
              </Button>
            )}
          </div>
          {limitReached && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("admin.badges.limitReached", { limit: data.custom_limit })}
            </p>
          )}

          <ul className="space-y-2">
            {data.custom.length === 0 && !adding && (
              <li className="text-xs text-muted-foreground py-2">{t("admin.badges.empty")}</li>
            )}
            {data.custom.map((b, idx) => (
              <li
                key={b.id}
                className="flex items-center gap-2 flex-wrap rounded-md border border-border px-3 py-2"
              >
                {editingId === b.id ? (
                  <BadgeForm
                    value={editForm}
                    onChange={setEditForm}
                    idPrefix={`badge-edit-${b.id}`}
                  />
                ) : (
                  <>
                    <BadgeChip
                      badge={{
                        type: "custom",
                        id: b.id,
                        name: b.name,
                        emoji: b.emoji,
                        bg_color: b.bg_color,
                        text_color: b.text_color,
                      }}
                    />
                    <span
                      className={`text-[10px] ${b.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                    >
                      {b.is_active ? t("admin.badges.active") : t("admin.badges.inactive")}
                    </span>
                  </>
                )}

                {canManage && (
                  <span className="ml-auto flex items-center gap-1">
                    {editingId === b.id ? (
                      <>
                        <Button size="icon" variant="ghost" disabled={busy} onClick={() => handleUpdate(b.id)} aria-label="save" className="max-md:h-11 max-md:w-11">
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" disabled={busy} onClick={() => setEditingId(null)} aria-label="cancel" className="max-md:h-11 max-md:w-11">
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="icon" variant="ghost" disabled={busy || idx === 0} onClick={() => handleMove(idx, -1)} aria-label={t("admin.badges.moveUp")} title={t("admin.badges.moveUp")} className="max-md:h-11 max-md:w-11">
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" disabled={busy || idx === data.custom.length - 1} onClick={() => handleMove(idx, 1)} aria-label={t("admin.badges.moveDown")} title={t("admin.badges.moveDown")} className="max-md:h-11 max-md:w-11">
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(b.id);
                            setEditForm({
                              name: b.name,
                              emoji: b.emoji ?? "",
                              bg_color: b.bg_color,
                              text_color: b.text_color,
                            });
                          }}
                          aria-label={t("admin.badges.edit")}
                          title={t("admin.badges.edit")}
                          className="max-md:h-11 max-md:w-11"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => handleToggle(b)}
                          className="text-xs max-md:h-11"
                        >
                          {b.is_active ? t("admin.badges.deactivate") : t("admin.badges.activate")}
                        </Button>
                        <Button size="icon" variant="ghost" disabled={busy} onClick={() => handleDelete(b)} aria-label={t("admin.badges.delete")} title={t("admin.badges.delete")} className="max-md:h-11 max-md:w-11">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </span>
                )}
              </li>
            ))}

            {/* 新增表单 */}
            {adding && (
              <li className="rounded-md border border-dashed border-border px-3 py-3 space-y-3">
                <BadgeForm value={form} onChange={setForm} idPrefix="badge-new" />
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={busy || !form.name.trim()} onClick={handleCreate} className="max-md:h-11">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t("admin.badges.save")}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setAdding(false); setForm(emptyForm); }} className="max-md:h-11">
                    {t("admin.badges.cancel")}
                  </Button>
                </div>
              </li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

/** 徽章编辑表单：名称 + emoji + 背景色 + 文字色（name 仅纯文字/emoji，后端剥除 HTML） */
function BadgeForm({
  value,
  onChange,
  idPrefix,
}: {
  value: typeof emptyForm;
  onChange: (v: typeof emptyForm) => void;
  idPrefix: string;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
      <div className="space-y-1 col-span-2 sm:col-span-1">
        <Label htmlFor={`${idPrefix}-name`} className="text-xs">{t("admin.badges.name")}</Label>
        <Input
          id={`${idPrefix}-name`}
          value={value.name}
          maxLength={32}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder={t("admin.badges.namePlaceholder")}
          className="h-9 max-md:h-11"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-emoji`} className="text-xs">{t("admin.badges.emoji")}</Label>
        <Input
          id={`${idPrefix}-emoji`}
          value={value.emoji}
          maxLength={8}
          onChange={(e) => onChange({ ...value, emoji: e.target.value })}
          placeholder={t("admin.badges.emojiPlaceholder")}
          className="h-9 max-md:h-11"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-bg`} className="text-xs">{t("admin.badges.bgColor")}</Label>
        <input
          id={`${idPrefix}-bg`}
          type="color"
          value={value.bg_color}
          onChange={(e) => onChange({ ...value, bg_color: e.target.value })}
          className="h-9 w-full rounded-md border border-input bg-background cursor-pointer max-md:h-11"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-fg`} className="text-xs">{t("admin.badges.textColor")}</Label>
        <input
          id={`${idPrefix}-fg`}
          type="color"
          value={value.text_color}
          onChange={(e) => onChange({ ...value, text_color: e.target.value })}
          className="h-9 w-full rounded-md border border-input bg-background cursor-pointer max-md:h-11"
        />
      </div>
    </div>
  );
}
