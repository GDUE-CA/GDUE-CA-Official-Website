"use client";
/**
 * ShareDialog - 公开分享链接对话框
 *
 * 仅 public 可见性的 Memo 可生成；已生成后展示链接并允许复制 / 重新生成 / 撤销。
 */
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Copy, Check, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createShareLink, revokeShareLink } from "@/lib/api/memos";
import type { MemoOut } from "@/types/api";

interface ShareDialogProps {
  memo: MemoOut;
  onChange?: (memo: MemoOut) => void;
}

export function ShareDialog({ memo, onChange }: ShareDialogProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(
    memo.share_slug ? null : null, // 留 null 触发初次自动生成
  );
  const [copied, setCopied] = useState(false);

  async function ensure() {
    if (shareUrl || memo.share_slug) {
      if (memo.share_slug) {
        // 通过 memo.share_slug 重建完整 URL
        setShareUrl(
          typeof window !== "undefined"
            ? `${window.location.origin}/api/memos/shared/${memo.share_slug}`
            : `/api/memos/shared/${memo.share_slug}`,
        );
      }
      return;
    }
    setBusy(true);
    try {
      const out = await createShareLink(memo.id);
      setShareUrl(out.share_url);
      onChange?.({ ...memo, share_slug: out.share_slug });
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const out = await createShareLink(memo.id); // 后端在已存在时轮换
      setShareUrl(out.share_url);
      onChange?.({ ...memo, share_slug: out.share_slug });
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!window.confirm("撤销后匿名用户将无法再访问，确定吗？")) return;
    setBusy(true);
    try {
      await revokeShareLink(memo.id);
      setShareUrl(null);
      onChange?.({ ...memo, share_slug: null });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const disabled = memo.visibility !== "public";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) ensure();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={disabled ? t("memo.share.publicOnly") : t("memo.actions.shareLink")}
          className="inline-flex items-center gap-1 px-2 h-7 rounded hover:bg-muted text-muted-foreground text-xs disabled:opacity-50"
        >
          {t("memo.card.share")}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("memo.share.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {disabled ? (
            <p className="text-sm text-muted-foreground">
              {t("memo.share.publicOnly")}
            </p>
          ) : shareUrl ? (
            <>
              <p className="text-xs text-muted-foreground">
                {t("memo.share.copyHint")}
              </p>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 px-2 h-8 rounded border border-border bg-muted text-xs"
                />
                <Button type="button" size="sm" onClick={copy} className="h-8">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button type="button" size="sm" variant="outline" onClick={regenerate} disabled={busy}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  {t("memo.share.regenerate")}
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={revoke} disabled={busy}>
                  <X className="h-3.5 w-3.5 mr-1" />
                  {t("memo.share.revoke")}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              {busy ? t("memo.editor.uploading") : "..."}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
