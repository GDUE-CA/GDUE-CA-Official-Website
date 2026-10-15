"use client";

/**
 * BlockList —— 黑名单管理（P0，/setting/privacy/blocks）
 *
 * - 上方搜索：按用户名 / 昵称查找用户并拉黑（防抖 350ms）
 * - 下方列表：当前已拉黑用户，可解除拉黑
 * - 被拉黑用户：无法访问本人主页、无法评论、无法点赞（后端业务侧执行）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Ban from "@/assets/icons/status/ban.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Search from "@/assets/icons/action/search.svg";
import UserCircle from "@/assets/icons/user/user-circle.svg";
import UserX from "@/assets/icons/user/user-x.svg";
import { useI18n } from "@/i18n/provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  blockUser,
  fetchBlocks,
  searchBlockCandidates,
  unblockUser,
} from "@/lib/api/account";
import type { BlockCandidate, BlockedUser } from "@/types/api";

function UserAvatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={name}
        className="h-9 w-9 rounded-full object-cover shrink-0"
      />
    );
  }
  return <UserCircle className="h-9 w-9 shrink-0 text-muted-foreground" />;
}

export function BlockList() {
  const { t } = useI18n();

  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<BlockCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBlocks = useCallback(async () => {
    setLoadingBlocks(true);
    try {
      setBlocks(await fetchBlocks());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setting.blocks.loadFailed"));
    } finally {
      setLoadingBlocks(false);
    }
  }, [t]);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  // 搜索防抖
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const keyword = query.trim();
    if (!keyword) {
      setCandidates([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        setCandidates(await searchBlockCandidates(keyword));
      } catch {
        setCandidates([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const blockedIds = new Set(blocks.map((b) => b.id));

  async function handleBlock(user: BlockCandidate) {
    setBusyId(user.id);
    setError(null);
    try {
      await blockUser({ user_id: user.id });
      setBlocks((prev) => [
        {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          blocked_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setCandidates((prev) => prev.filter((c) => c.id !== user.id));
      setHint(t("setting.blocks.blockedHint", { name: user.username }));
      setTimeout(() => setHint(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setting.blocks.actionFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnblock(user: BlockedUser) {
    setBusyId(user.id);
    setError(null);
    try {
      await unblockUser(user.id);
      setBlocks((prev) => prev.filter((b) => b.id !== user.id));
      setHint(t("setting.blocks.unblockedHint", { name: user.username }));
      setTimeout(() => setHint(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setting.blocks.actionFailed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* 添加拉黑 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ban className="h-4 w-4" />
            {t("setting.blocks.title")}
          </CardTitle>
          <CardDescription>{t("setting.blocks.hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("setting.blocks.searchPlaceholder")}
              className="pl-9"
              maxLength={64}
            />
          </div>

          {searching && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("setting.blocks.searching")}
            </div>
          )}

          {!searching && query.trim() && candidates.length === 0 && (
            <p className="text-sm text-muted-foreground py-1">{t("setting.blocks.noMatch")}</p>
          )}

          <div className="divide-y divide-border/60 rounded-md border border-border">
            {candidates.map((c) => {
              const already = blockedIds.has(c.id);
              return (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                  <UserAvatar url={c.avatar_url} name={c.username} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {c.display_name || c.username}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      @{c.username}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={already || busyId === c.id}
                    onClick={() => void handleBlock(c)}
                    className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {busyId === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Ban className="h-3.5 w-3.5" />
                    )}
                    {already ? t("setting.blocks.blocked") : t("setting.blocks.block")}
                  </button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 已拉黑列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("setting.blocks.listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingBlocks ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : blocks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <UserX className="h-8 w-8" />
              <p className="text-sm">{t("setting.blocks.empty")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60 rounded-md border border-border">
              {blocks.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-3 py-2.5">
                  <UserAvatar url={b.avatar_url} name={b.username} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {b.display_name || b.username}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      @{b.username}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === b.id}
                    onClick={() => void handleUnblock(b)}
                    className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50 shrink-0"
                  >
                    {busyId === b.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {t("setting.blocks.unblock")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {hint && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-600 dark:bg-green-950/20">
          {hint}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
