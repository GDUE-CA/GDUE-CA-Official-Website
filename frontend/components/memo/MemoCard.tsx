"use client";
/**
 * MemoCard - 列表项卡片
 *
 * - 顶部：作者头像 + 用户名 + 时间 + 可见性徽标 + 归档徽标
 * - 正文：摘要（excerpt），最多 4 行省略
 * - 底部：标签 chips + 互动按钮（点赞/收藏/评论入口/更多）
 * - 支持三种渲染模式：
 *   - 列表（默认）：摘要 + 互动
 *   - 详情（showFull）：展开渲染 Markdown 正文
 *   - 我的页面（compact）：极简
 */
import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/blog/MarkdownRenderer";
import {
  Heart, Bookmark, MessageCircle, Lock, Users, Globe, Archive,
  MoreHorizontal, Eye,
} from "lucide-react";
import {
  toggleLike, toggleFavorite, deleteMemo, archiveMemo, unarchiveMemo,
} from "@/lib/api/memos";
import { isLogged } from "@/lib/auth";
import type { MemoBriefOut, MemoOut } from "@/types/api";
import { useRouter } from "next/navigation";

interface MemoCardProps {
  memo: MemoBriefOut | MemoOut;
  onChange?: () => void;
  showFull?: boolean;
  compact?: boolean;
  /** 当前用户名：用于判断是否显示"删除/归档"作者操作 */
  currentUsername?: string | null;
  className?: string;
}

function visibilityIcon(v: string) {
  if (v === "private") return <Lock className="h-3 w-3" />;
  if (v === "member_only") return <Users className="h-3 w-3" />;
  return <Globe className="h-3 w-3" />;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return d.toISOString().slice(0, 10);
}

export function MemoCard({
  memo, onChange, showFull, compact, currentUsername, className,
}: MemoCardProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const isFull = showFull && "content_md" in memo;
  const logged = isLogged();
  const isAuthor = currentUsername && memo.author?.username === currentUsername;
  const [busy, setBusy] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  const localePath = (href: string) => `/${locale}${href}`;

  // 类型归一：MemoBriefOut 自带 excerpt/has_image/first_image_url；MemoOut 没有这些但有 attachments
  const firstImg = (() => {
    if ("first_image_url" in memo && memo.first_image_url) return memo.first_image_url;
    if ("attachments" in memo) {
      const img = memo.attachments.find((a) => a.kind === "image");
      return img?.url ?? null;
    }
    return null;
  })();
  const hasImg = (() => {
    if ("has_image" in memo) return memo.has_image;
    if ("attachments" in memo) return memo.attachments.some((a) => a.kind === "image");
    return false;
  })();
  const excerptText = (() => {
    if ("excerpt" in memo) return memo.excerpt;
    if ("content_md" in memo) return memo.content_md.slice(0, 200);
    return "";
  })();

  async function withBusy(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
      onChange?.();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  return (
    <article
      className={cn(
        "rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30",
        compact && "p-3",
        className,
      )}
    >
      {/* 头部 */}
      <header className="flex items-center gap-2 mb-2">
        <div className="h-7 w-7 rounded-full overflow-hidden bg-muted shrink-0">
          {memo.author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={memo.author.avatar_url}
              alt={memo.author.username}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
              {memo.author?.username.slice(0, 1).toUpperCase() ?? "?"}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap text-xs">
          <span className="font-medium text-foreground truncate">
            {memo.author?.username ?? "(deleted)"}
          </span>
          <span className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-full bg-muted text-muted-foreground">
            {visibilityIcon(memo.visibility)}
            {t(`memo.visibility.${memo.visibility}`)}
          </span>
          {memo.archived && (
            <span className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-full bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 text-[10px]">
              <Archive className="h-3 w-3" />
              {t("memo.card.archived")}
            </span>
          )}
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{timeAgo(memo.created_at)}</span>
        </div>
        {isAuthor && (
          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            className="p-1 rounded hover:bg-muted"
            aria-label="more"
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </header>

      {/* 正文 */}
      {isFull ? (
        <div className="text-sm leading-relaxed">
          <MarkdownRenderer content={(memo as MemoOut).content_md} />
        </div>
      ) : (
        <Link
          href={localePath(`/memo/${memo.id}`)}
          className="block text-sm leading-relaxed line-clamp-4 hover:text-primary transition-colors"
        >
          {excerptText}
        </Link>
      )}

      {/* 图片预览缩略图 */}
      {hasImg && firstImg && (
        <Link href={localePath(`/memo/${memo.id}`)} className="block mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={firstImg}
            alt=""
            className="rounded border border-border max-h-48 object-cover"
          />
        </Link>
      )}

      {/* 标签 */}
      {memo.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {memo.tags.map((tg) => (
            <Link
              key={tg.id}
              href={localePath(`/memo?tag=${encodeURIComponent(tg.slug)}`)}
              className="inline-flex items-center px-1.5 h-5 rounded-full bg-primary/10 text-primary text-[10px] hover:bg-primary/20"
            >
              #{tg.name}
            </Link>
          ))}
        </div>
      )}

      {/* 互动按钮 */}
      <footer className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        <button
          type="button"
          disabled={busy === "like" || memo.visibility === "private" && !isAuthor}
          onClick={() =>
            logged
              ? withBusy("like", () => toggleLike(memo.id))
              : router.push(localePath("/admin/login"))
          }
          className={cn(
            "inline-flex items-center gap-1 px-2 h-7 rounded hover:bg-muted transition-colors",
            memo.liked_by_me && "text-pink-500",
          )}
        >
          <Heart
            className={cn("h-3.5 w-3.5", memo.liked_by_me && "fill-current")}
          />
          {memo.like_count}
        </button>
        <button
          type="button"
          disabled={busy === "fav" || memo.visibility === "private" && !isAuthor}
          onClick={() =>
            logged
              ? withBusy("fav", () => toggleFavorite(memo.id))
              : router.push(localePath("/admin/login"))
          }
          className={cn(
            "inline-flex items-center gap-1 px-2 h-7 rounded hover:bg-muted transition-colors",
            memo.favorited_by_me && "text-yellow-500",
          )}
        >
          <Bookmark
            className={cn("h-3.5 w-3.5", memo.favorited_by_me && "fill-current")}
          />
          {memo.favorite_count}
        </button>
        <Link
          href={localePath(`/memo/${memo.id}#comments`)}
          className="inline-flex items-center gap-1 px-2 h-7 rounded hover:bg-muted"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {memo.comment_count}
        </Link>
        {!compact && (
          <Link
            href={localePath(`/memo/${memo.id}`)}
            className="ml-auto inline-flex items-center gap-1 px-2 h-7 rounded hover:bg-muted"
          >
            <Eye className="h-3.5 w-3.5" />
            {t("memo.card.more")}
          </Link>
        )}
      </footer>

      {/* 作者更多操作 */}
      {isAuthor && showMore && (
        <div className="mt-2 pt-2 border-t border-border flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() =>
              withBusy("archive", () =>
                memo.archived ? unarchiveMemo(memo.id) : archiveMemo(memo.id),
              )
            }
          >
            {memo.archived ? t("memo.actions.unarchive") : t("memo.actions.archive")}
          </button>
          <Link
            href={localePath(`/memo/${memo.id}/edit`)}
            className="text-muted-foreground hover:text-foreground"
          >
            {t("memo.actions.edit")}
          </Link>
          <button
            type="button"
            className="text-destructive hover:underline"
            onClick={() => {
              if (window.confirm(t("memo.actions.deleteConfirm"))) {
                withBusy("delete", () => deleteMemo(memo.id));
              }
            }}
          >
            {t("memo.actions.delete")}
          </button>
        </div>
      )}
    </article>
  );
}
