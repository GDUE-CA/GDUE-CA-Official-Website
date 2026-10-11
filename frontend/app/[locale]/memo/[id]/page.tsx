"use client";
/**
 * /[locale]/memo/[id] - Memo 详情页
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { MemoDetail } from "@/components/memo/MemoDetail";
import { getMemo } from "@/lib/api/memos";
import type { MemoOut } from "@/types/api";

export default function MemoDetailPage() {
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
        <div className="mt-4">
          <Link href={`/${locale}/memo`} className="text-primary underline">
            ← {t("memo.pageTitle")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
      <Link
        href={`/${locale}/memo`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("memo.pageTitle")}
      </Link>
      <MemoDetail
        memo={memo}
        onChange={setMemo}
        onDelete={() => router.push(`/${locale}/memo`)}
      />
    </div>
  );
}
