"use client";

/**
 * ReceiptPanel - 表单提交成功后的回执面板
 * - 显示唯一回执码 + 可截图保存的二维码
 * - 强调回执码 / 二维码是查询凭证，务必保存
 * - 说明两种查询方式：报名页查询入口 / 扫码直达
 * - 二维码指向 /{locale}/query?code={receiptCode}，扫码自动显示审核结果
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Ticket, AlertTriangle } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";

export function ReceiptPanel({ receiptCode }: { receiptCode: string }) {
  const { t, locale } = useI18n();
  const [queryUrl, setQueryUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // 客户端挂载后生成二维码内容（避免 SSR 不一致）
  useEffect(() => {
    setQueryUrl(`${window.location.origin}/${locale}/query?code=${receiptCode}`);
  }, [locale, receiptCode]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(receiptCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用时忽略
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm rounded-lg border-2 border-dashed border-primary/40 bg-muted/30 p-5 space-y-4">
      <div className="flex items-center justify-center gap-2 text-primary">
        <Ticket className="h-5 w-5" />
        <span className="text-sm font-medium">{t("receipt.codeLabel")}</span>
      </div>

      {/* 回执码 */}
      <div className="flex items-center justify-center gap-2">
        <code className="rounded bg-primary/10 px-3 py-1.5 font-mono text-lg font-bold tracking-wider text-primary select-all">
          {receiptCode}
        </code>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy} aria-label={t("receipt.copy")}>
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>

      {/* 二维码 */}
      {queryUrl && (
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-lg bg-white p-2 shadow-sm">
            <QRCodeSVG value={queryUrl} size={144} level="M" />
          </div>
          <p className="text-xs text-muted-foreground">{t("receipt.qrHint")}</p>
        </div>
      )}

      {/* 保存警告（醒目强调） */}
      <div className="flex items-start gap-2 rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
        <p className="text-xs font-semibold leading-relaxed text-amber-700 dark:text-amber-500">
          {t("receipt.saveHint")}
        </p>
      </div>

      {/* 如何查询结果 */}
      <div className="rounded-md border border-border bg-background/60 px-3 py-2.5 space-y-1.5">
        <p className="text-xs font-semibold">{t("receipt.howToQueryTitle")}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          1. {t("receipt.howToQuery1")}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          2. {t("receipt.howToQuery2")}
        </p>
      </div>

      <Button asChild variant="outline" size="sm" className="w-full">
        <Link href={`/${locale}/query?code=${receiptCode}`}>
          {t("receipt.queryLink")}
        </Link>
      </Button>
    </div>
  );
}
