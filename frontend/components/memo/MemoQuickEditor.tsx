"use client";
/**
 * MemoQuickEditor - 时间线主页顶部快速编辑器
 *
 * 简化版：单行 textarea + 可见性 + 标签 + 发布按钮
 * 强调「先发出去，再细化」：点击「完整编辑」可切到 /memo/new
 */
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createMemo } from "@/lib/api/memos";
import { VisibilitySelect } from "./VisibilitySelect";
import { TagInput } from "./TagInput";
import type { MemoOut, MemoVisibility } from "@/types/api";
import { useEffect } from "react";
import { listTags } from "@/lib/api/tags";

interface MemoQuickEditorProps {
  onCreated: (memoId: number) => void;
  onOpenFullEditor?: () => void;
}

export function MemoQuickEditor({ onCreated, onOpenFullEditor }: MemoQuickEditorProps) {
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<MemoVisibility>("public");
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    listTags({ limit: 50 })
      .then((rows) => setSuggestions(rows.map((r) => r.name)))
      .catch(() => {});
  }, []);

  async function handleSubmit() {
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
      setContent("");
      setTags([]);
      setExpanded(false);
      onCreated(out.id);
    } catch (err) {
      setError((err as Error).message ?? t("memo.errors.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onFocus={() => setExpanded(true)}
        placeholder={t("memo.editor.placeholder")}
        rows={expanded ? 5 : 2}
        className="resize-y min-h-[60px] text-sm border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-ring/40 px-0"
        disabled={busy}
      />
      {expanded && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {t("memo.editor.visibilityLabel")}：
            </span>
            <VisibilitySelect value={visibility} onChange={setVisibility} disabled={busy} />
          </div>
          <TagInput value={tags} onChange={setTags} suggestions={suggestions} disabled={busy} />
        </>
      )}
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 justify-end">
        {onOpenFullEditor && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenFullEditor}
            disabled={busy}
          >
            <PenLine className="h-3.5 w-3.5 mr-1" />
            完整编辑
          </Button>
        )}
        <Button type="button" size="sm" onClick={handleSubmit} disabled={busy || !content.trim()}>
          {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
          {t("memo.editor.saveCreate")}
        </Button>
      </div>
    </div>
  );
}
