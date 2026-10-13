"use client";

/**
 * BlogMetricBar —— 博客详情页指标操作条
 *
 * 展示 4 项冗余计数（like / comment / share / favourite），
 * 并提供分享 / 点赞 / 收藏三个交互按钮：
 * - 分享：无鉴权，每次点击 share_count += 1
 * - 点赞 / 收藏：需登录，未登录弹出提示
 *
 * 计数为冗余计数器（仅计数不存身份），故前端乐观更新 + 失败回滚。
 */
import { useState } from "react";
import { Heart, MessageCircle, Share2, Star } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { sharePost, likePost, unlikePost, favouritePost, unfavouritePost } from "@/lib/api/blog";
import { ApiError } from "@/lib/api/client";

interface BlogMetricBarProps {
  slug: string;
  initialLike: number;
  initialComment: number;
  initialShare: number;
  initialFavourite: number;
}

export function BlogMetricBar({
  slug,
  initialLike,
  initialComment,
  initialShare,
  initialFavourite,
}: BlogMetricBarProps) {
  const { t } = useI18n();
  const [like, setLike] = useState(initialLike);
  const [comment] = useState(initialComment);
  const [share, setShare] = useState(initialShare);
  const [favourite, setFavourite] = useState(initialFavourite);

  const [liked, setLiked] = useState(false);
  const [favourited, setFavourited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const prev = share;
    setShare(prev + 1); // 乐观更新
    try {
      const res = await sharePost(slug);
      setShare(res.share_count);
      // 尝试触发原生分享 / 复制链接
      if (navigator.share) {
        await navigator.share({ title: document.title, url: window.location.href });
      } else {
        await navigator.clipboard?.writeText(window.location.href);
      }
    } catch (e) {
      setShare(prev); // 回滚
      if (e instanceof ApiError) {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLike() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLike((c) => c + (wasLiked ? -1 : 1));
    try {
      const res = wasLiked
        ? await unlikePost(slug)
        : await likePost(slug);
      setLike(res.like_count);
    } catch (e) {
      // 回滚
      setLiked(wasLiked);
      setLike((c) => c + (wasLiked ? 1 : -1));
      if (e instanceof ApiError) {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleFavourite() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const wasFav = favourited;
    setFavourited(!wasFav);
    setFavourite((c) => c + (wasFav ? -1 : 1));
    try {
      const res = wasFav
        ? await unfavouritePost(slug)
        : await favouritePost(slug);
      setFavourite(res.favourite_count);
    } catch (e) {
      setFavourited(wasFav);
      setFavourite((c) => c + (wasFav ? 1 : -1));
      if (e instanceof ApiError) {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const chipBase = "inline-flex items-center gap-1.5 text-sm text-muted-foreground";
  const btnBase =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6 mt-8">
      {/* 计数展示 */}
      <div className="flex items-center gap-4 mr-auto">
        <span className={chipBase}>
          <Heart className="h-4 w-4" />
          {like}
        </span>
        <span className={chipBase}>
          <MessageCircle className="h-4 w-4" />
          {comment}
        </span>
        <span className={chipBase}>
          <Share2 className="h-4 w-4" />
          {share}
        </span>
        <span className={chipBase}>
          <Star className="h-4 w-4" />
          {favourite}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleShare}
          disabled={busy}
          className={`${btnBase} bg-secondary text-secondary-foreground hover:bg-secondary/80`}
        >
          <Share2 className="h-4 w-4" />
          {t("blog.shareBtn")}
        </button>
        <button
          onClick={handleLike}
          disabled={busy}
          className={`${btnBase} ${liked ? "bg-red-50 text-red-600 dark:bg-red-950/30" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
          {t("blog.likeBtn")}
        </button>
        <button
          onClick={handleFavourite}
          disabled={busy}
          className={`${btnBase} ${favourited ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
        >
          <Star className={`h-4 w-4 ${favourited ? "fill-current" : ""}`} />
          {t("blog.favouriteBtn")}
        </button>
      </div>

      {error && (
        <p className="w-full text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
