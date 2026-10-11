"use client";

/**
 * 项目展示管理组件（Phase 9，对齐后端 app/api/projects.py 管理接口）
 *
 * - 列表：搜索（300ms 防抖）/ 状态筛选 / 服务端分页 / 状态徽章 / 编辑删除
 * - 状态流转：draft（草稿）→ published（发布，前台可见）→ archived（下架）
 * - 新建 → /admin/projects/new；编辑 → /admin/projects/{id}/edit
 * 交互与组件复用对齐 BlogManager（StatusBadge / FormattedUserActionTime / 服务端分页）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Pencil, Trash2, FolderKanban } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/admin/review/StatusBadge";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import {
  adminListProjects,
  adminDeleteProject,
} from "@/lib/api/projects";
import type { Project, ProjectStatus } from "@/types/api";

const PAGE_SIZE = 20;

/** 状态徽章色调（与 BlogManager 同风格） */
const STATUS_TONE: Record<ProjectStatus, "success" | "warning" | "info" | "neutral"> = {
  published: "success",
  draft: "neutral",
  archived: "info",
};

export function ProjectsManager() {
  const { t } = useI18n();
  const router = useRouter();

  const [items, setItems] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 搜索（300ms 防抖）+ 状态筛选 + 分页
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | ProjectStatus>("");
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListProjects({
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
  }, [statusFilter, query, page]);

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

  async function handleDelete(id: number) {
    if (!confirm(t("admin.projects.deleteConfirm"))) return;
    try {
      await adminDeleteProject(id);
      setNotice(t("admin.projects.deleted"));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function statusLabel(s: ProjectStatus) {
    return t(
      s === "draft"
        ? "admin.projects.statusDraft"
        : s === "published"
          ? "admin.projects.statusPublished"
          : "admin.projects.statusArchived"
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button onClick={() => router.push("/admin/projects/new")}>
          <Plus className="h-4 w-4 mr-1.5" />
          {t("admin.projects.newBtn")}
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
              <FolderKanban className="h-4 w-4" />
              {total} {t("admin.projects.colTitle")}
            </CardTitle>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "" | ProjectStatus);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={t("admin.projects.colStatus")}
              >
                <option value="">{t("admin.projects.filterAllStatus")}</option>
                <option value="published">{t("admin.projects.statusPublished")}</option>
                <option value="draft">{t("admin.projects.statusDraft")}</option>
                <option value="archived">{t("admin.projects.statusArchived")}</option>
              </select>
              <Input
                placeholder={t("admin.projects.searchPlaceholder")}
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
              {t("admin.projects.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t("admin.projects.colTitle")}</th>
                    <th className="px-3 py-2">{t("admin.projects.colStatus")}</th>
                    <th className="px-3 py-2 hidden md:table-cell">{t("admin.projects.colTech")}</th>
                    <th className="px-3 py-2 hidden sm:table-cell">{t("admin.projects.colYear")}</th>
                    <th className="px-3 py-2 hidden lg:table-cell">{t("admin.projects.colLeader")}</th>
                    <th className="px-3 py-2 hidden sm:table-cell">{t("admin.projects.colUpdatedAt")}</th>
                    <th className="px-3 py-2 text-right">{t("admin.projects.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium max-w-[220px]">
                        <div className="truncate">{p.title}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                          {p.description || `/${p.slug}`}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={STATUS_TONE[p.status]}>
                          {statusLabel(p.status)}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {p.tech_stack.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            p.tech_stack.slice(0, 3).map((ts) => (
                              <span
                                key={ts}
                                className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
                              >
                                {ts}
                              </span>
                            ))
                          )}
                          {p.tech_stack.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{p.tech_stack.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 hidden sm:table-cell">{p.year}</td>
                      <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell">
                        {p.leader || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        <FormattedUserActionTime utcIso={p.updated_at} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push(`/admin/projects/${p.id}/edit`)}
                            aria-label={t("admin.projects.editBtn")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(p.id)}
                            aria-label={t("admin.projects.deleteBtn")}
                          >
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
    </div>
  );
}
