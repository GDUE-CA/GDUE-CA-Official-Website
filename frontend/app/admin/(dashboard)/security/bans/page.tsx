"use client";

/**
 * /admin/security/bans - 登录防爆破封禁面板
 *
 * - 列表：账号 / 策略(Break-Glass/Normal) / 维度(IP/Fingerprint) / 维度值(脱敏)
 *   / 阶段 / 封禁时间 / 到期时间 / 永久标识 / 操作
 * - 操作：解封（DELETE）、重置阶段（POST reset）— 均带确认弹窗
 * - 空态：暂无封禁记录
 * - 位于 (dashboard) 路由组，自动获得侧边栏与登录态守卫
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldBan, ShieldAlert } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchBans, resetBanStage, unbanBan } from "@/lib/api/security";
import type { BanEntry } from "@/types/api";

/** 维度值脱敏：保留首尾各 4 字符，中间以 * 替代；过短则全显示 */
function maskValue(v: string): string {
  if (!v) return "";
  if (v.length <= 8) return v;
  return `${v.slice(0, 4)}${"*".repeat(Math.min(8, v.length - 8))}${v.slice(-4)}`;
}

/** 本地化时间格式化：UTC ISO → 本地展示（失败原样返回） */
function formatTime(iso: string | null, locale: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(locale);
  } catch {
    return iso;
  }
}

export default function BansPage() {
  const { t, locale } = useI18n();
  const [bans, setBans] = useState<BanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // 确认弹窗状态
  const [confirm, setConfirm] = useState<
    | { type: "unban" | "reset"; entry: BanEntry }
    | null
  >(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchBans();
      setBans(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.bans.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUnban(entry: BanEntry) {
    setActing(true);
    setMsg(null);
    try {
      await unbanBan(entry.policy, entry.account, entry.dim, entry.dim_value);
      setMsg(t("admin.bans.success"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.bans.error"));
    } finally {
      setActing(false);
      setConfirm(null);
    }
  }

  async function handleReset(entry: BanEntry) {
    setActing(true);
    setMsg(null);
    try {
      await resetBanStage({
        policy: entry.policy,
        account: entry.account,
        dim: entry.dim,
        dim_value: entry.dim_value,
      });
      setMsg(t("admin.bans.success"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.bans.error"));
    } finally {
      setActing(false);
      setConfirm(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldBan className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">{t("admin.bans.title")}</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-3">{t("admin.bans.subtitle")}</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.bans.title")}</CardTitle>
          <CardDescription>{t("admin.bans.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-8 text-center">{error}</p>
          ) : msg ? (
            <p className="text-sm text-emerald-600 py-4 text-center">{msg}</p>
          ) : bans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t("admin.bans.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 px-2 font-medium">{t("admin.bans.account")}</th>
                    <th className="py-2 px-2 font-medium">{t("admin.bans.policy")}</th>
                    <th className="py-2 px-2 font-medium">{t("admin.bans.dim")}</th>
                    <th className="py-2 px-2 font-medium">{t("admin.bans.dimValue")}</th>
                    <th className="py-2 px-2 font-medium">{t("admin.bans.stage")}</th>
                    <th className="py-2 px-2 font-medium">{t("admin.bans.bannedAt")}</th>
                    <th className="py-2 px-2 font-medium">{t("admin.bans.until")}</th>
                    <th className="py-2 px-2 font-medium">{t("admin.bans.permanent")}</th>
                    <th className="py-2 px-2 font-medium text-right">
                      {t("admin.bans.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bans.map((b, i) => (
                    <tr
                      key={`${b.policy}-${b.account}-${b.dim}-${b.dim_value}-${i}`}
                      className="border-b border-border/60 hover:bg-muted/40 transition-colors"
                    >
                      <td className="py-2 px-2 font-medium">{b.account_label || b.account}</td>
                      <td className="py-2 px-2">
                        {b.policy === "break_glass" ? (
                          <Badge variant="destructive" className="text-xs">
                            Break-Glass
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Normal
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {b.dim === "IP" ? "IP" : "Fingerprint"}
                      </td>
                      <td className="py-2 px-2 font-mono text-xs">
                        {maskValue(b.dim_value)}
                      </td>
                      <td className="py-2 px-2 font-mono tabular-nums">{b.stage}</td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {formatTime(b.banned_at, locale)}
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {b.permanent || !b.until
                          ? t("admin.bans.permanent")
                          : formatTime(b.until, locale)}
                      </td>
                      <td className="py-2 px-2">
                        {b.permanent && (
                          <Badge variant="destructive" className="text-xs">
                            <ShieldAlert className="h-3 w-3 mr-1" />
                            {t("admin.bans.permanent")}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirm({ type: "unban", entry: b })}
                          >
                            {t("admin.bans.unban")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirm({ type: "reset", entry: b })}
                          >
                            {t("admin.bans.resetStage")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 确认弹窗 */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !acting && setConfirm(null)}
          />
          <div className="relative w-full max-w-md mx-4 rounded-lg border border-border bg-background shadow-lg p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-md bg-amber-500/10 text-amber-600 shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold">
                  {confirm.type === "unban"
                    ? t("admin.bans.unban")
                    : t("admin.bans.resetStage")}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {confirm.type === "unban"
                    ? t("admin.bans.unbanConfirm")
                    : t("admin.bans.resetConfirm")}
                </p>
                <p className="text-xs font-mono text-muted-foreground mt-2">
                  {confirm.entry.account_label} · {confirm.entry.dim} ·{" "}
                  {maskValue(confirm.entry.dim_value)}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirm(null)}
                disabled={acting}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  confirm.type === "unban"
                    ? handleUnban(confirm.entry)
                    : handleReset(confirm.entry)
                }
                disabled={acting}
              >
                {acting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t("common.confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
