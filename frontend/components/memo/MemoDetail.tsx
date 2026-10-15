"use client";
/**
 * MemoDetail - 详情视图（含互动 + 作者操作）
 *
 * 配合 /memo/[id] 页面使用；
 * 若 `editable` 开启，下方嵌入 VersionPanel 与编辑入口。
 */
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { MarkdownRenderer } from "@/components/blog/MarkdownRenderer";
import { BadgeList } from "@/components/user/BadgeChip";
import {
  Heart, Bookmark, MessageCircle, Lock, Users, Globe, Archive, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  toggleLike, toggleFavorite, archiveMemo, unarchiveMemo, deleteMemo,
} from "@/lib/api/memos";
import { isLogged, getSession } from "@/lib/auth";
import type { MemoOut } from "@/types/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShareDialog } from "./ShareDialog";
import { VersionPanel } from "./VersionPanel";
import { cn } from "@/lib/utils";

interface MemoDetailProps {
  memo: MemoOut;
  onChange?: (memo: MemoOut) => void;
  onDelete?: () => void;
  onRollback?: (memo: MemoOut) => void;
}

function visIcon(v: string) {
  if (v === "private") return <Lock className="h-3 w-3" />;
  if (v === "member_only") return <Users className="h-3 w-3" />;
  return <Globe className="h-3 w-3" />;
}

function fmt(iso: string) {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16);
}

export function MemoDetail({ memo, onChange, onDelete, onRollback }: MemoDetailProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [showVersions, setShowVersions] = useState(false);
  const session = getSession();
  const isAuthor = session?.username === memo.author?.username;
  const logged = isLogged();

  const localePath = (href: string) => `/${locale}${href}`;

  const authorUsername = memo.author?.username ?? null;
  const authorDisplay =
    memo.author?.display_name || memo.author?.username || "(deleted)";
  const authorHome = authorUsername ? localePath(`/u/${authorUsername}`) : null;

  const avatarInner = (
    <div className="h-7 w-7 rounded-full overflow-hidden bg-muted">
      {memo.author?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={memo.author.avatar_url}
          className="h-full w-full object-cover"
          alt={authorDisplay}
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
          {authorDisplay.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );

  return (
    <article className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        {/* 头部：头像 / 昵称均可点击跳转个人主页；主名称 display_name，@username 次要 */}
        <header className="flex items-center gap-2 flex-wrap text-xs">
          {authorHome ? (
            <Link
              href={authorHome}
              className="shrink-0 rounded-full max-md:p-2 max-md:-m-2"
              aria-label={authorDisplay}
            >
              {avatarInner}
            </Link>
          ) : (
            avatarInner
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {authorHome ? (
                <Link
                  href={authorHome}
                  className="font-medium text-foreground text-sm hover:underline max-md:py-1"
                >
                  {authorDisplay}
                </Link>
              ) : (
                <span className="font-medium text-foreground text-sm">{authorDisplay}</span>
              )}
              <BadgeList badges={memo.author?.badges} />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground mt-0.5">
              {authorUsername && <span className="truncate">@{authorUsername}</span>}
              <span>{fmt(memo.created_at)}</span>
              <span className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-full bg-muted">
                {visIcon(memo.visibility)}
                {t(`memo.visibility.${memo.visibility}`)}
              </span>
              {memo.archived && (
                <span className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-full bg-yellow-500/15 text-yellow-700 text-[10px]">
                  <Archive className="h-3 w-3" />
                  {t("memo.card.archived")}
                </span>
              )}
              {memo.updated_at !== memo.created_at && (
                <span className="inline-flex items-center px-1.5 h-5 rounded-full bg-blue-500/10 text-blue-600 text-[10px]">
                  {t("memo.card.edited")}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* 正文 */}
        <div className="text-sm leading-relaxed">
          <MarkdownRenderer content={memo.content_md} />
        </div>

        {/* 附件列表 */}
        {memo.attachments.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {memo.attachments.map((a) =>
              a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={a.id}
                  src={a.url}
                  alt={a.original_name ?? ""}
                  className="rounded border border-border object-cover w-full max-h-48"
                />
              ) : (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline"
                >
                  📎 {a.original_name ?? a.url}
                </a>
              ),
            )}
          </div>
        )}

        {/* 标签 */}
        {memo.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {memo.tags.map((tg) => (
              <Link
                key={tg.id}
                href={localePath(`/memo?tag=${encodeURIComponent(tg.slug)}`)}
                className="inline-flex items-center px-1.5 h-5 rounded-full bg-primary/10 text-primary text-[10px] hover:bg-primary/20 max-md:h-11 max-md:px-3 max-md:text-xs"
              >
                #{tg.name}
              </Link>
            ))}
          </div>
        )}

        {/* 互动（移动端触摸目标 ≥44px） */}
        <footer className="flex items-center gap-1 text-xs text-muted-foreground border-t border-border pt-3">
          <button
            type="button"
            disabled={memo.visibility === "private" && !isAuthor}
            onClick={() =>
              logged
                ? toggleLike(memo.id).then((r) => onChange?.({ ...memo, ...r }))
                : router.push(localePath("/login"))
            }
            className={cn(
              "inline-flex items-center gap-1 px-2 h-8 rounded hover:bg-muted max-md:h-11 max-md:px-3",
              memo.liked_by_me && "text-pink-500",
            )}
          >
            <Heart className={cn("h-4 w-4", memo.liked_by_me && "fill-current")} />
            {memo.like_count}
          </button>
          <button
            type="button"
            disabled={memo.visibility === "private" && !isAuthor}
            onClick={() =>
              logged
                ? toggleFavorite(memo.id).then((r) => onChange?.({ ...memo, ...r }))
                : router.push(localePath("/login"))
            }
            className={cn(
              "inline-flex items-center gap-1 px-2 h-8 rounded hover:bg-muted max-md:h-11 max-md:px-3",
              memo.favorited_by_me && "text-yellow-500",
            )}
          >
            <Bookmark className={cn("h-4 w-4", memo.favorited_by_me && "fill-current")} />
            {memo.favorite_count}
          </button>
          <span className="inline-flex items-center gap-1 px-2 h-8 text-muted-foreground max-md:h-11 max-md:px-3">
            <MessageCircle className="h-4 w-4" />
            {memo.comment_count}
          </span>

          <div className="ml-auto flex items-center gap-1">
            <ShareDialog memo={memo} onChange={(m) => onChange?.(m)} />
            {isAuthor && (
              <button
                type="button"
                onClick={() =>
                  memo.archived
                    ? unarchiveMemo(memo.id).then((m) => onChange?.(m))
                    : archiveMemo(memo.id).then((m) => onChange?.(m))
                }
                className="inline-flex items-center gap-1 px-2 h-8 rounded hover:bg-muted text-xs max-md:h-11 max-md:px-3"
              >
                {memo.archived ? t("memo.actions.unarchive") : t("memo.actions.archive")}
              </button>
            )}
            {isAuthor && (
              <button
                type="button"
                onClick={() => setShowVersions((s) => !s)}
                className={cn(
                  "inline-flex items-center gap-1 px-2 h-8 rounded hover:bg-muted text-xs max-md:h-11 max-md:px-3",
                  showVersions && "bg-muted",
                )}
              >
                <History className="h-3.5 w-3.5" />
                {t("memo.versions.title")}
              </button>
            )}
            {isAuthor && (
              <Link
                href={localePath(`/memo/${memo.id}/edit`)}
                className="inline-flex items-center px-2 h-8 rounded hover:bg-muted text-xs max-md:h-11 max-md:px-3"
              >
                {t("memo.actions.edit")}
              </Link>
            )}
            {isAuthor && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t("memo.actions.deleteConfirm"))) {
                    deleteMemo(memo.id).then(() => onDelete?.());
                  }
                }}
                className="inline-flex items-center px-2 h-8 rounded hover:bg-destructive/10 text-destructive text-xs max-md:h-11 max-md:px-3"
              >
                {t("memo.actions.delete")}
              </button>
            )}
          </div>
        </footer>
      </div>

      {isAuthor && showVersions && (
        <VersionPanel
          memoId={memo.id}
          onRollback={(m) => {
            onChange?.(m);
            onRollback?.(m);
          }}
        />
      )}

      {/* 评论占位（待 Phase 9 实装） */}
      <div id="comments" className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        <MessageCircle className="h-5 w-5 mx-auto mb-2 opacity-40" />
        评论功能即将上线（预留入口）
      </div>
    </article>
  );
}
