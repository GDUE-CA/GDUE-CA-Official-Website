"use client";

/**
 * 博客文章评论区（公开）
 *
 * - 发表框置顶：已登录显示本人头像并以账号身份发表（后端以账号显示名为准，防冒名）；
 *   匿名访客填写昵称。⌘/Ctrl + Enter 发送，带字数计数
 * - 列表：头像（登录用户真实头像 + 主页链接；匿名按昵称生成首字母头像）、
 *   昵称、时间、IP 属地、设备类型；时间正序，「加载更多」分页
 * - 属地：按语言渲染 location_zh / location_en；"local"/"intranet" 特殊枚举走 i18n
 * - 隐私：只展示属地（国家/省份）与设备类别，完整 IP / 原始 UA 后端从不下发
 * - 正文纯文本（React 转义渲染）；后端双开关关闭时 allowed=false 隐藏发表框
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import MessageSquare from "@/assets/icons/status/message-square.svg";
import MapPin from "@/assets/icons/status/map-pin.svg";
import Smartphone from "@/assets/icons/status/smartphone.svg";
import Laptop from "@/assets/icons/status/laptop.svg";
import Monitor from "@/assets/icons/status/monitor.svg";
import MonitorSmartphone from "@/assets/icons/status/monitor-smartphone.svg";
import Send from "@/assets/icons/action/send.svg";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import { API_BASE_URL } from "@/lib/api/client";
import { fetchMe } from "@/lib/api/auth";
import { createPublicComment, listPublicComments } from "@/lib/api/comments";
import { getSession } from "@/lib/auth";
import { useLocalizedPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { CommentDevice, CommentPublic } from "@/types/api";

const PAGE_SIZE = 10;
const MAX_LENGTH = 1000;

const DEVICE_ICON: Record<CommentDevice, typeof Smartphone> = {
  iphone: Smartphone,
  android: Smartphone,
  ipad: MonitorSmartphone,
  macos: Laptop,
  windows: Monitor,
  linux: Monitor,
  other: MonitorSmartphone,
};

/** 匿名头像配色：按昵称稳定取色（同一昵称颜色恒定） */
const AVATAR_TONES = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];

function toneFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/** 拼接后端资源绝对 URL（头像） */
function assetUrl(p: string): string {
  if (p.startsWith("http")) return p;
  const base = API_BASE_URL.replace(/\/+$/, "");
  return p.startsWith("/") ? `${base}${p}` : `${base}/${p}`;
}

function Avatar({ name, url, className }: { name: string; url: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={assetUrl(url)}
        alt=""
        onError={() => setBroken(true)}
        className={cn("rounded-full object-cover bg-muted shrink-0", className)}
      />
    );
  }
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden
      className={cn(
        "rounded-full shrink-0 inline-flex items-center justify-center font-medium select-none",
        toneFor(name),
        className,
      )}
    >
      {initial}
    </span>
  );
}

interface Viewer {
  name: string;
  avatarUrl: string | null;
}

export function CommentsSection({ postId }: { postId: number }) {
  const { t, locale } = useI18n();
  const lp = useLocalizedPath();

  const [items, setItems] = useState<CommentPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [allowed, setAllowed] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 已登录访客：以账号身份发表（无需填昵称）
  const [viewer, setViewer] = useState<Viewer | null>(null);

  // 发表表单
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canSubmit = !!content.trim() && (!!viewer || !!name.trim()) && !submitting;

  /** 用第一页结果重置列表（首次加载 / 发表后刷新共用） */
  const applyFirstPage = useCallback((res: Awaited<ReturnType<typeof listPublicComments>>) => {
    setItems(res.items);
    setTotal(res.total);
    setAllowed(res.allowed);
    setPage(1);
  }, []);

  // 首次加载：state 只在异步回调里写（避免 effect 内同步 setState 引发级联渲染）
  useEffect(() => {
    let alive = true;
    listPublicComments(postId, 1, PAGE_SIZE)
      .then((res) => {
        if (alive) applyFirstPage(res);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : t("common.error"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [postId, t, applyFirstPage]);

  useEffect(() => {
    if (!getSession()) return;
    let alive = true;
    fetchMe()
      .then((me) => {
        if (alive) setViewer({ name: me.display_name || me.username, avatarUrl: me.avatar_url ?? null });
      })
      .catch(() => {
        /* 会话失效：按匿名访客处理 */
      });
    return () => {
      alive = false;
    };
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await listPublicComments(postId, next, PAGE_SIZE);
      setItems((prev) => [...prev, ...res.items]);
      setTotal(res.total);
      setPage(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setNotice(null);
    setError(null);
    try {
      await createPublicComment(postId, {
        // 已登录时后端以账号显示名为准，这里仅为满足请求体校验
        author_name: viewer ? viewer.name.slice(0, 64) : name.trim(),
        content: content.trim(),
      });
      setContent("");
      setNotice(t("comments.submitOk"));
      // 回到第一页刷新（时间正序，新评论在末尾）
      applyFirstPage(await listPublicComments(postId, 1, PAGE_SIZE));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
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
            <span className="text-sm font-normal text-muted-foreground">({total})</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 发表框：置顶；双开关关闭时隐藏（后端同时校验 403 兜底） */}
        {allowed ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex gap-3"
          >
            <Avatar
              name={viewer?.name ?? (name.trim() || t("comments.anonymous"))}
              url={viewer?.avatarUrl ?? null}
              className="h-9 w-9 text-sm mt-0.5"
            />
            <div className="flex-1 min-w-0 space-y-2">
              {viewer ? (
                <p className="text-xs text-muted-foreground">
                  {t("comments.postAs", { name: viewer.name })}
                </p>
              ) : (
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("comments.namePlaceholder")}
                  maxLength={64}
                  required
                  className="h-9"
                />
              )}
              <div className="rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring transition-shadow">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder={t("comments.contentPlaceholder")}
                  maxLength={MAX_LENGTH}
                  rows={3}
                  required
                  aria-label={t("comments.contentPlaceholder")}
                  className="block w-full resize-y min-h-[84px] rounded-t-lg bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none"
                />
                <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-1.5">
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                    {t("comments.shortcut")}
                  </span>
                  <div className="flex items-center gap-3 ml-auto">
                    <span
                      className={cn(
                        "text-[11px] tabular-nums",
                        content.length > MAX_LENGTH * 0.9 ? "text-amber-600" : "text-muted-foreground",
                      )}
                    >
                      {t("comments.charCount", { n: content.length })}
                    </span>
                    <Button type="submit" size="sm" disabled={!canSubmit} className="h-8">
                      {submitting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      {t("comments.submitBtn")}
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("comments.formHint")}</p>
            </div>
          </form>
        ) : (
          !loading && (
            <p className="text-xs text-muted-foreground text-center">{t("comments.closed")}</p>
          )
        )}

        {notice && (
          <p className="text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-md">{notice}</p>
        )}
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
        )}

        {/* 评论列表 */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t("comments.empty")}</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {items.map((c) => {
              const loc = locationLabel(c);
              const DeviceIcon = c.device ? DEVICE_ICON[c.device] ?? MonitorSmartphone : null;
              const avatar = (
                <Avatar name={c.author_name} url={c.author_avatar_url} className="h-9 w-9 text-sm" />
              );
              return (
                <li key={c.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                  {c.author_username ? (
                    <Link href={lp(`/u/${c.author_username}`)} className="shrink-0 h-fit" tabIndex={-1}>
                      {avatar}
                    </Link>
                  ) : (
                    avatar
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      {c.author_username ? (
                        <Link
                          href={lp(`/u/${c.author_username}`)}
                          className="text-sm font-medium hover:underline underline-offset-2"
                        >
                          {c.author_name}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium">{c.author_name}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        <FormattedUserActionTime utcIso={c.created_at} />
                      </span>
                    </div>
                    {/* 纯文本渲染（React 自动转义，杜绝 XSS） */}
                    <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/90">
                      {c.content}
                    </p>
                    {(loc || DeviceIcon) && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {loc && (
                          <span className="inline-flex items-center gap-1" title={t("comments.ipLocation")}>
                            <MapPin className="h-3 w-3" />
                            {t("comments.ipLocation")} · {loc}
                          </span>
                        )}
                        {DeviceIcon && c.device && (
                          <span className="inline-flex items-center gap-1">
                            <DeviceIcon className="h-3 w-3" />
                            {t(`comments.device.${c.device}`)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* 加载更多 */}
        {page < totalPages && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t("comments.loadMore")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
