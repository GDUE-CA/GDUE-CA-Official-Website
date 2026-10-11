"use client";
/**
 * /[locale]/memo/new - 完整新建页（区别于主页的快速编辑器）
 *
 * 提交后通过 MemoEditor.onSubmit 跳转详情页；
 * memoId 在创建时还未存在，故 MemoEditor 的"粘贴图片"功能不可用，
 * 引导用户先去主页 quick editor 创建再返回继续完善。
 */
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { createMemo } from "@/lib/api/memos";
import { Button } from "@/components/ui/button";

export default function MemoNewPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  return (
    <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
      <Link
        href={`/${locale}/memo`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("memo.pageTitle")}
      </Link>
      <h1 className="text-2xl font-display font-bold mb-4">
        {t("memo.editor.saveCreate")}
      </h1>
      <div className="rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 p-3 text-xs flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          完整编辑模式适合长内容：先在这里写完并发布，再去详情页添加图片附件与版本控制。
          <br />
          <Link
            href={`/${locale}/memo`}
            className="underline underline-offset-2"
          >
            ← 回到时间线
          </Link>
        </div>
      </div>
      <NewMemoForm
        onCreated={(id) => router.push(`/${locale}/memo/${id}`)}
      />
    </div>
  );
}

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { VisibilitySelect } from "@/components/memo/VisibilitySelect";
import { TagInput } from "@/components/memo/TagInput";
import { listTags } from "@/lib/api/tags";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import type { MemoVisibility } from "@/types/api";

function NewMemoForm({ onCreated }: { onCreated: (id: number) => void }) {
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<MemoVisibility>("public");
  const [tags, setTags] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTags({ limit: 50 })
      .then((rows) => setSuggestions(rows.map((r) => r.name)))
      .catch(() => {});
  }, []);

  async function submit() {
    if (!content.trim()) {
      setError(t("memo.errors.contentRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await createMemo({
        content_md: content,
        visibility,
        tag_names: tags,
      });
      onCreated(out.id);
    } catch (err) {
      setError((err as Error).message ?? t("memo.errors.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-3 rounded-lg border border-border bg-card p-4">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t("memo.editor.placeholder")}
        rows={12}
        className="resize-y min-h-[200px] text-sm"
        disabled={busy}
      />
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{t("memo.editor.visibilityLabel")}：</span>
        <VisibilitySelect value={visibility} onChange={setVisibility} disabled={busy} />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">{t("memo.editor.tagsLabel")}</span>
        <TagInput value={tags} onChange={setTags} suggestions={suggestions} disabled={busy} />
      </div>
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{error}</p>
      )}
      <div className="flex items-center gap-2 justify-end">
        <Button type="button" size="sm" onClick={submit} disabled={busy || !content.trim()}>
          {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
          {t("memo.editor.saveCreate")}
        </Button>
      </div>
    </div>
  );
}
