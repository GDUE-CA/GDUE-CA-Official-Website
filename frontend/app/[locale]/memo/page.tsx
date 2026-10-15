"use client";
/**
 * /[locale]/memo - 说说（Moments）时间线主页
 *
 * 布局：
 *  - PageHeader（面包屑 首页 / 说说 + 主副标题），右上角「新建说说」入口（完整编辑器）
 *  - 双栏：左侧时间线列表（卡片流）/ 右侧日历 + 标签筛选
 *  - 响应式：日历仅桌面端（lg+）展示；移动端隐藏方块日历，
 *    搜索栏提供日期图标 → WheelDatePicker 滚轮式日期选择器做日期筛选
 *
 * Query：
 *  - ?q= 关键词 / ?visibility=public|member_only|all / ?has_image=true|false
 *  - ?tag=slug  按标签筛选（联动 /api/tags/{slug}/memos）
 *
 * 说明：所有发布操作统一进入完整编辑器 /memo/new（列表页不再提供就地撰写）。
 */
import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Search from "@/assets/icons/action/search.svg";
import ImageIcon from "@/assets/icons/status/image.svg";
import ChevronDown from "@/assets/icons/navigation/chevron-down.svg";
import CalendarDays from "@/assets/icons/status/calendar-days.svg";
import PenLine from "@/assets/icons/action/pen-line.svg";
import X from "@/assets/icons/action/x.svg";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { MemoCard } from "@/components/memo/MemoCard";
import { MemoCalendar } from "@/components/memo/MemoCalendar";
import { WheelDatePicker } from "@/components/memo/WheelDatePicker";
import {
  getTimeline,
  listMemosByTag,
  getMemoByDate,
} from "@/lib/api/memos";
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

  /** 移动端日期筛选（YYYY-MM-DD）；桌面端日历选日期走 MemoCalendar 自身的内联展示 */
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    listTags({ limit: 50 }).then((rows) => setTags(rows)).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
    void loadPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, vis, hasImage, tagSlug, dateFilter]);

  async function loadPage(p: number, replace = false) {
    setLoading(true);
    try {
      let resp: PaginatedResponse<MemoBriefOut>;
      if (dateFilter) {
        // 日期筛选：当天全量（后端 /api/memos/calendar/{date} 无分页）
        const r = await getMemoByDate(dateFilter);
        if (replace) setItems(r.items);
        else setItems((prev) => [...prev, ...r.items]);
        setTotal(r.total);
        setHasMore(false);
        setPage(1);
        return;
      }
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
    <>
      <PageHeader title={t("memo.pageTitle")} subtitle={t("memo.subtitle")}>
        {isLogged() && (
          <div className="flex justify-end">
            <Button asChild>
              <Link href={`/${locale}/memo/new`}>
                <PenLine className="h-4 w-4 mr-2" />
                {t("memo.newButton")}
              </Link>
            </Button>
          </div>
        )}
      </PageHeader>

      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* 左：列表 */}
          <div>
            <form onSubmit={submitSearch} className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t("memo.searchPlaceholder")}
                  className="pl-8 h-9"
                />
              </div>
              {/* 移动端日期筛选入口（桌面端由右侧方块日历承担） */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 lg:hidden"
                onClick={() => setPickerOpen(true)}
                aria-label={t("memo.dateFilter.title")}
              >
                <CalendarDays className="h-4 w-4" />
              </Button>
              <Button type="submit" size="sm" variant="outline" className="h-9">
                搜索
              </Button>
            </form>

            {/* 日期筛选生效提示（移动端滚轮选择器 / 跨断点保持） */}
            {dateFilter && (
              <div className="flex items-center gap-2 mb-3 text-xs">
                <span className="inline-flex items-center gap-1 px-2 h-6 rounded-full bg-primary/10 text-primary">
                  <CalendarDays className="h-3 w-3" />
                  {dateFilter}
                  <button
                    type="button"
                    onClick={() => setDateFilter(null)}
                    aria-label={t("memo.dateFilter.clear")}
                    className="ml-0.5 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>
            )}

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

          {/* 右：日历（仅桌面端 lg+；移动端隐藏，改用搜索栏滚轮日期选择器） + 标签 */}
          <aside className="space-y-4">
            <div className="hidden lg:block">
              <MemoCalendar />
            </div>
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

      <WheelDatePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        value={dateFilter}
        onConfirm={(d) => setDateFilter(d)}
      />
    </>
  );
}
