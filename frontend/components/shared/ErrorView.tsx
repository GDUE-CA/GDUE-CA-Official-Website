"use client";

/**
 * 错误页主体（app/error.tsx 与 app/global-error.tsx 共用）
 *
 * 展示：错误原因（已本地化）+ 请求编号（request id，与后端 X-Request-Id / X-Trace-Id 同值）
 * 或 Next.js 错误摘要（非 API 错误），并提供复制、重试、返回首页。
 *
 * 原因来源：
 * - 浏览器端抛出的 ApiError：实例本身（不含错误编号后缀的原因 + requestId）
 * - 服务端组件抛出的 ApiError：message 已被 Next.js 抹掉，解码 digest 得到业务码与 request id
 * - 其他错误：通用文案 + Next.js digest（服务端日志可按 digest 检索）
 *
 * 不依赖 I18nProvider：错误边界可能正好替换掉 Provider 所在层级，
 * 因此按 URL 首段 / <html lang> 自行加载语言字典，加载前用内置中文兜底。
 */
import { useEffect, useState } from "react";
import AlertTriangle from "@/assets/icons/status/alert-triangle.svg";
import Copy from "@/assets/icons/action/copy.svg";
import Check from "@/assets/icons/action/check.svg";
import RotateCcw from "@/assets/icons/action/rotate-ccw.svg";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import {
  decodeApiErrorDigest,
  formatEnvelopeError,
  hasErrorMessages,
  messageForCode,
  setErrorMessages,
  tr,
} from "@/lib/api/errorMessages";
import {
  defaultLocale,
  dictionaryLoaders,
  isLocale,
  localeFallbackChain,
  type Locale,
} from "@/lib/i18n";
import { expandFlatKeys, mergeLocaleChain, stripEmptyLeaves, type Dict } from "@/i18n/merge";

type NextError = Error & { digest?: string };

interface ErrorDetails {
  reason: string;
  requestId: string | null;
  digest: string | null;
}

function describe(error: NextError): ErrorDetails {
  if (error instanceof ApiError) {
    return {
      reason: formatEnvelopeError(
        error.code,
        error.i18nKey ? { key: error.i18nKey, params: error.i18nParams ?? undefined } : error.message,
        error.fieldErrors,
      ),
      requestId: error.requestId,
      digest: null,
    };
  }
  const api = decodeApiErrorDigest(error.digest);
  if (api) {
    return { reason: messageForCode(api.code, api.status), requestId: api.requestId, digest: null };
  }
  return {
    reason: text("error.page.unexpected"),
    requestId: null,
    digest: error.digest ?? null,
  };
}

function text(key: string): string {
  return tr(key) ?? key;
}

function currentLocale(): Locale {
  const first = window.location.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  if (isLocale(first)) return first;
  const lang = document.documentElement.lang.toLowerCase();
  return isLocale(lang) ? lang : defaultLocale;
}

async function loadMessages(loc: Locale): Promise<Dict> {
  const dicts = await Promise.all(
    localeFallbackChain(loc).map(async (l) =>
      stripEmptyLeaves(expandFlatKeys((await dictionaryLoaders[l]()) as unknown as Dict)),
    ),
  );
  return mergeLocaleChain(dicts);
}

export function ErrorView({ error, reset }: { error: NextError; reset: () => void }) {
  // 字典异步就绪后递增以触发重渲染（文案在渲染期由 tr 读取模块级字典）
  const [, setDictVersion] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (hasErrorMessages()) return;
    let alive = true;
    loadMessages(currentLocale())
      .then((messages) => {
        if (!alive) return;
        setErrorMessages(messages);
        setDictVersion((v) => v + 1);
      })
      .catch(() => {
        /* 字典加载失败：保持内置中文兜底 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const { reason, requestId, digest } = describe(error);
  const id = requestId ?? digest;
  const idLabel = requestId ? text("error.page.requestId") : text("error.page.digest");

  async function copyId() {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 剪贴板不可用（非安全上下文）：用户可手动选中复制 */
    }
  }

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-background text-foreground">
      <div className="w-full max-w-md rounded-xl bg-card shadow-lg p-6 sm:p-8 text-center space-y-5">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{text("error.page.title")}</h1>
          <p className="text-sm text-muted-foreground break-words" role="alert">
            {reason}
          </p>
        </div>

        {id && (
          <div className="rounded-lg bg-muted/50 px-4 py-3 text-left space-y-1.5">
            <p className="text-xs text-muted-foreground">{text("error.page.hint")}</p>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground">{idLabel}</span>
                <code className="block font-mono text-sm break-all select-all">{id}</code>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyId}
                aria-label={text("error.page.copy")}
                className="shrink-0"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="sr-only sm:not-sr-only">
                  {copied ? text("error.page.copied") : text("error.page.copy")}
                </span>
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2 justify-center">
          <Button variant="outline" asChild>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 错误态需整页刷新到首页，不能沿用出错的客户端路由状态（global-error 下也无可靠的路由上下文） */}
            <a href="/">{text("error.page.home")}</a>
          </Button>
          <Button onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            {text("error.page.retry")}
          </Button>
        </div>
      </div>
    </main>
  );
}
