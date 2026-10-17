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
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Plus from "@/assets/icons/action/plus.svg";
import Pencil from "@/assets/icons/action/pencil.svg";
import Trash2 from "@/assets/icons/action/trash-2.svg";
import Newspaper from "@/assets/icons/status/newspaper.svg";
import Tags from "@/assets/icons/status/tags.svg";
import Check from "@/assets/icons/action/check.svg";
import X from "@/assets/icons/action/x.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/admin/review/StatusBadge";
import { AdminList } from "@/components/admin/shared/AdminList";
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
  const lp = useLocalizedPath();
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
        <Button variant="outline" onClick={() => router.push(lp("/admin/blog/tags"))}>
          <Tags className="h-4 w-4 mr-1.5" />
          {t("admin.blog.tagsManage")}
        </Button>
        <Button onClick={() => router.push(lp("/admin/blog/new"))}>
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
            <AdminList<BlogPost>
              rows={items}
              rowKey={(p) => p.id}
              tableClassName="w-full text-sm"
              tableHeadClassName="bg-muted/50 text-left text-xs uppercase text-muted-foreground"
              headRowClassName=""
              headerCellBaseClassName="px-3 py-2"
              cellBaseClassName="px-3 py-2"
              headerCellTextClassName=""
              // 外层 CardContent 自带 padding，移动卡片不重复加 p-3
              mobileContainerClassName="space-y-3"
              mobileTitle={(p) => p.title}
              mobileBadge={(p) => (
                <StatusBadge tone={STATUS_TONE[p.status]}>{statusLabel(p.status)}</StatusBadge>
              )}
              columns={[
                {
                  key: "id",
                  header: t("admin.blog.colId"),
                  headerClassName: "w-12",
                  cellClassName: "text-xs text-muted-foreground font-mono",
                  mobileLabel: t("admin.blog.colId"),
                  mobileMono: true,
                  render: (p) => p.id,
                },
                {
                  key: "title",
                  header: t("admin.blog.colTitle"),
                  cellClassName: "font-medium max-w-[220px] truncate",
                  // 标题已是卡片主标识
                  render: (p) => p.title,
                },
                {
                  key: "status",
                  header: t("admin.blog.colStatus"),
                  // 状态在卡片右上角徽标展示
                  render: (p) => (
                    <StatusBadge tone={STATUS_TONE[p.status]}>
                      {statusLabel(p.status)}
                    </StatusBadge>
                  ),
                },
                {
                  key: "tags",
                  header: t("admin.blog.colTags"),
                  headerClassName: "hidden md:table-cell",
                  cellClassName: "hidden md:table-cell",
                  mobileLabel: t("admin.blog.colTags"),
                  render: (p) => (
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
                  ),
                },
                {
                  key: "author",
                  header: t("admin.blog.colAuthor"),
                  headerClassName: "hidden lg:table-cell",
                  cellClassName: "text-muted-foreground hidden lg:table-cell",
                  mobileLabel: t("admin.blog.colAuthor"),
                  render: (p) => p.author ?? "—",
                },
                {
                  key: "published_at",
                  header: t("admin.blog.colPublished"),
                  headerClassName: "hidden lg:table-cell",
                  cellClassName:
                    "text-xs text-muted-foreground whitespace-nowrap hidden lg:table-cell",
                  mobileLabel: t("admin.blog.colPublished"),
                  render: (p) =>
                    p.published_at ? (
                      <FormattedUserActionTime utcIso={p.published_at} />
                    ) : (
                      "—"
                    ),
                },
                {
                  key: "like_count",
                  header: t("admin.blog.colLike"),
                  headerClassName: "text-center hidden xl:table-cell",
                  cellClassName: "text-center hidden xl:table-cell",
                  mobileLabel: t("admin.blog.colLike"),
                  render: (p) => (
                    <span className="inline-flex items-center gap-0.5 text-xs">
                      {p.like_count}
                    </span>
                  ),
                },
                {
                  key: "comment_count",
                  header: t("admin.blog.colComment"),
                  headerClassName: "text-center hidden xl:table-cell",
                  cellClassName: "text-center hidden xl:table-cell",
                  mobileLabel: t("admin.blog.colComment"),
                  render: (p) => (
                    <span className="inline-flex items-center gap-0.5 text-xs">
                      {p.comment_count}
                    </span>
                  ),
                },
                {
                  key: "share_count",
                  header: t("admin.blog.colShare"),
                  headerClassName: "text-center hidden xl:table-cell",
                  cellClassName: "text-center hidden xl:table-cell",
                  mobileLabel: t("admin.blog.colShare"),
                  render: (p) => (
                    <span className="inline-flex items-center gap-0.5 text-xs">
                      {p.share_count}
                    </span>
                  ),
                },
                {
                  key: "favourite_count",
                  header: t("admin.blog.colFavourite"),
                  headerClassName: "text-center hidden xl:table-cell",
                  cellClassName: "text-center hidden xl:table-cell",
                  mobileLabel: t("admin.blog.colFavourite"),
                  render: (p) => (
                    <span className="inline-flex items-center gap-0.5 text-xs">
                      {p.favourite_count}
                    </span>
                  ),
                },
                {
                  key: "allow_comments",
                  header: t("admin.blog.colAllowComments"),
                  headerClassName: "text-center hidden xl:table-cell",
                  cellClassName: "text-center hidden xl:table-cell",
                  mobileLabel: t("admin.blog.colAllowComments"),
                  render: (p) =>
                    p.allow_comments ? (
                      <span
                        className="text-emerald-600 font-semibold"
                        title={t("admin.blog.allowCommentsYes")}
                      >
                        <Check className="inline h-4 w-4" />
                      </span>
                    ) : (
                      <span
                        className="text-muted-foreground"
                        title={t("admin.blog.allowCommentsNo")}
                      >
                        <X className="inline h-4 w-4" />
                      </span>
                    ),
                },
              ]}
              actionsHeader={t("admin.activities.actions")}
              actions={(p) => (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(lp(`/admin/blog/${p.id}/edit`))}
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
                </>
              )}
            />
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
