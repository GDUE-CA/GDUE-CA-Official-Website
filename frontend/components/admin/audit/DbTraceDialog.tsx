"use client";

/**
 * 数据库写入审计弹窗：按 trace id 展示一次写事务的发起上下文 + 全部行级变更 + 同事务操作日志。
 * 对应后端 GET /api/admin/db-traces/{trace_id}（只读，审计不可修改）。
 */
import { useEffect, useState } from "react";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import { useI18n } from "@/i18n/provider";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import { adminGetDbTrace } from "@/lib/api/auditLogs";
import type { DbChangeInfo, DbTraceDetail } from "@/types/api";

const OP_VARIANT: Record<DbChangeInfo["op"], "secondary" | "outline" | "destructive"> = {
  insert: "secondary",
  update: "outline",
  delete: "destructive",
  bulk_update: "outline",
  bulk_delete: "destructive",
};

/** 审计值原样展示：字符串直出，其余 JSON 序列化（null 显示为 null，区别于空串） */
function show(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function ChangeFields({ change }: { change: DbChangeInfo }) {
  const entries = Object.entries(change.changes ?? {});
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {entries.map(([field, value]) => (
        <div key={field} className="contents">
          <dt className="font-mono text-muted-foreground">{field}</dt>
          <dd className="font-mono break-all">
            {change.op === "update" && Array.isArray(value) && value.length === 2 ? (
              <>
                <span className="text-muted-foreground line-through">{show(value[0])}</span>
                {" → "}
                <span>{show(value[1])}</span>
              </>
            ) : (
              <span className={change.op === "delete" ? "text-muted-foreground line-through" : undefined}>
                {show(value)}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DbTraceDialog({ traceId, onClose }: { traceId: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<DbTraceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!traceId) return;
    let alive = true;
    adminGetDbTrace(traceId)
      .then((d) => alive && setDetail(d))
      .catch((err) => alive && setError(err instanceof Error ? err.message : t("common.error")));
    return () => {
      alive = false;
      setDetail(null);
      setError(null);
    };
  }, [traceId, t]);

  const trace = detail?.trace;
  return (
    <Dialog open={traceId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("admin.auditLogs.dbTrace.title")}</DialogTitle>
          <DialogDescription className="font-mono text-xs break-all">{traceId}</DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
        ) : !detail || !trace ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5 text-sm min-w-0">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">{t("admin.auditLogs.time")}</dt>
              <dd><FormattedUserActionTime utcIso={trace.created_at} /></dd>
              <dt className="text-muted-foreground">{t("admin.auditLogs.dbTrace.source")}</dt>
              <dd>
                {trace.source === "request"
                  ? t("admin.auditLogs.dbTrace.sourceRequest")
                  : t("admin.auditLogs.dbTrace.sourceBackground")}
              </dd>
              <dt className="text-muted-foreground">{t("admin.auditLogs.dbTrace.operator")}</dt>
              <dd>
                {trace.actor ?? (trace.username ? `@${trace.username}` : t("admin.auditLogs.dbTrace.anonymous"))}
              </dd>
              {trace.path && (
                <>
                  <dt className="text-muted-foreground">{t("admin.auditLogs.dbTrace.endpoint")}</dt>
                  <dd className="font-mono break-all">{trace.method} {trace.path}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{t("admin.auditLogs.ip")}</dt>
              <dd className="font-mono">{trace.ip || "—"}</dd>
              <dt className="text-muted-foreground">{t("admin.auditLogs.requestId")}</dt>
              <dd className="font-mono break-all">{trace.request_id || "—"}</dd>
            </dl>

            <section className="space-y-2">
              <h3 className="font-medium">{t("admin.auditLogs.dbTrace.changes")}</h3>
              {detail.changes.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("admin.auditLogs.dbTrace.noChanges")}</p>
              ) : (
                <ul className="space-y-2">
                  {detail.changes.map((c) => (
                    <li key={c.id} className="rounded-md border px-3 py-2 text-xs space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Badge variant={OP_VARIANT[c.op]}>{t(`admin.auditLogs.dbTrace.op.${c.op}`)}</Badge>
                        <span className="font-mono">
                          {c.table_name}
                          {c.row_pk ? `#${c.row_pk}` : ""}
                        </span>
                      </div>
                      <ChangeFields change={c} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">{t("admin.auditLogs.dbTrace.masked")}</p>
            </section>

            {detail.audit_logs.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-medium">{t("admin.auditLogs.dbTrace.relatedLogs")}</h3>
                <ul className="space-y-1 text-xs">
                  {detail.audit_logs.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <span className="font-mono">{a.action}</span>
                      <span className="text-muted-foreground break-all">{a.detail || a.target || "—"}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
