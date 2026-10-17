"use client";

/**
 * /admin/activities - 活动管理（CRUD）
 * 页面只做组合；表单在 components/admin/activities/ActivityForm.tsx
 */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminListCard } from "@/components/admin/shared/AdminListCard";
import {
  deleteActivity,
  listActivities,
  updateActivity,
} from "@/lib/api/activities";
import { ActivityForm } from "@/components/admin/activities/ActivityForm";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import type { Activity } from "@/types/api";
import Loader2 from "@/assets/icons/status/loader-2.svg";
import Plus from "@/assets/icons/action/plus.svg";
import Pencil from "@/assets/icons/action/pencil.svg";
import Trash2 from "@/assets/icons/action/trash-2.svg";
import QrCode from "@/assets/icons/action/qr-code.svg";
import Archive from "@/assets/icons/action/archive.svg";
import ArchiveRestore from "@/assets/icons/action/archive-restore.svg";
import { cn } from "@/lib/utils";

/** 归档筛选：全部 / 未归档 / 已归档（P0 归档语义：归档 ≠ 删除） */
type ArchiveFilter = "all" | "active" | "archived";

export default function ActivitiesPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [open, setOpen] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("all");

  async function refresh() {
    setLoading(true);
    try {
      setItems(await listActivities());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(a: Activity) {
    setEditing(a);
    setOpen(true);
  }

  async function handleDelete(id: number) {
    if (!confirm(t("admin.activities.deleteConfirm"))) return;
    try {
      await deleteActivity(id);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  // 开放 / 关闭现场签到（报名者凭回执码在查询页签到）
  async function toggleCheckin(a: Activity) {
    try {
      await updateActivity(a.id, { checkin_open: !a.checkin_open });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }

  // 归档 / 取消归档（P0：二次确认；归档后报名/取消报名/签到接口后端强制 403；
  // 变更由后端写入审计日志 activity.update）
  async function toggleArchive(a: Activity) {
    const archiving = a.status !== "archived";
    const msg = archiving
      ? t("admin.activities.archiveConfirm", { title: a.title })
      : t("admin.activities.unarchiveConfirm", { title: a.title });
    if (!confirm(msg)) return;
    try {
      await updateActivity(a.id, { status: archiving ? "archived" : "published" });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }

  const filtered =
    archiveFilter === "all"
      ? items
      : items.filter((a) =>
          archiveFilter === "archived"
            ? a.status === "archived"
            : a.status !== "archived"
        );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.activities.title")}</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          {t("admin.activities.create")}
        </Button>
      </div>

      {/* 归档状态筛选 */}
      <div role="group" aria-label={t("admin.activities.archiveFilter")} className="flex gap-2">
        {(
          [
            { key: "all", label: t("admin.activities.filterAll") },
            { key: "active", label: t("admin.activities.filterActive") },
            { key: "archived", label: t("admin.activities.filterArchived") },
          ] as { key: ArchiveFilter; label: string }[]
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={archiveFilter === f.key}
            onClick={() => setArchiveFilter(f.key)}
            className={cn(
              "h-8 rounded-full border px-3 text-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              archiveFilter === f.key
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("admin.activities.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((a) => {
            // 桌面端右侧按钮组（原布局位置）；移动端同一组按钮落卡片底部
            const rowActions = (
              <>
                {/* 签到开关：开放后报名者可凭回执码签到 */}
                <Button
                  variant={a.checkin_open ? "default" : "outline"}
                  size="sm"
                  className={a.checkin_open ? "" : "text-muted-foreground"}
                  onClick={() => toggleCheckin(a)}
                  title={a.checkin_open ? t("admin.activities.checkinOpenHint") : t("admin.activities.checkinClosedHint")}
                >
                  <QrCode className="h-4 w-4 mr-1" />
                  {a.checkin_open
                    ? t("admin.activities.checkinOpen")
                    : t("admin.activities.checkinClosed")}
                </Button>
                {/* 归档 / 取消归档（P0：二次确认 + 审计日志） */}
                <Button
                  variant={a.status === "archived" ? "default" : "outline"}
                  size="sm"
                  className={a.status === "archived" ? "" : "text-muted-foreground"}
                  onClick={() => toggleArchive(a)}
                  title={
                    a.status === "archived"
                      ? t("admin.activities.unarchiveHint")
                      : t("admin.activities.archiveHint")
                  }
                >
                  {a.status === "archived" ? (
                    <>
                      <ArchiveRestore className="h-4 w-4 mr-1" />
                      {t("admin.activities.unarchive")}
                    </>
                  ) : (
                    <>
                      <Archive className="h-4 w-4 mr-1" />
                      {t("admin.activities.archive")}
                    </>
                  )}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => openEdit(a)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)} aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            );
            return (
            <AdminListCard
              key={a.id}
              contentClassName="space-y-1"
              title={
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate">{a.title}</span>
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {t(`admin.activities.statuses.${a.status}`)}
                  </span>
                </span>
              }
              headerActions={rowActions}
              footerClassName="border-t-0 pt-0 justify-end gap-1"
              actions={rowActions}
            >
              <p className="text-sm text-muted-foreground line-clamp-1 flex items-center gap-1.5">
                <span className="truncate">{a.content || "—"}</span>
                <span>·</span>
                {a.register_start ? (
                  <FormattedUserActionTime utcIso={a.register_start} />
                ) : (
                  "—"
                )}
              </p>
            </AdminListCard>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("admin.activities.edit") : t("admin.activities.create")}
            </DialogTitle>
          </DialogHeader>
          <ActivityForm
            initial={editing}
            onSaved={() => {
              setOpen(false);
              refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
