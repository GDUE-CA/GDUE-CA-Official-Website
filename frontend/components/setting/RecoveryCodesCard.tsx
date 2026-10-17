"use client";

/**
 * RecoveryCodesCard —— 一次性安全恢复码（V0.5.8 §4 账号兜底找回密钥）
 *
 * /setting → 账号安全 卡片：
 * - 「生成恢复码」：明文仅此一次在弹窗展示 + 复制按钮，关闭后服务端无法再还原；
 * - 列表分状态徽章展示（有效 / 已使用 / 已作废），含生成 / 使用 / 作废时间；
 * - 有效码可手动作废（二次确认 Dialog）；已使用 / 已作废为终态不可操作。
 */
import { useCallback, useEffect, useState } from "react";
import ShieldCheck from "@/assets/icons/status/shield-check.svg";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Copy from "@/assets/icons/action/copy.svg";
import Check from "@/assets/icons/action/check.svg";
import Plus from "@/assets/icons/action/plus.svg";
import Ban from "@/assets/icons/status/ban.svg";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge, type StatusTone } from "@/components/admin/review/StatusBadge";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import {
  generateRecoveryCode,
  listRecoveryCodes,
  revokeRecoveryCode,
} from "@/lib/api/recoveryCodes";
import type { RecoveryCodeItem } from "@/types/api";

/** 派生展示状态：已使用 > 已作废 > 有效 */
function codeStatus(c: RecoveryCodeItem): "active" | "used" | "revoked" {
  if (c.used_at) return "used";
  if (c.revoked) return "revoked";
  return "active";
}

const STATUS_TONE: Record<ReturnType<typeof codeStatus>, StatusTone> = {
  active: "success",
  used: "neutral",
  revoked: "danger",
};

export function RecoveryCodesCard() {
  const { t } = useI18n();

  const [items, setItems] = useState<RecoveryCodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 生成结果：明文仅此一次展示
  const [generated, setGenerated] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // 作废确认
  const [revoking, setRevoking] = useState<RecoveryCodeItem | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listRecoveryCodes());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await generateRecoveryCode();
      setGenerated(res.code);
      setCopied(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用时忽略，用户可手动选中复制
    }
  }

  async function handleRevoke() {
    if (!revoking) return;
    setRevokeLoading(true);
    setRevokeError(null);
    try {
      await revokeRecoveryCode(revoking.id);
      setRevoking(null);
      await load();
    } catch (e) {
      setRevokeError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setRevokeLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5" />
              {t("account.recoveryCodes.title")}
            </CardTitle>
            <CardDescription>{t("account.recoveryCodes.desc")}</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleGenerate()}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {t("account.recoveryCodes.generate")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("account.recoveryCodes.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((c) => {
              const st = codeStatus(c);
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={STATUS_TONE[st]}>
                        {t(`account.recoveryCodes.status.${st}`)}
                      </StatusBadge>
                      <span className="text-xs text-muted-foreground">
                        {t("account.recoveryCodes.createdAt")}：
                        <FormattedUserActionTime utcIso={c.created_at} />
                      </span>
                    </div>
                    {c.used_at && (
                      <p className="text-xs text-muted-foreground">
                        {t("account.recoveryCodes.usedAt")}：
                        <FormattedUserActionTime utcIso={c.used_at} />
                      </p>
                    )}
                    {c.revoked && c.revoked_at && (
                      <p className="text-xs text-muted-foreground">
                        {t("account.recoveryCodes.revokedAt")}：
                        <FormattedUserActionTime utcIso={c.revoked_at} />
                      </p>
                    )}
                  </div>
                  {st === "active" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRevoking(c);
                        setRevokeError(null);
                      }}
                    >
                      <Ban className="h-4 w-4" />
                      {t("account.recoveryCodes.revoke")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* 生成结果弹窗：明文仅此一次展示 */}
        <Dialog
          open={generated !== null}
          onOpenChange={(open) => {
            if (!open) setGenerated(null);
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("account.recoveryCodes.generatedTitle")}</DialogTitle>
              <DialogDescription>
                {t("account.recoveryCodes.generatedDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <p className="select-all break-all rounded-md bg-muted px-3 py-2 text-center font-mono text-sm tracking-wider">
                {generated}
              </p>
              <p className="text-xs text-destructive">
                {t("account.recoveryCodes.generatedWarning")}
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => void handleCopy()}>
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied
                    ? t("account.recoveryCodes.copied")
                    : t("account.recoveryCodes.copy")}
                </Button>
                <Button type="button" onClick={() => setGenerated(null)}>
                  {t("account.recoveryCodes.saved")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 作废确认弹窗 */}
        <Dialog
          open={revoking !== null}
          onOpenChange={(open) => {
            if (!open && !revokeLoading) setRevoking(null);
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("account.recoveryCodes.revokeTitle")}</DialogTitle>
              <DialogDescription>
                {t("account.recoveryCodes.revokeDesc")}
              </DialogDescription>
            </DialogHeader>
            {revokeError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {revokeError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRevoking(null)}
                disabled={revokeLoading}
              >
                {t("setting.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleRevoke()}
                disabled={revokeLoading}
              >
                {revokeLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4" />
                )}
                {t("account.recoveryCodes.revokeConfirm")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
