"use client";

/**
 * 成员管理组件
 *
 * - 列表：搜索 / 届别筛选 / 归档筛选 / 服务端分页 / 头像+姓名+职务+徽章行
 * - 批量勾选：全选本页 / 跨页保留，批量改届别与职务
 * - Excel 导入：下载空白模板（表头复刻成员信息表），上传后按姓名去重（跳过/更新）
 * - 创建与编辑共用 Dialog：姓名、职务、届别、简介、排序、归档开关
 * - 头像上传：前端先校验格式（JPG/PNG/WEBP）与大小（≤5MB）再调用上传接口
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, UsersRound, Download, Upload } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/admin/review/StatusBadge";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import {
  adminListMembers,
  adminCreateMember,
  adminUpdateMember,
  adminDeleteMember,
  adminUploadMemberAvatar,
  adminDownloadMemberTemplate,
  adminImportMembers,
  adminBatchUpdateMembers,
} from "@/lib/api/members";
import type { Member, MemberImportResult, MemberTerm } from "@/types/api";

const PAGE_SIZE = 20;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 与后端限制一致：5MB
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function MembersManager() {
  const { t } = useI18n();

  const [items, setItems] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 搜索（300ms 防抖）+ 届别/归档筛选 + 分页
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [termFilter, setTermFilter] = useState<"" | MemberTerm>("");
  const [archivedFilter, setArchivedFilter] = useState<"" | "active" | "archived">("");
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 表单
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [term, setTerm] = useState<MemberTerm>("current");
  const [bio, setBio] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [archived, setArchived] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 批量勾选（跨页保留 id）+ 批量改届别/职务
  const [selected, setSelected] = useState<number[]>([]);
  const [batchTerm, setBatchTerm] = useState<"" | MemberTerm>("");
  const [batchRole, setBatchRole] = useState("");
  const [batching, setBatching] = useState(false);

  // Excel 导入
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<"skip" | "update">("skip");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<MemberImportResult | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  // 模板下载
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListMembers({
        term: termFilter || undefined,
        archived: archivedFilter === "" ? undefined : archivedFilter === "archived",
        q: query || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [termFilter, archivedFilter, query, page]);

  useEffect(() => {
    load();
  }, [load]);

  // 搜索防抖：变更时回到第一页
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(q);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  function openCreate() {
    setEditing(null);
    setName("");
    setRoleTitle("");
    setTerm("current");
    setBio("");
    setDisplayOrder("0");
    setArchived(false);
    setAvatarUrl("");
    setFormError(null);
    setOpen(true);
  }

  function openEdit(m: Member) {
    setEditing(m);
    setName(m.name);
    setRoleTitle(m.role_title ?? "");
    setTerm(m.term);
    setBio(m.bio ?? "");
    setDisplayOrder(String(m.display_order));
    setArchived(m.archived);
    setAvatarUrl(m.avatar_url ?? "");
    setFormError(null);
    setOpen(true);
  }

  /** 头像上传：先本地校验格式与大小，再调接口，成功后回填 avatar_url 预览 */
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    if (!AVATAR_TYPES.includes(file.type)) {
      setFormError(t("admin.members.errAvatarFormat"));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setFormError(t("admin.members.errAvatarTooLarge"));
      return;
    }
    setUploading(true);
    try {
      const res = await adminUploadMemberAvatar(file);
      setAvatarUrl(res.avatar_url);
      setNotice(t("admin.members.avatarUploaded"));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // 允许重复选择同一文件
      e.target.value = "";
    }
  }

  async function handleSave() {
    setFormError(null);
    if (!name.trim()) {
      setFormError(t("admin.activities.fieldRequired"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        role_title: roleTitle.trim(),
        term,
        bio: bio.trim() || undefined,
        avatar_url: avatarUrl || undefined,
        display_order: Number(displayOrder) || 0,
        archived,
      };
      if (editing) {
        await adminUpdateMember(editing.id, payload);
      } else {
        await adminCreateMember(payload);
      }
      setOpen(false);
      setNotice(t("admin.members.saved"));
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("admin.members.deleteConfirm"))) return;
    try {
      await adminDeleteMember(id);
      setNotice(t("admin.members.deleted"));
      setSelected((s) => s.filter((x) => x !== id));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  /** 下载空白 Excel 导入模板 */
  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      const blob = await adminDownloadMemberTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "members_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  function openImport() {
    setImportMode("skip");
    setImportError(null);
    setImportResult(null);
    if (importFileRef.current) importFileRef.current.value = "";
    setImportOpen(true);
  }

  /** 执行 Excel 批量导入 */
  async function handleImport() {
    const file = importFileRef.current?.files?.[0];
    if (!file) {
      setImportError(t("admin.members.importSelectFile"));
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const res = await adminImportMembers(file, importMode);
      setImportResult(res);
      setNotice(
        t("admin.members.importResult")
          .replace("{total}", String(res.total))
          .replace("{created}", String(res.created))
          .replace("{updated}", String(res.updated))
          .replace("{skipped}", String(res.skipped))
          .replace("{errors}", String(res.errors.length))
      );
      await load();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function toggleSelect(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function toggleSelectPage() {
    const pageIds = items.map((m) => m.id);
    const allChecked = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
    setSelected((s) =>
      allChecked ? s.filter((id) => !pageIds.includes(id)) : [...s, ...pageIds.filter((id) => !s.includes(id))]
    );
  }

  /** 批量修改届别 / 职务 */
  async function handleBatchApply() {
    if (!batchTerm && !batchRole.trim()) {
      alert(t("admin.members.batchNeedChange"));
      return;
    }
    setBatching(true);
    try {
      const res = await adminBatchUpdateMembers({
        ids: selected,
        term: batchTerm || undefined,
        role_title: batchRole.trim() || undefined,
      });
      setNotice(t("admin.members.batchDone").replace("{count}", String(res.updated)));
      setSelected([]);
      setBatchTerm("");
      setBatchRole("");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Batch update failed");
    } finally {
      setBatching(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2 flex-wrap">
        <Button variant="outline" onClick={handleDownloadTemplate} disabled={downloading}>
          {downloading ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-1.5" />
          )}
          {downloading ? t("admin.members.downloading") : t("admin.members.templateBtn")}
        </Button>
        <Button variant="outline" onClick={openImport}>
          <Upload className="h-4 w-4 mr-1.5" />
          {t("admin.members.importBtn")}
        </Button>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          {t("admin.members.addBtn")}
        </Button>
      </div>

      {notice && (
        <p className="text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-md">
          {notice}
        </p>
      )}

      {/* 批量操作栏（勾选后出现）：改届别 / 职务 */}
      {selected.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap rounded-md border border-border bg-card px-3 py-2">
          <span className="text-sm font-medium">
            {t("admin.members.batchSelected").replace("{count}", String(selected.length))}
          </span>
          <select
            value={batchTerm}
            onChange={(e) => setBatchTerm(e.target.value as "" | MemberTerm)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            aria-label={t("admin.members.colTerm")}
          >
            <option value="">{t("admin.members.batchTerm")}</option>
            <option value="current">{t("admin.members.termCurrent")}</option>
            <option value="former">{t("admin.members.termFormer")}</option>
          </select>
          <Input
            placeholder={t("admin.members.batchRole")}
            value={batchRole}
            onChange={(e) => setBatchRole(e.target.value)}
            className="max-w-52"
          />
          <Button size="sm" onClick={handleBatchApply} disabled={batching}>
            {batching && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {t("admin.members.batchApply")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            {t("admin.members.batchClear")}
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <UsersRound className="h-4 w-4" />
              {total} {t("admin.members.colName")}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={termFilter}
                onChange={(e) => {
                  setTermFilter(e.target.value as "" | MemberTerm);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={t("admin.members.colTerm")}
              >
                <option value="">{t("admin.members.filterAll")}</option>
                <option value="current">{t("admin.members.filterCurrent")}</option>
                <option value="former">{t("admin.members.filterFormer")}</option>
              </select>
              <select
                value={archivedFilter}
                onChange={(e) => {
                  setArchivedFilter(e.target.value as "" | "active" | "archived");
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={t("admin.members.colArchived")}
              >
                <option value="">{t("admin.members.filterAll")}</option>
                <option value="active">{t("admin.members.filterActive")}</option>
                <option value="archived">{t("admin.members.filterArchived")}</option>
              </select>
              <Input
                placeholder={t("admin.members.searchPlaceholder")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-8 text-center">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t("admin.members.empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {/* 全选本页 */}
              <label className="flex items-center gap-2 px-3 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={items.length > 0 && items.every((m) => selected.includes(m.id))}
                  onChange={toggleSelectPage}
                  className="h-4 w-4 accent-primary cursor-pointer"
                />
                {t("admin.members.selectAll")}
              </label>
              {items.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(m.id)}
                    onChange={() => toggleSelect(m.id)}
                    aria-label={m.name}
                    className="h-4 w-4 accent-primary cursor-pointer shrink-0"
                  />
                  {/* 头像：有 URL 显示图片，否则回退姓名首字 */}
                  {m.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.avatar_url}
                      alt={m.name}
                      className="h-10 w-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                      {m.name.slice(0, 1)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{m.name}</span>
                      {m.role_title && (
                        <span className="text-xs text-muted-foreground">{m.role_title}</span>
                      )}
                      <StatusBadge tone={m.term === "current" ? "info" : "neutral"}>
                        {m.term === "current"
                          ? t("admin.members.termCurrent")
                          : t("admin.members.termFormer")}
                      </StatusBadge>
                      <StatusBadge tone={m.archived ? "neutral" : "success"}>
                        {m.archived
                          ? t("admin.members.archivedYes")
                          : t("admin.members.archivedNo")}
                      </StatusBadge>
                    </div>
                    {m.bio && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{m.bio}</p>
                    )}
                    {/* 花名册信息（仅管理端可见，含电话） */}
                    {(() => {
                      const parts = [
                        m.gender,
                        m.grade,
                        m.department,
                        m.major_class,
                        m.phone,
                        m.political_status,
                      ].filter(Boolean);
                      return parts.length > 0 ? (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {parts.join(" · ")}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
                    {t("admin.members.colDisplayOrder")}: {m.display_order}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap hidden md:block">
                    <FormattedUserActionTime utcIso={m.created_at} />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(m)} aria-label={t("admin.members.editBtn")}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)} aria-label={t("admin.members.deleteBtn")}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 分页（服务端分页） */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {t("admin.security.pageInfo")
                  .replace("{page}", String(page))
                  .replace("{total}", String(totalPages))}
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("admin.security.prev")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t("admin.security.next")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 创建 / 编辑弹窗 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("admin.members.editBtn") : t("admin.members.addBtn")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* 头像上传 + 预览 */}
            <div className="space-y-2">
              <Label htmlFor="member-avatar">{t("admin.members.colAvatar")}</Label>
              <div className="flex items-center gap-3">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={name || "avatar"}
                    className="h-12 w-12 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                    <UsersRound className="h-5 w-5" />
                  </div>
                )}
                <div className="space-y-1">
                  <Input
                    id="member-avatar"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarChange}
                    disabled={uploading}
                    className="max-w-xs"
                  />
                  {uploading && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t("common.loading")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t("admin.members.avatarHint")}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="member-name">{t("admin.members.colName")}</Label>
                <Input
                  id="member-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-role">{t("admin.members.colRoleTitle")}</Label>
                <Input
                  id="member-role"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="member-term">{t("admin.members.colTerm")}</Label>
                <select
                  id="member-term"
                  value={term}
                  onChange={(e) => setTerm(e.target.value as MemberTerm)}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="current">{t("admin.members.termCurrent")}</option>
                  <option value="former">{t("admin.members.termFormer")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-order">{t("admin.members.colDisplayOrder")}</Label>
                <Input
                  id="member-order"
                  type="number"
                  step={1}
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-bio">{t("admin.members.colBio")}</Label>
              <Textarea
                id="member-bio"
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
                className="h-4 w-4 accent-primary cursor-pointer"
              />
              {t("admin.members.colArchived")}
            </label>
            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("admin.members.cancelBtn")}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t("admin.members.saveBtn")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 批量导入弹窗 */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("admin.members.importTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("admin.members.importHint")}</p>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="member-import-mode"
                  checked={importMode === "skip"}
                  onChange={() => setImportMode("skip")}
                  className="h-4 w-4 accent-primary cursor-pointer"
                />
                {t("admin.members.importModeSkip")}
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="member-import-mode"
                  checked={importMode === "update"}
                  onChange={() => setImportMode("update")}
                  className="h-4 w-4 accent-primary cursor-pointer"
                />
                {t("admin.members.importModeUpdate")}
              </label>
            </div>
            <Input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xlsm"
              className="max-w-xs"
            />
            {importError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {importError}
              </p>
            )}
            {importResult && (
              <div className="space-y-2 rounded-md border border-border p-3 text-sm">
                <p>
                  {t("admin.members.importResult")
                    .replace("{total}", String(importResult.total))
                    .replace("{created}", String(importResult.created))
                    .replace("{updated}", String(importResult.updated))
                    .replace("{skipped}", String(importResult.skipped))
                    .replace("{errors}", String(importResult.errors.length))}
                </p>
                {importResult.errors.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium">{t("admin.members.importErrorsTitle")}</p>
                    <ul className="max-h-40 overflow-y-auto space-y-1 text-xs text-muted-foreground">
                      {importResult.errors.map((e, i) => (
                        <li key={i}>
                          {t("admin.members.importRow").replace("{row}", String(e.row))}
                          {e.name ? ` ${e.name}` : ""}：{e.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportOpen(false)}>
                {t("admin.members.cancelBtn")}
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {importing ? t("admin.members.importing") : t("admin.members.importSubmit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
