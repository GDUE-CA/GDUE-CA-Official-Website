"use client";

/**
 * ReceiptQuery - 回执码查询组件（可复用）
 * - 输入回执号码，直接查询报名 / Bug 反馈的审核结果
 * - 审核通过且签到已开放时，可直接点击签到（状态自动变为已签到）
 * - /join 页「查询报名结果」入口与 /[locale]/query 查询页共用
 * - autoQuery + initialCode 时挂载即自动查询（扫码直达场景）
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Search, CheckCircle2, XCircle, QrCode } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkinReceipt, queryReceipt } from "@/lib/api/query";
import type { ReceiptQueryResult } from "@/types/api";

export function ReceiptQuery({
  initialCode = "",
  autoQuery = false,
}: {
  initialCode?: string;
  autoQuery?: boolean;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [result, setResult] = useState<ReceiptQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkinError, setCheckinError] = useState<string | null>(null);

  const doQuery = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setCheckinError(null);
    setResult(null);
    try {
      setResult(await queryReceipt(trimmed));
    } catch {
      setError(t("query.notFound"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // 公开签到：仅审核通过且签到已开放时可用
  const doCheckin = useCallback(async () => {
    if (!result) return;
    setCheckingIn(true);
    setCheckinError(null);
    try {
      setResult(await checkinReceipt(result.receipt_code));
    } catch (e) {
      setCheckinError(e instanceof Error ? e.message : t("query.checkinFailed"));
    } finally {
      setCheckingIn(false);
    }
  }, [result, t]);

  // 扫码 / 带参进入时自动查询
  useEffect(() => {
    if (autoQuery && initialCode) doQuery(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    doQuery(code);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("query.inputPlaceholder")}
          className="font-mono uppercase"
          aria-label={t("query.codeLabel")}
        />
        <Button type="submit" disabled={loading || !code.trim()}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {t("query.button")}
        </Button>
      </form>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {error}
        </p>
      )}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-border p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            {result.status === "rejected" ? (
              <XCircle className="h-5 w-5 text-destructive" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            )}
            <span className="font-semibold">{t(`query.types.${result.type}`)}</span>
            <code className="ml-auto font-mono text-xs text-muted-foreground">
              {result.receipt_code}
            </code>
          </div>

          <ResultRow label={t("query.statusLabel")}>
            <span className="inline-block rounded-full bg-secondary px-3 py-0.5 text-xs font-medium">
              {t(`query.statuses.${result.status}`)}
            </span>
          </ResultRow>

          {result.activity_title && (
            <ResultRow label={t("query.activityLabel")}>
              <span className="font-medium">{result.activity_title}</span>
            </ResultRow>
          )}

          <ResultRow label={t("query.submittedAtLabel")}>
            <span className="text-muted-foreground">
              {new Date(result.submitted_at).toLocaleString()}
            </span>
          </ResultRow>

          {result.checked_in_at && (
            <ResultRow label={t("query.checkedInAtLabel")}>
              <span className="font-medium text-green-600">
                {new Date(result.checked_in_at).toLocaleString()}
              </span>
            </ResultRow>
          )}

          {/* 签到：审核通过且管理员开放签到后显示 */}
          {result.status === "approved" && result.checkin_open && (
            <div className="space-y-2 pt-1">
              <Button onClick={doCheckin} disabled={checkingIn} className="w-full">
                {checkingIn ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <QrCode className="h-4 w-4" />
                )}
                {t("query.checkinButton")}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                {t("query.checkinHint")}
              </p>
            </div>
          )}

          {checkinError && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {checkinError}
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}

function ResultRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {children}
    </div>
  );
}
