"use client";

/**
 * /admin/recycle - 内容回收站（P0）
 *
 * 统一收纳所有软删除资源：用户账号、活动（后续其它软删除业务也接入此处）。
 * - 列表展示剩余保留天数（后端计算，30 天阈值）
 * - 恢复：is_deleted 置回 False（账号恢复仅 super_admin，后端强制）
 * - 永久删除：物理清除（账号物理删除仅 super_admin），不可恢复，二次确认
 * 只读浏览无需权限模块限制；操作权限由后端按角色强制校验。
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, Trash2, UserRound, CalendarDays } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  listRecycle,
  restoreRecycleItem,
  purgeRecycleItem,
  type RecycleList,
} from "@/lib/api/recycle";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";

/** UTC 时间 → 可用于 <time> 的 Z 后缀 ISO（后端旧壳接口输出无 Z 的 naive UTC） */
function ensureUtcZ(value: string | null): string | null {
  if (!value) return null;
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
}

export default function RecyclePage() {
  const { t } = useI18n();
  const [data, setData] = useState<RecycleList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listRecycle());
    } catch (e) {
      setNotice({ type: "error", text: e instanceof Error ? e.message : "Load failed" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleRestore(rtype: "user" | "activity", rid: number) {
    if (!confirm(t("admin.recycle.restoreConfirm"))) return;
    setBusyKey(`${rtype}-${rid}-restore`);
    setNotice(null);
    try {
      await restoreRecycleItem(rtype, rid);
      setNotice({ type: "ok", text: t("admin.recycle.restoreOk") });
      await refresh();
    } catch (e) {
      setNotice({ type: "error", text: e instanceof Error ? e.message : "Restore failed" });
    } finally {
      setBusyKey(null);
    }
  }

  async function handlePurge(rtype: "user" | "activity", rid: number, label: string) {
    if (!confirm(t("admin.recycle.purgeConfirm", { name: label }))) return;
    setBusyKey(`${rtype}-${rid}-purge`);
    setNotice(null);
    try {
      await purgeRecycleItem(rtype, rid);
      setNotice({ type: "ok", text: t("admin.recycle.purgeOk") });
      await refresh();
    } catch (e) {
      setNotice({ type: "error", text: e instanceof Error ? e.message : "Purge failed" });
    } finally {
      setBusyKey(null);
    }
  }

  const total = data ? data.users.length + data.activities.length : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.recycle.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("admin.recycle.subtitle", { days: data?.retention_days ?? 30 })}
          </p>
        </div>
        <Badge variant="secondary" className="font-mono tabular-nums">
          {t("admin.recycle.total", { count: total })}
        </Badge>
      </div>

      {/* 操作结果提示条 */}
      {notice && (
        <div
          role="status"
          className={
            notice.type === "ok"
              ? "rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-400"
              : "rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
          }
        >
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("admin.recycle.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* 用户账号 */}
          {data && data.users.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <UserRound className="h-4 w-4" />
                {t("admin.recycle.usersSection")}（{data.users.length}）
              </h2>
              <div className="grid gap-3">
                {data.users.map((u) => {
                  const key = `user-${u.id}`;
                  return (
                    <Card key={key}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{u.display_name || u.username}</span>
                            <Badge variant="outline" className="font-mono text-[11px]">
                              {u.role}
                            </Badge>
                            <span className="font-mono text-xs text-muted-foreground">
                              @{u.username}
                            </span>
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>
                              {t("admin.recycle.deletedAt")}{" "}
                              {u.deleted_at ? (
                                <FormattedUserActionTime utcIso={ensureUtcZ(u.deleted_at)!} />
                              ) : (
                                "—"
                              )}
                            </span>
                            <span className="font-mono">
                              {t("admin.recycle.daysLeft", { days: u.days_left ?? 0 })}
                            </span>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyKey === `${key}-restore`}
                            onClick={() => handleRestore("user", u.id)}
                          >
                            {busyKey === `${key}-restore` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            {t("admin.recycle.restore")}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={busyKey === `${key}-purge`}
                            onClick={() => handlePurge("user", u.id, u.username)}
                          >
                            {busyKey === `${key}-purge` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            {t("admin.recycle.purge")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* 活动 */}
          {data && data.activities.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                {t("admin.recycle.activitiesSection")}（{data.activities.length}）
              </h2>
              <div className="grid gap-3">
                {data.activities.map((a) => {
                  const key = `activity-${a.id}`;
                  return (
                    <Card key={key}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{a.title}</span>
                            <Badge variant="outline" className="font-mono text-[11px]">
                              {a.status}
                            </Badge>
                            <span className="font-mono text-xs text-muted-foreground">
                              #{a.id}
                            </span>
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>
                              {t("admin.recycle.deletedAt")}{" "}
                              {a.deleted_at ? (
                                <FormattedUserActionTime utcIso={ensureUtcZ(a.deleted_at)!} />
                              ) : (
                                "—"
                              )}
                            </span>
                            <span className="font-mono">
                              {t("admin.recycle.daysLeft", { days: a.days_left ?? 0 })}
                            </span>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyKey === `${key}-restore`}
                            onClick={() => handleRestore("activity", a.id)}
                          >
                            {busyKey === `${key}-restore` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            {t("admin.recycle.restore")}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={busyKey === `${key}-purge`}
                            onClick={() => handlePurge("activity", a.id, a.title)}
                          >
                            {busyKey === `${key}-purge` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            {t("admin.recycle.purge")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
