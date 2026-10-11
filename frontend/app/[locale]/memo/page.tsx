"use client";
/**
 * /[locale]/memo - Memo 碎片笔记时间线主页
 *
 * 布局：
 *  - 顶部 PageHeader + 简介
 *  - 快速编辑器（已登录可见）
 *  - 双栏：左侧时间线列表（卡片流）/ 右侧日历 + 标签筛选
 *
 * Query：
 *  - ?q= 关键词 / ?visibility=public|member_only|all / ?has_image=true|false
 *  - ?tag=slug  按标签筛选（联动 /api/tags/{slug}/memos）
 */
import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { Loader2, Search, Image as ImageIcon, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MemoCard } from "@/components/memo/MemoCard";
import { MemoQuickEditor } from "@/components/memo/MemoQuickEditor";
import { MemoCalendar } from "@/components/memo/MemoCalendar";
import { getTimeline, listMemosByTag } from "@/lib/api/memos";
import { listTags } from "@/lib/api/tags";
import { isLogged, getSession } from "@/lib/auth";
import type { MemoBriefOut, PaginatedResponse } from "@/types/api";
import Link from "next/link";

export default function MemoPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const vis = (params.get("visibility") ?? "all") as
    | "all" | "public" | "member_only";
  const hasImage = params.get("has_image") === "true";
  const tagSlug = params.get("tag") ?? "";

  const [items, setItems] = useState<MemoBriefOut[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<{ id: number; name: string; slug: string }[]>([]);
  const [searchInput, setSearchInput] = useState(q);

  useEffect(() => {
    listTags({ limit: 50 }).then((rows) => setTags(rows)).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
    void loadPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, vis, hasImage, tagSlug]);

  async function loadPage(p: number, replace = false) {
    setLoading(true);
    try {
      let resp: PaginatedResponse<MemoBriefOut>;
      if (tagSlug) {
        resp = await listMemosByTag(tagSlug, { page: p, page_size: 20 });
      } else {
        resp = await getTimeline({
          page: p,
          page_size: 20,
          q: q || undefined,
          visibility: vis,
          has_image: hasImage || undefined,
        });
      }
      if (replace) {
        setItems(resp.items);
      } else {
        setItems((prev) => [...prev, ...resp.items]);
      }
      setTotal(resp.total);
      setHasMore(resp.items.length > 0 && resp.page * resp.page_size < resp.total);
      setPage(resp.page);
    } catch {
      if (replace) {
        setItems([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }

  function pushQuery(updates: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`${pathname}${sp.toString() ? `?${sp}` : ""}`);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    pushQuery({ q: searchInput || null });
  }

  const session = getSession();

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-display font-bold">{t("memo.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("memo.subtitle")}</p>
      </header>

      {isLogged() && (
        <div className="mb-6">
          <MemoQuickEditor
            onCreated={() => loadPage(1, true)}
            onOpenFullEditor={() => router.push(`/${locale}/memo/new`)}
          />
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* 左：列表 */}
        <div>
          <form onSubmit={submitSearch} className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="搜索 Memo..."
                className="pl-8 h-9"
              />
            </div>
            <Button type="submit" size="sm" variant="outline" className="h-9">
              搜索
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
            <span className="text-muted-foreground">{t("memo.timeline.visibilityAll")}：</span>
            {(["all", "public", "member_only"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => pushQuery({ visibility: v === "all" ? null : v })}
                className={
                  "px-2 h-6 rounded-full border " +
                  (vis === v
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                {t(`memo.timeline.visibility${
                  v === "all" ? "All" : v === "public" ? "Public" : "Member"
                }`)}
              </button>
            ))}
            <label className="ml-2 inline-flex items-center gap-1 text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={hasImage}
                onChange={(e) => pushQuery({ has_image: e.target.checked ? "true" : null })}
                className="h-3.5 w-3.5"
              />
              <ImageIcon className="h-3 w-3" />
              {t("memo.timeline.hasImageOnly")}
            </label>
          </div>

          {tagSlug && (
            <div className="text-xs text-muted-foreground mb-3">
              正在按标签筛选：
              <span className="ml-1 px-2 h-5 inline-flex items-center rounded-full bg-primary/10 text-primary">
                #{tagSlug}
              </span>
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => pushQuery({ tag: null })}
              >
                清除
              </button>
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              {t("memo.timeline.empty")}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((m) => (
                <MemoCard
                  key={m.id}
                  memo={m}
                  currentUsername={session?.username ?? null}
                  onChange={() => loadPage(1, true)}
                />
              ))}
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadPage(page + 1)}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                {t("memo.timeline.loadingMore")}
              </Button>
            </div>
          )}
          {!hasMore && items.length > 0 && (
            <div className="text-center mt-6 text-xs text-muted-foreground">
              {t("memo.timeline.endReached")} · 共 {total} 条
            </div>
          )}
        </div>

        {/* 右：日历 + 标签 */}
        <aside className="space-y-4">
          <MemoCalendar />
          {tags.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-sm font-medium mb-2">热门标签</div>
              <div className="flex flex-wrap gap-1">
                {tags.map((tg) => (
                  <Link
                    key={tg.id}
                    href={`?tag=${encodeURIComponent(tg.slug)}`}
                    className="inline-flex items-center px-2 h-6 rounded-full bg-muted text-muted-foreground text-xs hover:bg-primary/10 hover:text-primary"
                  >
                    #{tg.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
