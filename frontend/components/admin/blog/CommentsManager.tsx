"use client";

/**
 * 博客评论管理组件（后台）
 *
 * - 列表：状态筛选 / 搜索 / 服务端分页 / 状态徽章 / 完整 IP + 属地（仅后台可见）
 * - 操作：下架（软删除 status=admin_removed）/ 恢复（visible）；无物理删除
 * - 全局开关：comments_enabled（与文章级 allow_comments 叠加生效）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, MessageSquare, Power } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/admin/review/StatusBadge";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import {
  adminGetCommentSettings,
  adminListComments,
  adminRemoveComment,
  adminRestoreComment,
  adminUpdateCommentSettings,
} from "@/lib/api/comments";
import type { CommentAdmin, CommentStatus } from "@/types/api";

const PAGE_SIZE = 20;

/** 状态徽章色调 */
const STATUS_TONE: Record<CommentStatus, "success" | "warning" | "info" | "neutral"> = {
  visible: "success",
  user_deleted: "neutral",
  admin_removed: "warning",
};

export function CommentsManager() {
  const { t, locale } = useI18n();

  const [items, setItems] = useState<CommentAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 搜索（300ms 防抖）+ 状态筛选 + 分页
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | CommentStatus>("");
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 全局评论开关
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListComments({
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

  useEffect(() => {
    adminGetCommentSettings()
      .then((s) => setGlobalEnabled(s.comments_enabled))
      .catch(() => setGlobalEnabled(true));
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

  async function handleToggleGlobal() {
    if (toggling) return;
    setToggling(true);
    try {
      const next = !globalEnabled;
      const s = await adminUpdateCommentSettings(next);
      setGlobalEnabled(s.comments_enabled);
      setNotice(
        s.comments_enabled ? t("admin.comments.globalOn") : t("admin.comments.globalOff")
      );
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setToggling(false);
    }
  }

  async function handleRemove(id: number) {
    if (!confirm(t("admin.comments.removeConfirm"))) return;
    try {
      await adminRemoveComment(id);
      setNotice(t("admin.comments.removed"));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Remove failed");
    }
  }

  async function handleRestore(id: number) {
    try {
      await adminRestoreComment(id);
      setNotice(t("admin.comments.restored"));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Restore failed");
    }
  }

  function statusLabel(s: CommentStatus) {
    return t(
      s === "visible"
        ? "admin.comments.statusVisible"
        : s === "user_deleted"
          ? "admin.comments.statusUserDeleted"
          : "admin.comments.statusAdminRemoved"
    );
  }

  /** 属地展示：zh 系语言用 location_zh，其余用 location_en；特殊枚举走 i18n */
  function locationLabel(c: CommentAdmin): string | null {
    const raw = locale.startsWith("zh") ? c.location_zh : c.location_en;
    if (!raw) return null;
    if (raw === "local") return t("comments.locLocal");
    if (raw === "intranet") return t("comments.locIntranet");
    return raw;
  }

  return (
    <div className="space-y-4">
      {notice && (
        <p className="text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-md">
          {notice}
        </p>
      )}

      {/* 全局评论开关 */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Power className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t("admin.comments.globalTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.comments.globalDesc")}
                </p>
              </div>
            </div>
            <Button
              variant={globalEnabled ? "destructive" : "default"}
              size="sm"
              onClick={handleToggleGlobal}
              disabled={toggling}
            >
              {toggling && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {globalEnabled ? t("admin.comments.globalDisable") : t("admin.comments.globalEnable")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              {total} {t("admin.comments.colContent")}
            </CardTitle>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "" | CommentStatus);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={t("admin.comments.colStatus")}
              >
                <option value="">{t("admin.comments.filterAllStatus")}</option>
                <option value="visible">{t("admin.comments.statusVisible")}</option>
                <option value="user_deleted">{t("admin.comments.statusUserDeleted")}</option>
                <option value="admin_removed">{t("admin.comments.statusAdminRemoved")}</option>
              </select>
              <Input
                placeholder={t("admin.comments.searchPlaceholder")}
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
              {t("admin.comments.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t("admin.comments.colContent")}</th>
                    <th className="px-3 py-2">{t("admin.comments.colAuthor")}</th>
                    <th className="px-3 py-2 hidden md:table-cell">{t("admin.comments.colPost")}</th>
                    <th className="px-3 py-2 hidden lg:table-cell">{t("admin.comments.colIp")}</th>
                    <th className="px-3 py-2 hidden md:table-cell">{t("admin.comments.colLocation")}</th>
                    <th className="px-3 py-2">{t("admin.comments.colStatus")}</th>
                    <th className="px-3 py-2 hidden sm:table-cell">{t("admin.comments.colCreatedAt")}</th>
                    <th className="px-3 py-2 text-right">{t("admin.comments.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 max-w-[240px]">
                        <p className="truncate" title={c.content}>{c.content}</p>
                      </td>
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{c.author_name}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate hidden md:table-cell">
                        {c.post_title ?? "—"}
                      </td>
                      {/* 完整 IP 仅后台展示 */}
                      <td className="px-3 py-2 font-mono text-xs hidden lg:table-cell">
                        {c.submit_ip ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap hidden md:table-cell">
                        {locationLabel(c) ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={STATUS_TONE[c.status]}>{statusLabel(c.status)}</StatusBadge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        <FormattedUserActionTime utcIso={c.created_at} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          {c.status === "visible" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemove(c.id)}
                              aria-label={t("admin.comments.removeBtn")}
                            >
                              <EyeOff className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRestore(c.id)}
                              aria-label={t("admin.comments.restoreBtn")}
                            >
                              <Eye className="h-4 w-4 text-emerald-600" />
                            </Button>
                          )}
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
