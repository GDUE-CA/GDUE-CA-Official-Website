"use client";

/**
 * 招新管理组件：双 Tab（招新信息 CMS / 社团报名数据）
 *
 * - 招新信息 Tab：搜索 / 启用筛选 / 服务端分页 / 启用徽章 / 创建编辑删除
 * - 社团报名 Tab：搜索 / 状态筛选 / 部门筛选 / 服务端分页 / 状态徽章 / CSV+Excel 导出（Blob 下载）
 * - 状态名称复用 admin.registrations.statuses.*，徽章色调对齐审核中心
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Download,
  ClipboardList,
  FileText,
} from "lucide-react";
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
  adminListRecruitmentInfos,
  adminCreateRecruitmentInfo,
  adminUpdateRecruitmentInfo,
  adminDeleteRecruitmentInfo,
  adminListClubRegistrations,
  adminExportClubRegistrations,
} from "@/lib/api/recruitment";
import type {
  RecruitmentInfo,
  Registration,
  RegistrationStatus,
} from "@/types/api";

const PAGE_SIZE = 20;
const STATUSES: RegistrationStatus[] = ["pending", "approved", "rejected", "checked_in"];

type TabKey = "infos" | "registrations";

export function RecruitmentManager() {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabKey>("infos");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "infos", label: t("admin.recruitment.infosTab") },
    { key: "registrations", label: t("admin.recruitment.registrationsTab") },
  ];

  return (
    <div className="space-y-4">
      {/* Tab 切换（对齐审核中心样式） */}
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            role="tab"
            aria-selected={tab === tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={cn(
              "h-9 px-4 rounded-md border text-sm font-medium transition-colors",
              tab === tabItem.key
                ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === "infos" ? <InfosTab /> : <RegistrationsTab />}
    </div>
  );
}

/* ---------------- 招新信息 Tab ---------------- */

function InfosTab() {
  const { t } = useI18n();

  const [items, setItems] = useState<RecruitmentInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [enabledFilter, setEnabledFilter] = useState<"" | "enabled" | "disabled">("");
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecruitmentInfo | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetDept, setTargetDept] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListRecruitmentInfos({
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
  }, [enabledFilter, query, page]);

  useEffect(() => {
    load();
  }, [load]);

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
    setTargetDept("");
    setStartAt("");
    setEndAt("");
    setEnabled(true);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(info: RecruitmentInfo) {
    setEditing(info);
    setTitle(info.title);
    setContent(info.content);
    setTargetDept(info.target_dept ?? "");
    setStartAt(info.start_at ? info.start_at.slice(0, 16) : "");
    setEndAt(info.end_at ? info.end_at.slice(0, 16) : "");
    setEnabled(info.enabled);
    setFormError(null);
    setOpen(true);
  }

  async function handleSave() {
    setFormError(null);
    if (!title.trim() || !content.trim()) {
      setFormError(t("admin.activities.fieldRequired"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        target_dept: targetDept.trim() || undefined,
        start_at: startAt ? new Date(startAt).toISOString() : undefined,
        end_at: endAt ? new Date(endAt).toISOString() : undefined,
        enabled,
      };
      if (editing) {
        await adminUpdateRecruitmentInfo(editing.id, payload);
      } else {
        await adminCreateRecruitmentInfo(payload);
      }
      setOpen(false);
      setNotice(t("admin.recruitment.infoSaved"));
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("admin.recruitment.infoDeleteConfirm"))) return;
    try {
      await adminDeleteRecruitmentInfo(id);
      setNotice(t("admin.recruitment.infoDeleted"));
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
          {t("admin.recruitment.infoAddBtn")}
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
              <FileText className="h-4 w-4" />
              {total} {t("admin.recruitment.infoColTitle")}
            </CardTitle>
            <div className="flex items-center gap-2">
              <select
                value={enabledFilter}
                onChange={(e) => {
                  setEnabledFilter(e.target.value as "" | "enabled" | "disabled");
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={t("admin.recruitment.infoColEnabled")}
              >
                <option value="">{t("admin.recruitment.regFilterAll")}</option>
                <option value="enabled">{t("admin.announcements.filterEnabled")}</option>
                <option value="disabled">{t("admin.announcements.filterDisabled")}</option>
              </select>
              <Input
                placeholder={t("admin.recruitment.infoSearchPlaceholder")}
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
              {t("admin.recruitment.infoEmpty")}
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((info) => (
                <div
                  key={info.id}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{info.title}</span>
                      {info.target_dept && (
                        <StatusBadge tone="info">{info.target_dept}</StatusBadge>
                      )}
                      <StatusBadge tone={info.enabled ? "success" : "neutral"}>
                        {info.enabled
                          ? t("admin.announcements.enabledYes")
                          : t("admin.announcements.enabledNo")}
                      </StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {info.content}
                    </p>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span>
                        {t("admin.recruitment.infoColStartAt")}:{" "}
                        {info.start_at ? (
                          <FormattedUserActionTime utcIso={info.start_at} />
                        ) : (
                          "—"
                        )}
                      </span>
                      <span>
                        {t("admin.recruitment.infoColEndAt")}:{" "}
                        {info.end_at ? (
                          <FormattedUserActionTime utcIso={info.end_at} />
                        ) : (
                          "—"
                        )}
                      </span>
                      <span>
                        {t("admin.recruitment.infoColCreatedAt")}:{" "}
                        <FormattedUserActionTime utcIso={info.created_at} />
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(info)} aria-label={t("admin.recruitment.infoEditBtn")}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(info.id)} aria-label={t("admin.recruitment.infoDeleteBtn")}>
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
              {editing ? t("admin.recruitment.infoEditBtn") : t("admin.recruitment.infoAddBtn")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ri-title">{t("admin.recruitment.infoColTitle")}</Label>
              <Input
                id="ri-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ri-content">{t("admin.recruitment.infoColContent")}</Label>
              <Textarea
                id="ri-content"
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ri-dept">{t("admin.recruitment.infoColTargetDept")}</Label>
              <Input
                id="ri-dept"
                value={targetDept}
                onChange={(e) => setTargetDept(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ri-start">{t("admin.recruitment.infoColStartAt")}</Label>
                <Input
                  id="ri-start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ri-end">{t("admin.recruitment.infoColEndAt")}</Label>
                <Input
                  id="ri-end"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 accent-primary cursor-pointer"
              />
              {t("admin.recruitment.infoColEnabled")}
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
                {t("admin.recruitment.infoSaveBtn")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- 社团报名 Tab ---------------- */

function RegistrationsTab() {
  const { t } = useI18n();

  const [items, setItems] = useState<Registration[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | RegistrationStatus>("");
  const [position, setPosition] = useState("");
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListClubRegistrations({
        status_filter: statusFilter || undefined,
        position: position.trim() || undefined,
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
  }, [statusFilter, position, query, page]);

  useEffect(() => {
    load();
  }, [load]);

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

  /** 导出：Blob → 临时 <a> 触发下载 */
  async function handleExport(format: "csv" | "xlsx") {
    setExporting(true);
    setNotice(null);
    try {
      const blob = await adminExportClubRegistrations(format, {
        status_filter: statusFilter || undefined,
        position: position.trim() || undefined,
        q: query || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `club_registrations.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice(t("admin.recruitment.regExportDone"));
    } catch (e) {
      alert(
        `${t("admin.recruitment.regExportFailed")}: ${
          e instanceof Error ? e.message : "Export failed"
        }`
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {notice && (
        <p className="text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-md">
          {notice}
        </p>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              {total} {t("admin.recruitment.registrationsTab")}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => handleExport("csv")} disabled={exporting}>
                <Download className="h-4 w-4 mr-1" />
                {t("admin.recruitment.regExportCsv")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")} disabled={exporting}>
                <Download className="h-4 w-4 mr-1" />
                {t("admin.recruitment.regExportXlsx")}
              </Button>
            </div>
          </div>
          {/* 筛选栏 */}
          <div className="flex items-center gap-2 flex-wrap pt-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "" | RegistrationStatus);
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              aria-label={t("admin.registrations.filterStatus")}
            >
              <option value="">{t("admin.recruitment.regFilterAll")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`admin.registrations.statuses.${s}`)}
                </option>
              ))}
            </select>
            <Input
              placeholder={t("admin.recruitment.regFilterPosition")}
              value={position}
              onChange={(e) => {
                setPosition(e.target.value);
                setPage(1);
              }}
              className="max-w-[180px]"
            />
            <Input
              placeholder={t("admin.recruitment.regSearchPlaceholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-xs"
            />
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
              {t("admin.recruitment.regEmpty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t("admin.recruitment.regColName")}</th>
                    <th className="px-3 py-2">{t("admin.recruitment.regColStudentId")}</th>
                    <th className="px-3 py-2 hidden md:table-cell">{t("admin.recruitment.regColCollege")}</th>
                    <th className="px-3 py-2 hidden lg:table-cell">{t("admin.recruitment.regColMajor")}</th>
                    <th className="px-3 py-2">{t("admin.recruitment.regColPhone")}</th>
                    <th className="px-3 py-2 hidden lg:table-cell">{t("admin.recruitment.regColEmail")}</th>
                    <th className="px-3 py-2 hidden md:table-cell">{t("admin.recruitment.regColPosition")}</th>
                    <th className="px-3 py-2">{t("admin.recruitment.regColStatus")}</th>
                    <th className="px-3 py-2 hidden xl:table-cell">{t("admin.recruitment.regColRemark")}</th>
                    <th className="px-3 py-2 hidden sm:table-cell">{t("admin.recruitment.regColSubmittedAt")}</th>
                    <th className="px-3 py-2 hidden xl:table-cell">{t("admin.recruitment.regColSubmitIp")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.student_id}</td>
                      <td className="px-3 py-2 hidden md:table-cell">{r.college}</td>
                      <td className="px-3 py-2 hidden lg:table-cell">{r.major}</td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                        {r.phone_cc} {r.phone_number}
                      </td>
                      <td className="px-3 py-2 text-xs hidden lg:table-cell">{r.email ?? "—"}</td>
                      <td className="px-3 py-2 text-xs hidden md:table-cell">{r.position ?? "—"}</td>
                      <td className="px-3 py-2">
                        {/* 状态徽章色调对齐审核中心 */}
                        <StatusBadge
                          tone={
                            r.status === "pending" ? "warning"
                            : r.status === "approved" ? "success"
                            : r.status === "rejected" ? "danger"
                            : "info"
                          }
                        >
                          {t(`admin.registrations.statuses.${r.status}`)}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate hidden xl:table-cell">
                        {r.remark ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        <FormattedUserActionTime utcIso={r.submitted_at} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs hidden xl:table-cell">
                        {r.submit_ip ?? "—"}
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
    </div>
  );
}
