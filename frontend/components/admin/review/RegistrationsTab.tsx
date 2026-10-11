/**
 * 审核中心 - 报名审核 Tab
 * 迁移自原 /admin/registrations 页：活动报名 + 社团报名合并列表，
 * 支持类型/活动/状态筛选、自动翻译、批量审核、导出、手动补录
 */
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { UserPlus } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listActivities } from "@/lib/api/activities";
import {
  listRegistrations,
  setRegistrationStatus,
  batchSetRegistrationStatus,
  exportRegistrationsUrl,
} from "@/lib/api/register";
import { batchTranslate } from "@/lib/api/translations";
import { StatusBadge } from "./StatusBadge";
import { BatchBar } from "./BatchBar";
import { useBatchSelection } from "./useBatchSelection";
import { ManualRegistrationDialog } from "./ManualRegistrationDialog";
import { useEffectivePermissions } from "@/lib/permissions";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import type {
  Activity,
  Registration,
  RegistrationStatus,
  RegistrationType,
  TranslationResult,
} from "@/types/api";
import { Download, Check, X, Languages, CheckCheck, XCircle, Square, SquareCheck } from "lucide-react";

const STATUSES: RegistrationStatus[] = ["pending", "approved", "rejected", "checked_in"];
const TYPES: RegistrationType[] = ["activity", "club"];

function typeLabel(t: RegistrationType, tfn: (k: string) => string) {
  return t === "activity" ? tfn("admin.registrations.typeActivity") : tfn("admin.registrations.typeClub");
}

export function RegistrationsTab() {
  const { t, locale } = useI18n();
  const search = useSearchParams();
  const { can } = useEffectivePermissions();
  const canManage = can("review.registrations", "manage");
  const [items, setItems] = useState<Registration[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityId, setActivityId] = useState<string>(search.get("activity_id") ?? "");
  const [status, setStatus] = useState<string>(search.get("status") ?? "");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Registration | null>(null);
  // 手动补录弹窗
  const [manualOpen, setManualOpen] = useState(false);
  // 自动翻译：key = r{id}.{field}
  const [trans, setTrans] = useState<Record<string, TranslationResult>>({});
  const [showOriginal, setShowOriginal] = useState(false);

  const { selected, toggle, toggleAll, clear, allSelected, someSelected, setSelected } =
    useBatchSelection(items, (r) => r.status !== "checked_in");
  const [batchLoading, setBatchLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const params: {
        activity_id?: number;
        status?: RegistrationStatus;
        registration_type?: RegistrationType;
      } = {};
      if (activityId) params.activity_id = Number(activityId);
      if (status) params.status = status as RegistrationStatus;
      if (typeFilter) params.registration_type = typeFilter as RegistrationType;
      setItems(await listRegistrations(params));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    listActivities().then(setActivities).catch(() => setActivities([]));
  }, []);

  useEffect(() => {
    refresh();
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, status, typeFilter]);

  /** 列表变化或显示语言变化时，自动把非当前语言的文本批量翻译 */
  useEffect(() => {
    if (items.length === 0) {
      setTrans({});
      return;
    }
    const batch = [];
    for (const r of items) {
      if (r.content_lang && r.content_lang !== locale) {
        if (r.introduction) batch.push({ key: `r${r.id}.introduction`, text: r.introduction.slice(0, 2000), source_lang: r.content_lang });
        if (r.college) batch.push({ key: `r${r.id}.college`, text: r.college, source_lang: r.content_lang });
        if (r.major) batch.push({ key: `r${r.id}.major`, text: r.major, source_lang: r.content_lang });
        if (r.position) batch.push({ key: `r${r.id}.position`, text: r.position, source_lang: r.content_lang });
      }
    }
    if (batch.length === 0) {
      setTrans({});
      return;
    }
    let cancelled = false;
    batchTranslate(batch, locale)
      .then((d) => { if (!cancelled) setTrans(d.translations); })
      .catch(() => { if (!cancelled) setTrans({}); });
    return () => { cancelled = true; };
  }, [items, locale]);

  /** 取翻译后的字段值（查看原文时返回原文） */
  function tv(r: Registration, field: "introduction" | "college" | "major" | "position"): string {
    if (!showOriginal) {
      const res = trans[`r${r.id}.${field}`];
      if (res?.translated) return res.text;
    }
    return (r[field] as string | null) ?? "—";
  }

  const hasTranslation = (r: Registration) =>
    Boolean(trans[`r${r.id}.introduction`]?.translated ||
      trans[`r${r.id}.college`]?.translated ||
      trans[`r${r.id}.major`]?.translated ||
      trans[`r${r.id}.position`]?.translated);

  async function changeStatus(id: number, newStatus: RegistrationStatus) {
    try {
      await setRegistrationStatus(id, newStatus);
      await refresh();
      setDetail(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function batchAction(newStatus: "approved" | "rejected") {
    if (selected.size === 0) return;
    if (!confirm(t(`admin.registrations.batchConfirm.${newStatus}`).replace("{count}", String(selected.size)))) return;
    setBatchLoading(true);
    try {
      const res = await batchSetRegistrationStatus([...selected], newStatus);
      if (res.skipped.length > 0) {
        alert(t("admin.registrations.batchSkipped").replace("{count}", String(res.skipped.length)));
      }
      setSelected(new Set());
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Batch update failed");
    } finally {
      setBatchLoading(false);
    }
  }

  function exportFile(fmt: "csv" | "xlsx") {
    // club 类型导出：用 registration_type=club
    if (typeFilter === "club") {
      window.open(
        exportRegistrationsUrl({ registrationType: "club", fmt }),
        "_blank"
      );
      return;
    }
    // activity 类型必须指定 activity_id
    if (!activityId) {
      alert(t("register.selectEvent"));
      return;
    }
    window.open(
      exportRegistrationsUrl({ activityId: Number(activityId), fmt }),
      "_blank"
    );
  }

  const selectable = items.filter((r) => r.status !== "checked_in");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">{t("admin.registrations.filterType")}</option>
            {TYPES.map((tp) => (
              <option key={tp} value={tp}>{typeLabel(tp, t)}</option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={activityId}
            onChange={(e) => setActivityId(e.target.value)}
            disabled={typeFilter === "club"}
          >
            <option value="">{t("admin.registrations.filterActivity")}</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{t("admin.registrations.filterStatus")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`admin.registrations.statuses.${s}`)}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" />
              {t("admin.review.manualCreate")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={toggleAll} disabled={selectable.length === 0}>
            {allSelected ? (
              <Square className="h-4 w-4 mr-1" />
            ) : (
              <SquareCheck className="h-4 w-4 mr-1" />
            )}
            {t("admin.registrations.selectAll")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportFile("csv")}>
            <Download className="h-4 w-4 mr-1" />
            {t("admin.registrations.exportCsv")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportFile("xlsx")}>
            <Download className="h-4 w-4 mr-1" />
            {t("admin.registrations.exportXlsx")}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground">{t("common.loading")}</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("admin.registrations.empty")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 w-10">
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="flex items-center justify-center text-muted-foreground hover:text-foreground"
                      title={t("admin.registrations.selectAll")}
                    >
                      {allSelected ? (
                        <SquareCheck className="h-4 w-4 text-primary" />
                      ) : someSelected ? (
                        <Square className="h-4 w-4 text-primary fill-primary/40" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-2">{t("admin.registrations.colType")}</th>
                  <th className="px-3 py-2">{t("admin.registrations.colName")}</th>
                  <th className="px-3 py-2">{t("admin.registrations.colStudentId")}</th>
                  <th className="px-3 py-2 hidden md:table-cell">{t("admin.registrations.colCollege")}</th>
                  <th className="px-3 py-2 hidden lg:table-cell">{t("admin.registrations.colMajor")}</th>
                  <th className="px-3 py-2">{t("admin.registrations.colPhone")}</th>
                  <th className="px-3 py-2">{t("admin.registrations.colStatus")}</th>
                  <th className="px-3 py-2 hidden sm:table-cell">{t("admin.review.colSource")}</th>
                  <th className="px-3 py-2 hidden sm:table-cell">{t("admin.registrations.colSubmittedAt")}</th>
                  <th className="px-3 py-2">{t("admin.activities.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className={`border-t border-border hover:bg-muted/30 ${selected.has(r.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggle(r.id)}
                        disabled={r.status === "checked_in"}
                        className="flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                        title={r.status !== "checked_in" ? t("admin.registrations.selectRow") : t("admin.registrations.checkedInLock")}
                      >
                        {selected.has(r.id) ? (
                          <SquareCheck className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={r.registration_type === "club" ? "success" : "info"}>
                        {typeLabel(r.registration_type, t)}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {r.name}
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{r.receipt_code}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.student_id}</td>
                    <td className="px-3 py-2 hidden md:table-cell">{tv(r, "college")}</td>
                    <td className="px-3 py-2 hidden lg:table-cell">{tv(r, "major")}</td>
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.phone_cc} {r.phone_number}</td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        tone={
                          r.status === "pending" ? "warning"
                          : r.status === "approved" ? "success"
                          : r.status === "rejected" ? "danger"
                          : "info"
                        }
                      >
                        {t(`admin.registrations.statuses.${r.status}`)}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      <StatusBadge tone={r.source === "manual" ? "info" : "neutral"}>
                        {r.source === "manual" ? t("admin.review.sourceManual") : t("admin.review.sourceForm")}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                      <FormattedUserActionTime utcIso={r.submitted_at} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>
                          {t("admin.registrations.viewDetail")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                  {detail.receipt_code}
                </code>
                {hasTranslation(detail) && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowOriginal(!showOriginal)}>
                    <Languages className="h-3.5 w-3.5 mr-1" />
                    {showOriginal ? t("admin.trans.hideOriginal") : t("admin.trans.showOriginal")}
                  </Button>
                )}
              </div>
              <DetailRow label={t("admin.registrations.colType")} value={typeLabel(detail.registration_type, t)} />
              <DetailRow
                label={t("admin.review.colSource")}
                value={detail.source === "manual" ? t("admin.review.sourceManual") : t("admin.review.sourceForm")}
              />
              <DetailRow label={t("admin.registrations.colStudentId")} value={detail.student_id} />
              <DetailRow label={t("admin.registrations.colCollege")} value={tv(detail, "college")} />
              <DetailRow label={t("admin.registrations.colMajor")} value={tv(detail, "major")} />
              <DetailRow label={t("admin.registrations.colPhone")} value={`${detail.phone_cc} ${detail.phone_number}`} />
              <DetailRow label={t("admin.registrations.colEmail")} value={detail.email ?? "—"} />
              <DetailRow label={t("join.form.position")} value={tv(detail, "position")} />
              <div className="space-y-1">
                <DetailRow label={t("join.form.introduction")} value={tv(detail, "introduction")} />
                {trans[`r${detail.id}.introduction`]?.translated && !showOriginal && (
                  <p className="text-xs text-muted-foreground border-l-2 border-border pl-2 whitespace-pre-wrap ml-auto max-w-[70%]">
                    {detail.introduction}
                  </p>
                )}
              </div>
              <DetailRow label={t("admin.registrations.colStatus")} value={t(`admin.registrations.statuses.${detail.status}`)} />
              {detail.checked_in_at && (
                <DetailRow
                  label={t("admin.registrations.checkedInAt")}
                  value={<FormattedUserActionTime utcIso={detail.checked_in_at} />}
                />
              )}
              {detail.remark && (
                <DetailRow label={t("admin.registrations.remark")} value={detail.remark} />
              )}
              <DetailRow
                label={t("admin.registrations.colSubmittedAt")}
                value={<FormattedUserActionTime utcIso={detail.submitted_at} />}
              />
              <DetailRow label={t("admin.registrations.submitIp")} value={<code className="text-xs">{detail.submit_ip ?? "-"}</code>} />
              {/* 审核只提供 通过/拒绝；签到由报名者凭回执码在查询页完成 */}
              <div className="flex gap-2 pt-3">
                <Button
                  size="sm"
                  onClick={() => changeStatus(detail.id, "approved")}
                  disabled={detail.status === "approved" || detail.status === "checked_in"}
                >
                  <Check className="h-4 w-4 mr-1" />{t("admin.registrations.approve")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => changeStatus(detail.id, "rejected")}
                  disabled={detail.status === "rejected" || detail.status === "checked_in"}
                >
                  <X className="h-4 w-4 mr-1" />{t("admin.registrations.reject")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ManualRegistrationDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        activities={activities}
        onCreated={() => refresh()}
      />

      {/* 浮动批量操作栏：有选中项时显示在右下角 */}
      {selected.size > 0 && (
        <BatchBar
          countLabel={t("admin.registrations.selected").replace("{count}", String(selected.size))}
          loading={batchLoading}
          cancelLabel={t("common.cancel")}
          onCancel={() => setSelected(new Set())}
          actions={[
            {
              key: "approve",
              label: t("admin.registrations.batchApprove"),
              icon: CheckCheck,
              variant: "default",
              onClick: () => batchAction("approved"),
            },
            {
              key: "reject",
              label: t("admin.registrations.batchReject"),
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

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right break-all">{value}</span>
    </div>
  );
}
