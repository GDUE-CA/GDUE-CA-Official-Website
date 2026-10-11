"use client";

/**
 * IP 规则管理（黑白名单共用）
 *
 * - 列表：搜索 / 分页 / 状态徽章（永久 vs 临时倒计时）/ 删除
 * - 创建：IP/CIDR + 标签 + 原因 + 到期时间（可空=永久）+ 绑定账号（仅白名单）
 * - type=blacklist：展示违规原因，到期前显示剩余时间
 * - type=whitelist：展示绑定账号（opt-in 自动登录）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Clock,
  UserCircle,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createIpRule, deleteIpRule, fetchIpRules } from "@/lib/api/security";
import { fetchProfile, listUsers } from "@/lib/api/auth";
import type { AdminUser, IpRule, IpRuleType } from "@/types/api";

export function IpRulesManager({ type }: { type: IpRuleType }) {
  const { t } = useI18n();
  const isBlack = type === "blacklist";

  const [rules, setRules] = useState<IpRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 搜索（300ms 防抖）
  const [q, setQ] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 创建表单
  const [rule, setRule] = useState("");
  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState(""); // datetime-local 字符串
  const [boundUserId, setBoundUserId] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(
    async (query: string) => {
      setLoading(true);
      setError(null);
      try {
        const list = await fetchIpRules({ type, q: query || undefined });
        setRules(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    },
    [type]
  );

  // 初始化：加载用户列表（白名单绑定用） + 当前账号权限
  useEffect(() => {
    fetchProfile()
      .then((me) => setCanManage(me.role === "super_admin"))
      .catch(() => {});
    if (!isBlack) {
      listUsers()
        .then((list) => setUsers(list))
        .catch(() => {});
    }
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 搜索防抖
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load(q);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, load]);

  async function handleCreate() {
    setFormError(null);
    if (!rule.trim()) {
      setFormError(t("admin.security.errRuleRequired"));
      return;
    }
    setCreating(true);
    try {
      await createIpRule({
        type,
        rule: rule.trim(),
        label: label.trim() || undefined,
        reason: reason.trim() || undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        bound_user_id:
          !isBlack && boundUserId ? Number(boundUserId) : undefined,
      });
      setRule("");
      setLabel("");
      setReason("");
      setExpiresAt("");
      setBoundUserId("");
      await load(q);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("admin.security.deleteConfirm"))) return;
    try {
      await deleteIpRule(id);
      await load(q);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  // 倒计时刷新（每秒触发重渲染，由 expireBadge 计算剩余时间）
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // 分页
  const total = rules.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pagedRules = rules.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {isBlack ? (
          <ShieldAlert className="h-6 w-6 text-destructive" />
        ) : (
          <ShieldCheck className="h-6 w-6 text-emerald-600" />
        )}
        <h1 className="text-2xl font-bold">
          {isBlack ? t("admin.security.blacklistTitle") : t("admin.security.whitelistTitle")}
        </h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-3">
        {isBlack ? t("admin.security.blacklistDesc") : t("admin.security.whitelistDesc")}
      </p>

      {/* 创建表单 */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {isBlack ? t("admin.security.addBlacklist") : t("admin.security.addWhitelist")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rule">{t("admin.security.colRule")}</Label>
                <Input
                  id="rule"
                  value={rule}
                  onChange={(e) => setRule(e.target.value)}
                  placeholder={t("admin.security.rulePlaceholder")}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="label">{t("admin.security.colLabel")}</Label>
                <Input
                  id="label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={t("admin.security.labelPlaceholder")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">
                {isBlack ? t("admin.security.colReason") : t("admin.security.colTrustReason")}
              </Label>
              <Textarea
                id="reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  isBlack
                    ? t("admin.security.reasonPlaceholder")
                    : t("admin.security.trustReasonPlaceholder")
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expiresAt">{t("admin.security.colExpiresAt")}</Label>
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("admin.security.expiresHint")}
                </p>
              </div>
              {!isBlack && (
                <div className="space-y-2">
                  <Label htmlFor="boundUser">{t("admin.security.colBoundUser")}</Label>
                  <select
                    id="boundUser"
                    value={boundUserId}
                    onChange={(e) => setBoundUserId(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">{t("admin.security.boundUserNone")}</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username} ({u.real_name})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.security.boundUserHint")}
                  </p>
                </div>
              )}
            </div>
            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {formError}
              </p>
            )}
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {t("admin.security.addBtn")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 列表 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">
              {isBlack ? t("admin.security.blacklistList") : t("admin.security.whitelistList")}
            </CardTitle>
            <Input
              placeholder={t("admin.security.searchPlaceholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-8 text-center">{error}</p>
          ) : pagedRules.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t("admin.security.empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {pagedRules.map((r) => (
                <RuleRow
                  key={r.id}
                  rule={r}
                  isBlack={isBlack}
                  canManage={canManage}
                  users={users}
                  onDelete={() => handleDelete(r.id)}
                  t={t}
                />
              ))}
            </div>
          )}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {t("admin.security.pageInfo")
                  .replace("{page}", String(page))
                  .replace("{total}", String(totalPages))}
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("admin.security.prev")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t("admin.security.next")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RuleRow({
  rule,
  isBlack,
  canManage,
  users,
  onDelete,
  t,
}: {
  rule: IpRule;
  isBlack: boolean;
  canManage: boolean;
  users: AdminUser[];
  onDelete: () => void;
  t: (k: string) => string;
}) {
  const now = Date.now();
  const exp = rule.expires_at ? new Date(rule.expires_at).getTime() : null;
  const expired = exp !== null && now >= exp;
  const remainSec = exp !== null ? Math.max(0, Math.floor((exp - now) / 1000)) : null;

  const boundUser = rule.bound_user_id
    ? users.find((u) => u.id === rule.bound_user_id)
    : null;

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold">{rule.rule}</span>
          {rule.label && (
            <Badge variant="outline" className="text-xs">
              {rule.label}
            </Badge>
          )}
          {expired ? (
            <Badge variant="secondary" className="text-xs">
              {t("admin.security.statusExpired")}
            </Badge>
          ) : rule.expires_at ? (
            <Badge variant="secondary" className="text-xs flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {remainSec !== null && remainSec > 0
                ? fmtRemain(remainSec)
                : t("admin.security.statusPermanent")}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              {t("admin.security.statusPermanent")}
            </Badge>
          )}
        </div>
        {(rule.reason || boundUser) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {rule.reason && <div>{rule.reason}</div>}
            {boundUser && (
              <div className="flex items-center gap-1">
                <UserCircle className="h-3 w-3" />
                {t("admin.security.boundTo")}: {boundUser.username}
              </div>
            )}
          </div>
        )}
      </div>
      {canManage && (
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          aria-label={t("admin.security.deleteBtn")}
          className="shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function fmtRemain(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
