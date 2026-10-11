"use client";
/**
 * VersionPanel - Memo 版本历史面板
 *
 * 展示版本列表（version_no / editor / edit_note / created_at），
 * 点击版本号展开查看该版本 Markdown 全文，并提供"回滚"按钮。
 */
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Loader2, History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer } from "@/components/blog/MarkdownRenderer";
import {
  listMemoVersions, getMemoVersion, rollbackMemo,
} from "@/lib/api/memos";
import type { MemoVersionBriefOut, MemoOut } from "@/types/api";
import { useEffect } from "react";

interface VersionPanelProps {
  memoId: number;
  onRollback?: (memo: MemoOut) => void;
}

export function VersionPanel({ memoId, onRollback }: VersionPanelProps) {
  const { t } = useI18n();
  const [versions, setVersions] = useState<MemoVersionBriefOut[]>([]);
  const [active, setActive] = useState<MemoVersionBriefOut | null>(null);
  const [activeMd, setActiveMd] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMemoVersions(memoId)
      .then((rows) => setVersions(rows))
      .catch(() => setVersions([]));
  }, [memoId]);

  async function open(v: MemoVersionBriefOut) {
    setActive(v);
    setActiveMd(null);
    try {
      const full = await getMemoVersion(memoId, v.version_no);
      setActiveMd(full.content_md);
    } catch {
      setActiveMd("(加载失败)");
    }
  }

  async function doRollback() {
    if (!active || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await rollbackMemo(memoId, {
        target_version_no: active.version_no,
        edit_note: reason.trim(),
      });
      onRollback?.(updated);
      setActive(null);
      setActiveMd(null);
      setReason("");
      const rows = await listMemoVersions(memoId);
      setVersions(rows);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (versions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        {t("memo.versions.empty")}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <History className="h-4 w-4" />
        {t("memo.versions.title")}（{versions.length}）
      </div>

      <ul className="divide-y divide-border">
        {versions.map((v) => (
          <li
            key={v.id}
            className={`flex items-center gap-2 py-2 text-xs ${active?.id === v.id ? "bg-muted/40 -mx-2 px-2 rounded" : ""}`}
          >
            <button
              type="button"
              onClick={() => open(v)}
              className="flex-1 text-left hover:text-primary"
            >
              <span className="font-mono mr-2">
                {t("memo.versions.versionN", { n: v.version_no })}
              </span>
              {v.edit_note && <span className="text-muted-foreground">· {v.edit_note}</span>}
              <span className="text-muted-foreground ml-2">
                {v.editor?.username ?? "system"}
              </span>
              <span className="text-muted-foreground ml-2">
                {new Date(v.created_at).toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </button>
            {active?.id === v.id && (
              <span className="text-[10px] text-primary">查看中</span>
            )}
          </li>
        ))}
      </ul>

      {active && activeMd !== null && (
        <div className="space-y-2 pt-3 border-t border-border">
          <div className="text-sm">
            <MarkdownRenderer content={activeMd} />
          </div>
          <div className="space-y-2 pt-2 border-t border-dashed">
            <span className="text-xs text-muted-foreground">
              {t("memo.versions.restoreReason")}
            </span>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="text-sm"
            />
            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                {error}
              </p>
            )}
            <div className="flex items-center gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActive(null);
                  setActiveMd(null);
                  setReason("");
                }}
                disabled={busy}
              >
                {t("memo.editor.cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={doRollback}
                disabled={busy || !reason.trim()}
              >
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                {t("memo.versions.restore")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
