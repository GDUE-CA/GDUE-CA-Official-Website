"use client";

/**
 * 公告管理组件（信息通知 / 主页公告共用，category 区分）
 *
 * - 列表：搜索 / 状态筛选（published/draft） / 服务端分页 / 状态徽章 / 编辑删除
 * - 创建与编辑共用 Dialog 表单：标题、内容、发布者介绍、链接、生效时间窗、优先级、状态
 * - 多语言内容覆盖（V0.6.1 需求4）：13 语种独立覆盖标题/正文/发布者介绍，公开接口按回退链解析
 * - 时间以 datetime-local 输入，提交时转 UTC ISO；展示用 FormattedUserActionTime
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Plus from "@/assets/icons/action/plus.svg";
import Pencil from "@/assets/icons/action/pencil.svg";
import Trash2 from "@/assets/icons/action/trash-2.svg";
import Upload from "@/assets/icons/action/upload.svg";
import Megaphone from "@/assets/icons/status/megaphone.svg";
import FileText from "@/assets/icons/status/file-text.svg";
import Languages from "@/assets/icons/navigation/languages.svg";
import ChevronDown from "@/assets/icons/navigation/chevron-down.svg";
import { useI18n } from "@/i18n/provider";
import { LOCALE_LIST } from "@/lib/i18n";
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
import { MarkdownRenderer } from "@/components/blog/MarkdownRenderer";
import { formatBytes } from "@/lib/utils";
import {
  adminListAnnouncements,
  adminGetAnnouncement,
  adminCreateAnnouncement,
  adminUpdateAnnouncement,
  adminDeleteAnnouncement,
  adminUploadAnnouncementAttachment,
  adminDeleteAnnouncementAttachment,
} from "@/lib/api/announcements";
import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementI18n,
  AnnouncementI18nField,
  AnnouncementStatus,
} from "@/types/api";
import { useServerFieldErrors } from "@/lib/hooks/useServerFieldErrors";
import { FieldError } from "@/components/ui/field-error";

const PAGE_SIZE = 20;

/** 附件可选扩展名（与后端 app/api/announcements.py 白名单一致；最终以服务端魔数校验为准） */
const ATTACHMENT_EXTS = [
  "mp4", "webm", "ogv", "mov",
  "mp3", "m4a", "aac", "wav", "ogg", "weba",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
] as const;
const ATTACHMENT_ACCEPT = ATTACHMENT_EXTS.map((ext) => `.${ext}`).join(",");

/** 后端请求体字段名（data-field 对位，与 1001 data.errors[].field 一致） */
type AnnouncementField =
  | "title" | "content" | "link" | "start_at"
  | "end_at" | "priority" | "enabled" | "publisher_intro" | "i18n";

/** 空的多语言覆盖条目（三字段均空串） */
const EMPTY_I18N_ENTRY: Record<AnnouncementI18nField, string> = {
  title: "", content: "", publisher_intro: "",
};

/** 剔除空白值：三字段均空时移除该语种条目，返回 undefined 表示无覆盖 */
function cleanI18nOverrides(
  overrides: Record<string, Record<AnnouncementI18nField, string>>
): AnnouncementI18n | undefined {
  const out: AnnouncementI18n = {};
  for (const [loc, entry] of Object.entries(overrides)) {
    const fields: Partial<Record<AnnouncementI18nField, string>> = {};
    for (const f of Object.keys(EMPTY_I18N_ENTRY) as AnnouncementI18nField[]) {
      const v = entry[f]?.trim();
      if (v) fields[f] = v;
    }
    if (Object.keys(fields).length > 0) out[loc] = fields;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function AnnouncementsManager({ category }: { category: AnnouncementCategory }) {
  const { t } = useI18n();

  const [items, setItems] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 搜索（300ms 防抖）+ 状态筛选 + 分页
  const [q, setQ] = useState("");
  const [query, setQuery] = useState(""); // 防抖后的实际查询词
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | AnnouncementStatus>("");
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 表单
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  /** 正文编辑模式：edit=Markdown 源编辑，preview=富文本预览 */
  const [contentMode, setContentMode] = useState<"edit" | "preview">("edit");
  const [publisherIntro, setPublisherIntro] = useState("");
  const [link, setLink] = useState("");
  const [startAt, setStartAt] = useState(""); // datetime-local 字符串
  const [endAt, setEndAt] = useState("");
  const [priority, setPriority] = useState("0");
  const [enabled, setEnabled] = useState(true);
  // 多语言内容覆盖（V0.6.1 需求4）：语种 → 三字段覆盖；i18nOpen 控制折叠区
  const [i18nOpen, setI18nOpen] = useState(false);
  const [i18nLang, setI18nLang] = useState<string>("zh-cn");
  const [i18nOverrides, setI18nOverrides] = useState<
    Record<string, Record<AnnouncementI18nField, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fieldErrors = useServerFieldErrors<AnnouncementField>({ fallback: t("common.saveFailed") });
  const fe = fieldErrors.errors;

  // 附件（详情页在线预览）：仅对已保存公告可用
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListAnnouncements({
        category,
        status: statusFilter || undefined,
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
  }, [category, statusFilter, query, page]);

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
    setContentMode("edit");
    setPublisherIntro("");
    setLink("");
    setStartAt("");
    setEndAt("");
    setPriority("0");
    setEnabled(true);
    setI18nOpen(false);
    setI18nLang("zh-cn");
    setI18nOverrides({});
    setFormError(null);
    fieldErrors.clear();
    setAttachmentError(null);
    setOpen(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setTitle(a.title);
    setContent(a.content);
    setContentMode("edit");
    setPublisherIntro(a.publisher_intro ?? "");
    setLink(a.link ?? "");
    // datetime-local 需要 YYYY-MM-DDTHH:mm 格式
    setStartAt(a.start_at ? a.start_at.slice(0, 16) : "");
    setEndAt(a.end_at ? a.end_at.slice(0, 16) : "");
    setPriority(String(a.priority));
    setEnabled(a.enabled);
    setI18nOpen(false);
    setI18nLang("zh-cn");
    // 回填多语言覆盖（仅白名单 13 语种，缺失字段补空串）
    const overrides: Record<string, Record<AnnouncementI18nField, string>> = {};
    if (a.i18n) {
      for (const [loc, fields] of Object.entries(a.i18n)) {
        overrides[loc] = {
          title: fields?.title ?? "",
          content: fields?.content ?? "",
          publisher_intro: fields?.publisher_intro ?? "",
        };
      }
    }
    setI18nOverrides(overrides);
    setFormError(null);
    fieldErrors.clear();
    setAttachmentError(null);
    setOpen(true);
  }

  /** 上传附件：成功后刷新当前编辑对象的附件列表 */
  async function handleAttachmentUpload(file: File) {
    if (!editing) return;
    setAttachmentError(null);
    setUploading(true);
    try {
      await adminUploadAnnouncementAttachment(editing.id, file);
      setEditing(await adminGetAnnouncement(editing.id));
      setNotice(t("admin.announcements.saved"));
      await load();
    } catch (e) {
      setAttachmentError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /** 删除附件（后端同时移除落盘文件） */
  async function handleAttachmentDelete(attachmentId: number) {
    if (!editing) return;
    if (!confirm(t("admin.announcements.attachmentDeleteConfirm"))) return;
    setAttachmentError(null);
    try {
      await adminDeleteAnnouncementAttachment(editing.id, attachmentId);
      setEditing(await adminGetAnnouncement(editing.id));
      setNotice(t("admin.announcements.deleted"));
      await load();
    } catch (e) {
      setAttachmentError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleSave() {
    setFormError(null);
    fieldErrors.clear();
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
        publisher_intro: publisherIntro.trim() || undefined,
        i18n: cleanI18nOverrides(i18nOverrides),
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
      setFormError(fieldErrors.capture(e));
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
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "" | AnnouncementStatus);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={t("admin.announcements.colEnabled")}
              >
                <option value="">{t("admin.announcements.filterAll")}</option>
                <option value="published">{t("admin.announcements.filterEnabled")}</option>
                <option value="draft">{t("admin.announcements.filterDisabled")}</option>
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
                      <td className="px-3 py-2 font-medium max-w-[180px]">
                        <span className="flex items-center gap-1">
                          <span className="truncate">{a.title}</span>
                          {/* 多语言覆盖数徽章（V0.6.1 需求4）：仅已有覆盖时显示 */}
                          {a.i18n && Object.keys(a.i18n).length > 0 && (
                            <span
                              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary"
                              title={t("admin.announcements.i18nSection")}
                            >
                              <Languages className="h-3 w-3" aria-hidden="true" />
                              {Object.keys(a.i18n).length}
                            </span>
                          )}
                        </span>
                      </td>
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
                        <StatusBadge tone={a.status === "published" ? "success" : "neutral"}>
                          {a.status === "published"
                            ? t("admin.announcements.enabledYes")
                            : t("admin.announcements.enabledNo")}
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
        <DialogContent {...fieldErrors.rootProps} className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("admin.announcements.editBtn") : t("admin.announcements.addBtn")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2" data-field="title">
              <Label htmlFor="ann-title">{t("admin.announcements.colTitle")}</Label>
              <Input
                id="ann-title"
                aria-invalid={!!fe.title}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <FieldError>{fe.title}</FieldError>
            </div>
            <div className="space-y-2" data-field="content">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="ann-content">{t("admin.announcements.colContent")}</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={contentMode === "edit" ? "secondary" : "ghost"}
                    onClick={() => setContentMode("edit")}
                  >
                    {t("admin.announcements.editBtn")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={contentMode === "preview" ? "secondary" : "ghost"}
                    onClick={() => setContentMode("preview")}
                  >
                    {t("admin.announcements.previewBtn")}
                  </Button>
                </div>
              </div>
              {contentMode === "edit" ? (
                <Textarea
                  id="ann-content"
                  aria-invalid={!!fe.content}
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t("admin.announcements.contentPlaceholder")}
                />
              ) : (
                <div className="min-h-[8rem] rounded-md border border-border bg-muted/30 px-3 py-2">
                  {content.trim() ? (
                    <MarkdownRenderer content={content} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("admin.announcements.previewEmpty")}
                    </p>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t("admin.announcements.contentHint")}
              </p>
              <FieldError>{fe.content}</FieldError>
            </div>
            <div className="space-y-2" data-field="publisher_intro">
              <Label htmlFor="ann-intro">{t("admin.announcements.colPublisherIntro")}</Label>
              <Input
                id="ann-intro"
                aria-invalid={!!fe.publisher_intro}
                value={publisherIntro}
                onChange={(e) => setPublisherIntro(e.target.value)}
                placeholder={t("admin.announcements.publisherIntroPlaceholder")}
              />
              <FieldError>{fe.publisher_intro}</FieldError>
            </div>
            <div className="space-y-2" data-field="link">
              <Label htmlFor="ann-link">{t("admin.announcements.colLink")}</Label>
              <Input
                id="ann-link"
                aria-invalid={!!fe.link}
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={t("admin.announcements.linkPlaceholder")}
              />
              <FieldError>{fe.link}</FieldError>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2" data-field="start_at">
                <Label htmlFor="ann-start">{t("admin.announcements.colStartAt")}</Label>
                <Input
                  id="ann-start"
                  aria-invalid={!!fe.start_at}
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
                <FieldError>{fe.start_at}</FieldError>
              </div>
              <div className="space-y-2" data-field="end_at">
                <Label htmlFor="ann-end">{t("admin.announcements.colEndAt")}</Label>
                <Input
                  id="ann-end"
                  aria-invalid={!!fe.end_at}
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
                <FieldError>{fe.end_at}</FieldError>
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              {t("admin.announcements.timeWindowHint")}
            </p>
            <div className="space-y-2" data-field="priority">
              <Label htmlFor="ann-priority">{t("admin.announcements.colPriority")}</Label>
              <Input
                id="ann-priority"
                aria-invalid={!!fe.priority}
                type="number"
                step={1}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.announcements.priorityHint")}
              </p>
              <FieldError>{fe.priority}</FieldError>
            </div>
            <div className="space-y-2" data-field="enabled">
              <Label htmlFor="ann-status">{t("admin.announcements.colEnabled")}</Label>
              <select
                id="ann-status"
                aria-invalid={!!fe.enabled}
                value={enabled ? "published" : "draft"}
                onChange={(e) => setEnabled(e.target.value === "published")}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="published">{t("admin.announcements.enabledYes")}</option>
                <option value="draft">{t("admin.announcements.enabledNo")}</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {t("admin.announcements.statusHint")}
              </p>
              <FieldError>{fe.enabled}</FieldError>
            </div>

            {/* 多语言内容覆盖（V0.6.1 需求4）：13 语种独立覆盖标题/正文/发布者介绍 */}
            <div className="space-y-2 rounded-md border border-border p-3">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setI18nOpen((v) => !v)}
                aria-expanded={i18nOpen}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Languages className="h-4 w-4" />
                  {t("admin.announcements.i18nSection")}
                  {(() => {
                    const filled = Object.keys(cleanI18nOverrides(i18nOverrides) ?? {}).length;
                    return filled > 0 ? (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary">
                        {filled}
                      </span>
                    ) : null;
                  })()}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${i18nOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {i18nOpen && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="ann-i18n-lang">{t("admin.announcements.i18nLangLabel")}</Label>
                    <select
                      id="ann-i18n-lang"
                      value={i18nLang}
                      onChange={(e) => setI18nLang(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {LOCALE_LIST.map((opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {t("admin.announcements.i18nSectionHint")}
                    </p>
                  </div>
                  {(
                    [
                      ["title", t("admin.announcements.colTitle"), title],
                      ["content", t("admin.announcements.colContent"), content],
                      ["publisher_intro", t("admin.announcements.colPublisherIntro"), publisherIntro],
                    ] as const
                  ).map(([field, label, base]) => (
                    <div key={field} className="space-y-1.5">
                      <Label htmlFor={`ann-i18n-${field}`}>{label}</Label>
                      {field === "content" ? (
                        <Textarea
                          id="ann-i18n-content"
                          rows={4}
                          value={i18nOverrides[i18nLang]?.content ?? ""}
                          onChange={(e) =>
                            setI18nOverrides((prev) => ({
                              ...prev,
                              [i18nLang]: { ...EMPTY_I18N_ENTRY, ...prev[i18nLang], content: e.target.value },
                            }))
                          }
                          placeholder={t("admin.announcements.i18nPlaceholder").replace("{base}", base.slice(0, 40))}
                        />
                      ) : (
                        <Input
                          id={`ann-i18n-${field}`}
                          value={i18nOverrides[i18nLang]?.[field] ?? ""}
                          onChange={(e) =>
                            setI18nOverrides((prev) => ({
                              ...prev,
                              [i18nLang]: { ...EMPTY_I18N_ENTRY, ...prev[i18nLang], [field]: e.target.value },
                            }))
                          }
                          placeholder={t("admin.announcements.i18nPlaceholder").replace("{base}", base.slice(0, 40))}
                        />
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">{t("admin.announcements.i18nEmptyHint")}</p>
                </div>
              )}
            </div>

            {/* 附件管理（详情页在线预览；仅已保存公告可上传） */}
            <div className="space-y-2">
              <Label>{t("admin.announcements.attachments")}</Label>
              {!editing ? (
                <p className="text-xs text-muted-foreground">
                  {t("admin.announcements.attachmentNeedSave")}
                </p>
              ) : (
                <>
                  {editing.attachments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("admin.announcements.attachmentNone")}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {editing.attachments.map((att) => (
                        <li
                          key={att.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
                        >
                          <span className="flex min-w-0 items-center gap-1.5 text-xs">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{att.original_name ?? att.url}</span>
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                              {formatBytes(att.size)}
                            </span>
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            aria-label={t("admin.announcements.deleteBtn")}
                            onClick={() => handleAttachmentDelete(att.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAttachmentUpload(file);
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1" />
                      )}
                      {uploading
                        ? t("admin.announcements.attachmentUploading")
                        : t("admin.announcements.attachmentUpload")}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {t("admin.announcements.attachmentHint")}
                    </span>
                  </div>
                  {attachmentError && (
                    <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                      {attachmentError}
                    </p>
                  )}
                </>
              )}
            </div>

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
