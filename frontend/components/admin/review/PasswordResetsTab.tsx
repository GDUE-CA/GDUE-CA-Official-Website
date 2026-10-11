/**
 * 审核中心 - 重置密码审核 Tab
 * 迁移自原 /admin/password-resets 页：忘记密码申请的处理与批量操作
 */
"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, X, Mail, CheckCheck, XCircle, Square, SquareCheck } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  listPasswordResets,
  handlePasswordReset,
  batchHandlePasswordResets,
} from "@/lib/api/auth";
import { StatusBadge } from "./StatusBadge";
import { BatchBar } from "./BatchBar";
import { useBatchSelection } from "./useBatchSelection";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import type { PasswordResetItem } from "@/types/api";

export function PasswordResetsTab() {
  const { t } = useI18n();
  const [items, setItems] = useState<PasswordResetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [handlingId, setHandlingId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  // 仅 pending 项可选（已处理的申请不可再改）
  const { selected, toggle, toggleAll, clear, allSelected, setSelected } =
    useBatchSelection(items, (item) => item.status === "pending");
  const [batchLoading, setBatchLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await listPasswordResets(filter === "pending" ? "pending" : undefined);
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function handle(id: number, status: "handled" | "rejected") {
    setHandlingId(id);
    try {
      await handlePasswordReset(id, {
        status,
        admin_note: notes[id] || undefined,
      });
      await load();
    } catch {
      // 忽略
    } finally {
      setHandlingId(null);
    }
  }

  async function batchAction(status: "handled" | "rejected") {
    if (selected.size === 0) return;
    if (!confirm(t(`admin.passwordResets.batchConfirm.${status}`).replace("{count}", String(selected.size)))) return;
    setBatchLoading(true);
    try {
      await batchHandlePasswordResets([...selected], status);
      setSelected(new Set());
      await load();
    } catch {
      // 忽略
    } finally {
      setBatchLoading(false);
    }
  }

  function statusTone(s: string) {
    if (s === "pending") return "warning" as const;
    if (s === "handled") return "success" as const;
    return "danger" as const;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "pending" | "all")}
        >
          <option value="pending">{t("admin.passwordResets.filterPending")}</option>
          <option value="all">{t("admin.passwordResets.filterAll")}</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleAll}
          disabled={items.filter((i) => i.status === "pending").length === 0}
        >
          {allSelected ? (
            <Square className="h-4 w-4 mr-1" />
          ) : (
            <SquareCheck className="h-4 w-4 mr-1" />
          )}
          {t("admin.passwordResets.selectAll")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("admin.passwordResets.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className={selected.has(item.id) ? "border-primary/50" : undefined}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    {item.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => toggle(item.id)}
                        className="flex items-center justify-center"
                        title={t("admin.passwordResets.selectRow")}
                      >
                        {selected.has(item.id) ? (
                          <SquareCheck className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    ) : (
                      <span className="flex items-center justify-center w-4 opacity-30">
                        <Square className="h-4 w-4 text-muted-foreground" />
                      </span>
                    )}
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{item.contact_email}</span>
                  </div>
                  <StatusBadge tone={statusTone(item.status)}>
                    {t(`admin.passwordResets.statuses.${item.status}`)}
                  </StatusBadge>
                </div>
                {item.username_hint && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">{t("admin.passwordResets.colUsername")}：</span>
                    {item.username_hint}
                  </div>
                )}
                <div className="text-sm">
                  <span className="text-muted-foreground">{t("admin.passwordResets.colReason")}：</span>
                  {item.reason}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("admin.passwordResets.colCreatedAt")}：<FormattedUserActionTime utcIso={item.created_at} />
                </div>

                {item.status === "pending" && (
                  <>
                    <Textarea
                      placeholder={t("admin.passwordResets.adminNotePlaceholder")}
                      value={notes[item.id] || ""}
                      onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={handlingId === item.id}
                        onClick={() => handle(item.id, "handled")}
                      >
                        {handlingId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        {t("admin.passwordResets.markHandled")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={handlingId === item.id}
                        onClick={() => handle(item.id, "rejected")}
                      >
                        <X className="h-4 w-4" />
                        {t("admin.passwordResets.markRejected")}
                      </Button>
                    </div>
                  </>
                )}

                {item.admin_note && item.status !== "pending" && (
                  <div className="text-sm border-t border-border pt-2">
                    <span className="text-muted-foreground">{t("admin.passwordResets.adminNote")}：</span>
                    {item.admin_note}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 浮动批量操作栏：有选中项时显示在右下角 */}
      {selected.size > 0 && (
        <BatchBar
          countLabel={t("admin.passwordResets.selected").replace("{count}", String(selected.size))}
          loading={batchLoading}
          cancelLabel={t("common.cancel")}
          onCancel={() => setSelected(new Set())}
          actions={[
            {
              key: "handled",
              label: t("admin.passwordResets.batchHandled"),
              icon: CheckCheck,
              variant: "default",
              onClick: () => batchAction("handled"),
            },
            {
              key: "rejected",
              label: t("admin.passwordResets.batchRejected"),
              icon: XCircle,
              variant: "destructive",
              onClick: () => batchAction("rejected"),
            },
          ]}
        />
      )}
    </div>
  );
}
