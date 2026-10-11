"use client";
/**
 * /[locale]/memo/s/[slug] - 公开分享匿名访问
 *
 * 任何人都能通过 share_slug 看到这条公开 Memo（不需要登录）；
 * 互动按钮（点赞/收藏）需要登录：未登录跳到 /admin/login。
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { Loader2, Share2 } from "lucide-react";
import { MemoDetail } from "@/components/memo/MemoDetail";
import { getSharedMemo } from "@/lib/api/memos";
import type { MemoOut } from "@/types/api";

export default function SharedMemoPage() {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const [memo, setMemo] = useState<MemoOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getSharedMemo(slug)
      .then(setMemo)
      .catch((err) => {
        if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404) {
          setNotFound(true);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (notFound || !memo) {
    return (
      <div className="container max-w-3xl py-16 text-center text-muted-foreground">
        <Share2 className="h-8 w-8 mx-auto mb-3 opacity-40" />
        {t("error.memo.notFound")}
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="text-xs text-muted-foreground mb-3">
        <Share2 className="inline h-3 w-3 mr-1" />
        公开分享 Memo · 匿名访问
      </div>
      <MemoDetail memo={memo} onChange={setMemo} />
    </div>
  );
}
