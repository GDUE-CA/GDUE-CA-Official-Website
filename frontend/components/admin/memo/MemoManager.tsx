"use client";
/**
 * MemoManager - 后台 Memo 全量管理
 *
 * 列表（支持搜索 / 可见性 / 状态 / 归档 筛选） + 单条下架 / 恢复。
 * 复用 lib/api/memos.adminXxx 系列。
 */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Loader2, Search, Eye, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemoCard } from "@/components/memo/MemoCard";
import { adminListMemos, adminGetMemo, adminRemoveMemo, adminRestoreMemo } from "@/lib/api/memos";
import { getSession } from "@/lib/auth";
import type { MemoBriefOut, MemoOut } from "@/types/api";
import { cn } from "@/lib/utils";

type Tab = "all" | "removed" | "archived";

export function MemoManager() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("all");
  const [items, setItems] = useState<MemoBriefOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [author, setAuthor] = useState("");
  const [visibility, setVisibility] = useState<"all" | "public" | "member_only" | "private">("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [active, setActive] = useState<MemoOut | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    void load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, author, visibility]);

  async function load(p: number, replace = false) {
    setLoading(true);
    try {
      const resp = await adminListMemos({
        page: p,
        page_size: 20,
        q: search || undefined,
        author: author || undefined,
        visibility,
        admin_removed: tab === "removed" ? true : undefined,
        archived: tab === "archived" ? true : undefined,
      });
      if (replace) setItems(resp.items);
      else setItems((prev) => [...prev, ...resp.items]);
      setHasMore(resp.items.length > 0 && resp.page * resp.page_size < resp.total);
      setPage(resp.page);
    } catch {
      if (replace) setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(id: number) {
    setBusy(`open-${id}`);
    try {
      const m = await adminGetMemo(id);
      setActive(m);
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("下架此 Memo？下架后时间线 / 详情页不再展示，可恢复。")) return;
    setBusy(`rm-${id}`);
    try {
      await adminRemoveMemo(id);
      await load(1, true);
    } finally {
      setBusy(null);
    }
  }

  async function restore(id: number) {
    setBusy(`rs-${id}`);
    try {
      await adminRestoreMemo(id);
      await load(1, true);
    } finally {
      setBusy(null);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "archived", label: "已归档" },
    { key: "removed", label: "已下架" },
  ];

  const session = getSession();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-border">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={cn(
              "px-3 h-9 text-sm border-b-2 -mb-px",
              tab === tb.key
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground",
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-3 gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load(1, true);
          }}
          className="relative"
        >
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="正文关键词"
            className="pl-8 h-9"
          />
        </form>
        <Input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="作者用户名"
          className="h-9"
        />
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as typeof visibility)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="all">全部可见性</option>
          <option value="public">仅公开</option>
          <option value="member_only">成员可见</option>
          <option value="private">仅作者</option>
        </select>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">无数据</div>
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <div key={m.id} className="flex items-stretch gap-2">
              <div className="flex-1">
                <MemoCard
                  memo={m}
                  currentUsername={session?.username ?? null}
                />
              </div>
              <div className="flex flex-col gap-1.5 w-24">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openDetail(m.id)}
                  disabled={busy === `open-${m.id}`}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                {tab === "removed" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => restore(m.id)}
                    disabled={busy === `rs-${m.id}`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => remove(m.id)}
                    disabled={busy === `rm-${m.id}`}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => load(page + 1)} disabled={loading}>
            {t("memo.timeline.loadingMore")}
          </Button>
        </div>
      )}

      {active && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setActive(null)}
        >
          <div
            className="bg-background max-w-2xl w-full max-h-[80vh] overflow-y-auto rounded-lg p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <MemoCard memo={active} showFull currentUsername={session?.username ?? null} />
            <div className="flex justify-end mt-3">
              <Button variant="outline" size="sm" onClick={() => setActive(null)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
