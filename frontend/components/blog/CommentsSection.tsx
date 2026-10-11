"use client";

/**
 * 博客文章评论区（公开）
 *
 * - 列表：仅后端 visible 状态（软删除/下架由后端过滤），时间正序，「加载更多」分页
 * - 属地：按语言渲染 location_zh / location_en；"local"/"intranet" 特殊枚举走 i18n
 * - 提交：昵称 + 内容（纯文本，React 转义渲染）；后端双开关关闭时 allowed=false 隐藏表单
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import { createPublicComment, listPublicComments } from "@/lib/api/comments";
import type { CommentPublic } from "@/types/api";

const PAGE_SIZE = 10;

export function CommentsSection({ postId }: { postId: number }) {
  const { t, locale } = useI18n();

  const [items, setItems] = useState<CommentPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [allowed, setAllowed] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 提交表单
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listPublicComments(postId, 1, PAGE_SIZE);
      setItems(res.items);
      setTotal(res.total);
      setAllowed(res.allowed);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await listPublicComments(postId, next, PAGE_SIZE);
      setItems((prev) => [...prev, ...res.items]);
      setTotal(res.total);
      setPage(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !content.trim() || submitting) return;
    setSubmitting(true);
    setNotice(null);
    setError(null);
    try {
      await createPublicComment(postId, {
        author_name: name.trim(),
        content: content.trim(),
      });
      setContent("");
      setNotice(t("comments.submitOk"));
      // 回到第一页并刷新，新评论按时间正序在最前
      const res = await listPublicComments(postId, 1, PAGE_SIZE);
      setItems(res.items);
      setTotal(res.total);
      setAllowed(res.allowed);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  /** 属地展示：zh 系语言用 location_zh，其余用 location_en；特殊枚举走 i18n */
  function locationLabel(c: CommentPublic): string | null {
    const raw = locale.startsWith("zh") ? c.location_zh : c.location_en;
    if (!raw) return null;
    if (raw === "local") return t("comments.locLocal");
    if (raw === "intranet") return t("comments.locIntranet");
    return raw;
  }

  return (
    <Card className="mt-12">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          {t("comments.title")}
          {total > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({total})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {notice && (
          <p className="text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-md">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
            {error}
          </p>
        )}

        {/* 评论列表 */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t("comments.empty")}
          </p>
        ) : (
          <ul className="space-y-4">
            {items.map((c) => {
              const loc = locationLabel(c);
              return (
                <li key={c.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm mb-1.5">
                    <span className="font-medium">{c.author_name}</span>
                    {loc && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                        {loc}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      <FormattedUserActionTime utcIso={c.created_at} />
                    </span>
                  </div>
                  {/* 纯文本渲染（React 自动转义，杜绝 XSS） */}
                  <p className="text-sm whitespace-pre-wrap break-words text-foreground/90">
                    {c.content}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {/* 加载更多 */}
        {page < totalPages && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t("comments.loadMore")}
            </Button>
          </div>
        )}

        {/* 提交表单：双开关关闭时隐藏（后端同时校验 403 兜底） */}
        {allowed ? (
          <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">{t("comments.formHint")}</p>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("comments.namePlaceholder")}
              maxLength={64}
              required
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("comments.contentPlaceholder")}
              maxLength={1000}
              rows={4}
              required
              className="flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting || !name.trim() || !content.trim()}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1.5" />
                )}
                {t("comments.submitBtn")}
              </Button>
            </div>
          </form>
        ) : (
          !loading && (
            <p className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
              {t("comments.closed")}
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}
