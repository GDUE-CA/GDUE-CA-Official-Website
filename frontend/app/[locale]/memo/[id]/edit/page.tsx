"use client";
/**
 * /[locale]/memo/[id]/edit - 编辑 Memo
 * 加载 → MemoEditor mode="edit"
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { MemoEditor } from "@/components/memo/MemoEditor";
import { getMemo } from "@/lib/api/memos";
import type { MemoOut } from "@/types/api";

export default function MemoEditPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [memo, setMemo] = useState<MemoOut | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getMemo(Number(id))
      .then(setMemo)
      .catch(() => setMemo(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!memo) {
    return (
      <div className="container max-w-3xl py-16 text-center text-muted-foreground">
        {t("error.memo.notFound")}
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
      <Link
        href={`/${locale}/memo/${id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("memo.pageTitle")}
      </Link>
      <h1 className="text-2xl font-display font-bold mb-4">
        {t("memo.actions.edit")}
      </h1>
      <MemoEditor
        mode="edit"
        initial={memo}
        memoId={memo.id}
        onSubmit={(m) => router.push(`/${locale}/memo/${m.id}`)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
