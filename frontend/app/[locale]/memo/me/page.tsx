"use client";
/**
 * /[locale]/memo/me - 我的 Memo（个人中心 Tab 入口）
 *
 * 子 Tab：全部 / 归档 / 点赞 / 收藏
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { Loader2, FileText, Archive, Heart, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MemoCard } from "@/components/memo/MemoCard";
import {
  listMyMemos, listLikedMemos, listFavoriteMemos,
} from "@/lib/api/memos";
import { isLogged, getSession } from "@/lib/auth";
import type { MemoBriefOut } from "@/types/api";

type Tab = "mine" | "archived" | "liked" | "favorites";

export default function MyMemosPage() {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>("mine");
  const [items, setItems] = useState<MemoBriefOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const logged = isLogged();
  const session = getSession();

  useEffect(() => {
    if (!logged) {
      setLoading(false);
      return;
    }
    setPage(1);
    void loadTab(tab, 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, logged]);

  async function loadTab(t: Tab, p: number, replace = false) {
    setLoading(true);
    try {
      let resp;
      if (t === "liked") {
        resp = await listLikedMemos({ page: p, page_size: 20 });
      } else if (t === "favorites") {
        resp = await listFavoriteMemos({ page: p, page_size: 20 });
      } else if (t === "archived") {
        resp = await listMyMemos({ archived: true, page: p, page_size: 20 });
      } else {
        resp = await listMyMemos({ archived: false, page: p, page_size: 20 });
      }
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

  if (!logged) {
    return (
      <div className="container max-w-2xl py-16 text-center space-y-3">
        <h1 className="text-2xl font-bold">{t("profileMemoTab.empty")}</h1>
        <p className="text-muted-foreground">{t("profile.loginRequired")}</p>
        <Button asChild>
          <Link href={`/${locale}/admin/login`}>{t("profile.goLogin")}</Link>
        </Button>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "mine", label: t("memo.tabs.mine"), icon: FileText },
    { key: "archived", label: t("memo.tabs.archived"), icon: Archive },
    { key: "liked", label: t("memo.tabs.liked"), icon: Heart },
    { key: "favorites", label: t("memo.tabs.favorites"), icon: Bookmark },
  ];

  return (
    <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-2xl font-display font-bold mb-1">
        {t("profile.tabs.memo")} · {session?.username}
      </h1>
      <p className="text-sm text-muted-foreground mb-4">
        {t("memo.subtitle")}
      </p>

      <div className="flex items-center gap-1 border-b border-border mb-4">
        {tabs.map((tb) => {
          const active = tb.key === tab;
          const Icon = tb.icon;
          return (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={cn(
                "inline-flex items-center gap-1 px-3 h-9 text-sm border-b-2 -mb-px",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tb.label}
            </button>
          );
        })}
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {t("profileMemoTab.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <MemoCard
              key={m.id}
              memo={m}
              currentUsername={session?.username ?? null}
              onChange={() => loadTab(tab, 1, true)}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-6">
          <Button variant="outline" size="sm" onClick={() => loadTab(tab, page + 1)} disabled={loading}>
            {t("memo.timeline.loadingMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
