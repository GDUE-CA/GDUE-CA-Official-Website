"use client";
/**
 * MemoEditor - 完整编辑器
 *
 * - Markdown 文本域：粘贴图片直接上传（走后端 /api/memos/{id}/upload）
 * - 可见性切换、标签输入
 * - 提交时通过 onSubmit 回调；父组件决定创建 / 编辑 API 调用
 *
 * 用法：
 *   <MemoEditor mode="create" onSubmit={async (payload) => {...}} />
 *   <MemoEditor mode="edit" initial={memo} memoId={id} onSubmit={async (payload) => {...}} />
 */
import { useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, ImagePlus, X } from "lucide-react";
import { VisibilitySelect } from "./VisibilitySelect";
import { TagInput } from "./TagInput";
import {
  createMemo,
  updateMemo,
  uploadMemoAttachment,
} from "@/lib/api/memos";
import { listTags } from "@/lib/api/tags";
import type {
  MemoCreate,
  MemoOut,
  MemoUpdate,
  MemoVisibility,
} from "@/types/api";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface MemoEditorProps {
  mode: "create" | "edit";
  /** edit 模式必填：被编辑的 memo */
  initial?: MemoOut;
  /** 必填：创建时为 null；编辑时为 memo.id；文件附件上传依赖此 id */
  memoId?: number;
  onSubmit?: (memo: MemoOut) => void;
  onCancel?: () => void;
  className?: string;
}

export function MemoEditor({
  mode,
  initial,
  memoId,
  onSubmit,
  onCancel,
  className,
}: MemoEditorProps) {
  const { t } = useI18n();
  const [content, setContent] = useState(initial?.content_md ?? "");
  const [visibility, setVisibility] = useState<MemoVisibility>(
    initial?.visibility ?? "public",
  );
  const [tags, setTags] = useState<string[]>(
    initial?.tags.map((x) => x.name) ?? [],
  );
  const [editNote, setEditNote] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listTags({ limit: 50 })
      .then((rows) => setTagSuggestions(rows.map((r) => r.name)))
      .catch(() => {});
  }, []);

  /** 粘贴图片：先上传，再把 Markdown 图片插入到当前光标位置 */
  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (mode === "create" || !memoId) {
      // 创建阶段暂不支持粘贴上传（需要后端先有 memoId）；提示用户先创建
      return;
    }
    const items = e.clipboardData?.items;
    if (!items) return;
    const images: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const file = it.getAsFile();
        if (file) images.push(file);
      }
    }
    if (images.length === 0) return;
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      for (const img of images) {
        const att = await uploadMemoAttachment(memoId, img);
        setPendingImages((prev) => [...prev, att.url]);
        const md = `\n![pasted](${att.url})\n`;
        const ta = textareaRef.current;
        if (ta) {
          const pos = ta.selectionStart ?? content.length;
          const before = content.slice(0, pos);
          const after = content.slice(pos);
          setContent(before + md + after);
        } else {
          setContent((c) => c + md);
        }
      }
    } catch (err) {
      setError((err as Error).message ?? t("memo.errors.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  function pickFile() {
    if (mode === "create" || !memoId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files || !memoId) return;
      setBusy(true);
      setError(null);
      try {
        for (const f of Array.from(input.files)) {
          const att = await uploadMemoAttachment(memoId, f);
          setPendingImages((prev) => [...prev, att.url]);
          setContent((c) => c + `\n![${f.name}](${att.url})\n`);
        }
      } catch (err) {
        setError((err as Error).message ?? t("memo.errors.createFailed"));
      } finally {
        setBusy(false);
      }
    };
    input.click();
  }

  async function handleSubmit() {
    if (!content.trim()) {
      setError(t("memo.errors.contentRequired"));
      return;
    }
    if (content.length > 20000) {
      setError(t("memo.errors.contentTooLong"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        const payload: MemoCreate = {
          content_md: content,
          visibility,
          tag_names: tags,
        };
        await createMemo(payload);
        // 创建完重置
        setContent("");
        setTags([]);
        setEditNote("");
        setVisibility("public");
        setPendingImages([]);
        if (onSubmit) onSubmit(initial as unknown as MemoOut);
      } else {
        if (!memoId) return;
        const payload: MemoUpdate = {
          content_md: content,
          visibility,
          tag_names: tags,
          attachment_urls: pendingImages,
          edit_note: editNote || undefined,
        };
        const updated = await updateMemo(memoId, payload);
        if (onSubmit) onSubmit(updated);
      }
    } catch (err) {
      setError((err as Error).message ?? t("memo.errors.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-3 rounded-lg border border-border bg-card p-4", className)}>
      <Textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onPaste={handlePaste}
        placeholder={t("memo.editor.placeholder")}
        rows={mode === "create" ? 5 : 12}
        className="resize-y min-h-[120px] text-sm"
        disabled={busy}
      />

      {pendingImages.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {pendingImages.map((u) => (
            <span
              key={u}
              className="inline-flex items-center gap-1 px-2 h-6 rounded-md bg-muted text-muted-foreground"
            >
              <ImagePlus className="h-3 w-3" />
              <span className="max-w-[180px] truncate">{u.split("/").pop()}</span>
              <button
                type="button"
                onClick={() => setPendingImages((p) => p.filter((x) => x !== u))}
                aria-label="remove"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {t("memo.editor.visibilityLabel")}：
        </span>
        <VisibilitySelect value={visibility} onChange={setVisibility} disabled={busy} />
        {mode === "edit" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={pickFile}
            disabled={busy || !memoId}
            className="h-7 text-xs"
          >
            <ImagePlus className="h-3.5 w-3.5 mr-1" />
            {t("memo.editor.pasteHint")}
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">
          {t("memo.editor.tagsLabel")}
        </span>
        <TagInput
          value={tags}
          onChange={setTags}
          suggestions={tagSuggestions}
          disabled={busy}
        />
      </div>

      {mode === "edit" && (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">
            {t("memo.editor.editNote")}
          </span>
          <input
            type="text"
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            className="w-full h-8 px-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {t("memo.editor.cancel")}
          </Button>
        )}
        <Button type="button" size="sm" onClick={handleSubmit} disabled={busy || !content.trim()}>
          {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
          {mode === "create" ? t("memo.editor.saveCreate") : t("memo.editor.saveUpdate")}
        </Button>
      </div>
    </div>
  );
}
