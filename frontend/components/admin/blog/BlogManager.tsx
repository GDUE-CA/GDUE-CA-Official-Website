"use client";

/**
 * 博客文章管理组件
 *
 * - 列表：搜索 / 状态筛选 / 标签筛选 / 服务端分页 / 状态徽章 / 编辑删除
 * - 新建 → /admin/blog/new；编辑 → /admin/blog/{id}/edit；标签管理 → /admin/blog/tags
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Pencil, Trash2, Newspaper, Tags } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/admin/review/StatusBadge";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import {
  adminListBlogPosts,
  adminListBlogTags,
  adminDeleteBlogPost,
} from "@/lib/api/blog";
import type { BlogPost, BlogPostStatus } from "@/types/api";

const PAGE_SIZE = 20;

/** 状态徽章色调 */
const STATUS_TONE: Record<BlogPostStatus, "success" | "warning" | "info" | "neutral"> = {
  published: "success",
  draft: "neutral",
  scheduled: "warning",
  archived: "info",
};

export function BlogManager() {
  const { t } = useI18n();
  const router = useRouter();

  const [items, setItems] = useState<BlogPost[]>([]);
  const [tags, setTags] = useState<{ id: number; name: string; slug: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 搜索（300ms 防抖）+ 状态/标签筛选 + 分页
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | BlogPostStatus>("");
  const [tagFilter, setTagFilter] = useState("");
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListBlogPosts({
        status: statusFilter || undefined,
        tag: tagFilter || undefined,
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
  }, [statusFilter, tagFilter, query, page]);

  useEffect(() => {
    load();
  }, [load]);

  // 标签筛选下拉只拉一次
  useEffect(() => {
    adminListBlogTags()
      .then(setTags)
      .catch(() => setTags([]));
  }, []);

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
    if (!confirm(t("admin.blog.deleteConfirm"))) return;
    try {
      await adminDeleteBlogPost(id);
      setNotice(t("admin.blog.deleted"));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function statusLabel(s: BlogPostStatus) {
    return t(
      s === "draft"
        ? "admin.blog.statusDraft"
        : s === "published"
          ? "admin.blog.statusPublished"
          : s === "scheduled"
            ? "admin.blog.statusScheduled"
            : "admin.blog.statusArchived"
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/admin/blog/tags")}>
          <Tags className="h-4 w-4 mr-1.5" />
          {t("admin.blog.tagsManage")}
        </Button>
        <Button onClick={() => router.push("/admin/blog/new")}>
          <Plus className="h-4 w-4 mr-1.5" />
          {t("admin.blog.newBtn")}
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
              <Newspaper className="h-4 w-4" />
              {total} {t("admin.blog.colTitle")}
            </CardTitle>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "" | BlogPostStatus);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={t("admin.blog.colStatus")}
              >
                <option value="">{t("admin.blog.filterAllStatus")}</option>
                <option value="published">{t("admin.blog.statusPublished")}</option>
                <option value="draft">{t("admin.blog.statusDraft")}</option>
                <option value="scheduled">{t("admin.blog.statusScheduled")}</option>
                <option value="archived">{t("admin.blog.statusArchived")}</option>
              </select>
              <select
                value={tagFilter}
                onChange={(e) => {
                  setTagFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={t("admin.blog.colTags")}
              >
                <option value="">{t("admin.blog.filterAllTags")}</option>
                {tags.map((tg) => (
                  <option key={tg.id} value={tg.slug}>{tg.name}</option>
                ))}
              </select>
              <Input
                placeholder={t("admin.blog.searchPlaceholder")}
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
              {t("admin.blog.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t("admin.blog.colTitle")}</th>
                    <th className="px-3 py-2">{t("admin.blog.colStatus")}</th>
                    <th className="px-3 py-2 hidden md:table-cell">{t("admin.blog.colTags")}</th>
                    <th className="px-3 py-2 hidden lg:table-cell">{t("admin.blog.colAuthor")}</th>
                    <th className="px-3 py-2 hidden lg:table-cell">{t("admin.blog.colPublished")}</th>
                    <th className="px-3 py-2 hidden sm:table-cell">{t("admin.blog.colUpdatedAt")}</th>
                    <th className="px-3 py-2 text-right">{t("admin.activities.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium max-w-[220px] truncate">
                        {p.title}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={STATUS_TONE[p.status]}>
                          {statusLabel(p.status)}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1 max-w-[160px]">
                          {p.tags.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            p.tags.map((tg) => (
                              <span
                                key={tg.id}
                                className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
                              >
                                {tg.name}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell">
                        {p.author ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap hidden lg:table-cell">
                        {p.published_at ? (
                          <FormattedUserActionTime utcIso={p.published_at} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        <FormattedUserActionTime utcIso={p.updated_at} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push(`/admin/blog/${p.id}/edit`)}
                            aria-label={t("admin.blog.editBtn")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(p.id)}
                            aria-label={t("admin.blog.deleteBtn")}
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
