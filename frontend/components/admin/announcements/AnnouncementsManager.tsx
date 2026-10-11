"use client";

/**
 * 公告管理组件（信息通知 / 主页公告共用，category 区分）
 *
 * - 列表：搜索 / 启用筛选 / 服务端分页 / 启用状态徽章 / 编辑删除
 * - 创建与编辑共用 Dialog 表单：标题、内容、链接、生效时间窗、优先级、启用开关
 * - 时间以 datetime-local 输入，提交时转 UTC ISO；展示用 FormattedUserActionTime
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Megaphone } from "lucide-react";
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
  adminListAnnouncements,
  adminCreateAnnouncement,
  adminUpdateAnnouncement,
  adminDeleteAnnouncement,
} from "@/lib/api/announcements";
import type { Announcement, AnnouncementCategory } from "@/types/api";

const PAGE_SIZE = 20;

export function AnnouncementsManager({ category }: { category: AnnouncementCategory }) {
  const { t } = useI18n();

  const [items, setItems] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 搜索（300ms 防抖）+ 启用筛选 + 分页
  const [q, setQ] = useState("");
  const [query, setQuery] = useState(""); // 防抖后的实际查询词
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [enabledFilter, setEnabledFilter] = useState<"" | "enabled" | "disabled">("");
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 表单
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [link, setLink] = useState("");
  const [startAt, setStartAt] = useState(""); // datetime-local 字符串
  const [endAt, setEndAt] = useState("");
  const [priority, setPriority] = useState("0");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListAnnouncements({
        category,
        enabled: enabledFilter === "" ? undefined : enabledFilter === "enabled",
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
  }, [category, enabledFilter, query, page]);

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
    setTitle("");
    setContent("");
    setLink("");
    setStartAt("");
    setEndAt("");
    setPriority("0");
    setEnabled(true);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setTitle(a.title);
    setContent(a.content);
    setLink(a.link ?? "");
    // datetime-local 需要 YYYY-MM-DDTHH:mm 格式
    setStartAt(a.start_at ? a.start_at.slice(0, 16) : "");
    setEndAt(a.end_at ? a.end_at.slice(0, 16) : "");
    setPriority(String(a.priority));
    setEnabled(a.enabled);
    setFormError(null);
    setOpen(true);
  }

  async function handleSave() {
    setFormError(null);
    if (!title.trim()) {
      setFormError(t("admin.announcements.errTitleRequired"));
      return;
    }
    if (!content.trim()) {
      setFormError(t("admin.announcements.errContentRequired"));
      return;
    }
    // 时间窗校验：开始须早于结束
    if (startAt && endAt && new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setFormError(t("admin.announcements.errTimeRange"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        link: link.trim() || undefined,
        start_at: startAt ? new Date(startAt).toISOString() : undefined,
        end_at: endAt ? new Date(endAt).toISOString() : undefined,
        enabled,
        priority: Number(priority) || 0,
      };
      if (editing) {
        await adminUpdateAnnouncement(editing.id, payload);
      } else {
        await adminCreateAnnouncement({ ...payload, category });
      }
      setOpen(false);
      setNotice(t("admin.announcements.saved"));
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("admin.announcements.deleteConfirm"))) return;
    try {
      await adminDeleteAnnouncement(id);
      setNotice(t("admin.announcements.deleted"));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          {t("admin.announcements.addBtn")}
        </Button>
      </div>

      {notice && (
        <p className="text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-md">
          {notice}
        </p>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              {total} {t("admin.announcements.colTitle")}
            </CardTitle>
            <div className="flex items-center gap-2">
              <select
                value={enabledFilter}
                onChange={(e) => {
                  setEnabledFilter(e.target.value as "" | "enabled" | "disabled");
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={t("admin.announcements.colEnabled")}
              >
                <option value="">{t("admin.announcements.filterAll")}</option>
                <option value="enabled">{t("admin.announcements.filterEnabled")}</option>
                <option value="disabled">{t("admin.announcements.filterDisabled")}</option>
              </select>
              <Input
                placeholder={t("admin.announcements.searchPlaceholder")}
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
              {t("admin.announcements.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t("admin.announcements.colTitle")}</th>
                    <th className="px-3 py-2 hidden md:table-cell">{t("admin.announcements.colContent")}</th>
                    <th className="px-3 py-2 hidden lg:table-cell">{t("admin.announcements.colLink")}</th>
                    <th className="px-3 py-2 hidden lg:table-cell">{t("admin.announcements.colStartAt")}</th>
                    <th className="px-3 py-2 hidden lg:table-cell">{t("admin.announcements.colEndAt")}</th>
                    <th className="px-3 py-2">{t("admin.announcements.colEnabled")}</th>
                    <th className="px-3 py-2 hidden sm:table-cell">{t("admin.announcements.colPriority")}</th>
                    <th className="px-3 py-2 hidden sm:table-cell">{t("admin.announcements.colCreatedAt")}</th>
                    <th className="px-3 py-2 text-right">{t("admin.activities.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium max-w-[180px] truncate">{a.title}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate hidden md:table-cell">
                        {a.content}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs max-w-[140px] truncate hidden lg:table-cell">
                        {a.link ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap hidden lg:table-cell">
                        {a.start_at ? <FormattedUserActionTime utcIso={a.start_at} /> : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap hidden lg:table-cell">
                        {a.end_at ? <FormattedUserActionTime utcIso={a.end_at} /> : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={a.enabled ? "success" : "neutral"}>
                          {a.enabled ? t("admin.announcements.enabledYes") : t("admin.announcements.enabledNo")}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs hidden sm:table-cell">{a.priority}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        <FormattedUserActionTime utcIso={a.created_at} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(a)} aria-label={t("admin.announcements.editBtn")}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)} aria-label={t("admin.announcements.deleteBtn")}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              {editing ? t("admin.announcements.editBtn") : t("admin.announcements.addBtn")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ann-title">{t("admin.announcements.colTitle")}</Label>
              <Input
                id="ann-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ann-content">{t("admin.announcements.colContent")}</Label>
              <Textarea
                id="ann-content"
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("admin.announcements.contentPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ann-link">{t("admin.announcements.colLink")}</Label>
              <Input
                id="ann-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={t("admin.announcements.linkPlaceholder")}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ann-start">{t("admin.announcements.colStartAt")}</Label>
                <Input
                  id="ann-start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ann-end">{t("admin.announcements.colEndAt")}</Label>
                <Input
                  id="ann-end"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              {t("admin.announcements.timeWindowHint")}
            </p>
            <div className="space-y-2">
              <Label htmlFor="ann-priority">{t("admin.announcements.colPriority")}</Label>
              <Input
                id="ann-priority"
                type="number"
                step={1}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.announcements.priorityHint")}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 accent-primary cursor-pointer"
              />
              {t("admin.announcements.colEnabled")}
            </label>
            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("admin.announcements.cancelBtn")}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t("admin.announcements.saveBtn")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
