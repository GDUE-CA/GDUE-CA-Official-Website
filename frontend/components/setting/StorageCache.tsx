"use client";

/**
 * StorageCache —— 存储与缓存（P0，2026-10 新增）
 *
 * 边界：本页只清理浏览器侧本地内容，云端账号数据完全不动。
 * 1. 清除网页缓存：删除 Cache Storage + 注销 Service Worker，刷新生效；不影响登录态
 * 2. 清除本站 Cookie：后端销毁该用户【全部】会话（含当前，写审计）+
 *    后端响应清除 HttpOnly 登录 Cookie + 前端尽力清除可读 Cookie/本地存储 → 强制跳登录页
 * 3. 缓存占用：前端估算（Cache Storage + localStorage + StorageManager），仅供参考
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Cookie,
  HardDrive,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Database,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { revokeAllSessions } from "@/lib/api/account";

interface UsageBreakdown {
  cacheBytes: number;
  localStorageBytes: number;
  estimatedTotal: number | null;
  quota: number | null;
  cacheNames: string[];
}

/** 字节大小格式化（1024 进制，保留 1 位小数） */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

/** 估算本站本地资源占用（仅前端估算，仅供参考） */
async function estimateUsage(): Promise<UsageBreakdown> {
  let cacheBytes = 0;
  const cacheNames: string[] = [];
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      cacheNames.push(...keys);
      for (const name of keys) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        for (const req of requests) {
          try {
            const res = await cache.match(req);
            if (!res) continue;
            const len = res.headers.get("content-length");
            if (len && /^\d+$/.test(len)) {
              cacheBytes += Number(len);
            } else {
              // 无 Content-Length 时读 blob 取大小（不会消费原响应，match 返回副本）
              cacheBytes += (await res.blob()).size;
            }
          } catch {
            /* 单条统计失败忽略 */
          }
        }
      }
    }
  } catch {
    /* Cache API 不可用时按 0 处理 */
  }

  let localStorageBytes = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      // UTF-16 存储近似 2 字节/字符
      localStorageBytes += (key.length + (window.localStorage.getItem(key)?.length ?? 0)) * 2;
    }
  } catch {
    /* localStorage 不可用时按 0 处理 */
  }

  let estimatedTotal: number | null = cacheBytes + localStorageBytes;
  let quota: number | null = null;
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      // StorageManager 统计范围更广（含 IndexedDB 等），优先采用其 usage 作为总量参考
      if (typeof est.usage === "number") estimatedTotal = est.usage;
      if (typeof est.quota === "number") quota = est.quota;
    }
  } catch {
    /* 忽略 */
  }

  return { cacheBytes, localStorageBytes, estimatedTotal, quota, cacheNames };
}

/** 尽力删除本站全部【可读】Cookie（HttpOnly 由后端响应清除，JS 不可见） */
function clearReadableCookies() {
  const host = window.location.hostname;
  const hosts = [host, `.${host}`];
  const paths = ["/", window.location.pathname || "/"];
  const names: string[] = [];
  document.cookie.split(";").forEach((part) => {
    const name = part.split("=")[0]?.trim();
    if (name) names.push(name);
  });
  for (const name of names) {
    for (const h of hosts) {
      for (const p of paths) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${p}; domain=${h}`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${p}`;
      }
    }
  }
}

export function StorageCache() {
  const { t } = useI18n();
  const router = useRouter();
  const lp = useLocalizedPath();

  const [usage, setUsage] = useState<UsageBreakdown | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [confirmCache, setConfirmCache] = useState(false);
  const [confirmCookies, setConfirmCookies] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      setUsage(await estimateUsage());
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  /** 清除网页缓存：Cache Storage + Service Worker；随后强制刷新（不退出登录） */
  async function handleClearCache() {
    setClearing(true);
    setError(null);
    try {
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      // 强制刷新页面（绕过 HTTP 缓存重新拉取静态资源）
      window.location.replace(`${window.location.pathname}?cache_cleared=1`);
    } catch {
      setError(t("setting.storage.clearCacheFailed"));
      setClearing(false);
      setConfirmCache(false);
    }
  }

  /** 清除本站 Cookie：销毁全部后端会话 → 清本地 → 跳登录页 */
  async function handleClearCookies() {
    setClearing(true);
    setError(null);
    try {
      await revokeAllSessions();
    } catch {
      // 即使后端调用失败也继续本地清理（会话可能本就失效）
    }
    try {
      clearReadableCookies();
      try {
        window.localStorage.clear();
      } catch {
        /* 忽略 */
      }
      router.replace(lp("/login"));
    } catch {
      setError(t("setting.storage.clearCookiesFailed"));
      setClearing(false);
      setConfirmCookies(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 缓存占用估算 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardDrive className="h-4 w-4" />
            {t("setting.storage.usageTitle")}
          </CardTitle>
          <CardDescription>{t("setting.storage.usageHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingStats || !usage ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("setting.storage.estimating")}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-semibold">
                    {usage.estimatedTotal !== null
                      ? formatBytes(usage.estimatedTotal)
                      : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t("setting.storage.totalEstimate")}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshStats()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("setting.storage.refresh")}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Database className="h-3.5 w-3.5" />
                    {t("setting.storage.cacheStorage")}
                  </div>
                  <div className="font-medium mt-1">{formatBytes(usage.cacheBytes)}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {t("setting.storage.cacheEntries", {
                      count: usage.cacheNames.length,
                    })}
                  </div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <HardDrive className="h-3.5 w-3.5" />
                    {t("setting.storage.localStorage")}
                  </div>
                  <div className="font-medium mt-1">{formatBytes(usage.localStorageBytes)}</div>
                </div>
              </div>
              {usage.quota !== null && (
                <p className="text-xs text-muted-foreground">
                  {t("setting.storage.quotaHint", {
                    used:
                      usage.estimatedTotal !== null
                        ? formatBytes(usage.estimatedTotal)
                        : "—",
                    total: formatBytes(usage.quota),
                  })}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 清除网页缓存 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setting.storage.clearCacheTitle")}</CardTitle>
          <CardDescription>{t("setting.storage.clearCacheDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => setConfirmCache(true)}>
            <Trash2 className="h-4 w-4" />
            {t("setting.storage.clearCache")}
          </Button>
        </CardContent>
      </Card>

      {/* 清除本站 Cookie */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cookie className="h-4 w-4" />
            {t("setting.storage.clearCookiesTitle")}
          </CardTitle>
          <CardDescription>{t("setting.storage.clearCookiesDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" onClick={() => setConfirmCookies(true)}>
            <Cookie className="h-4 w-4" />
            {t("setting.storage.clearCookies")}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* 清除网页缓存确认 */}
      <Dialog open={confirmCache} onOpenChange={(open) => !clearing && setConfirmCache(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("setting.storage.clearCacheTitle")}</DialogTitle>
            <DialogDescription>{t("setting.storage.clearCacheConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCache(false)} disabled={clearing}>
              {t("setting.cancel")}
            </Button>
            <Button onClick={() => void handleClearCache()} disabled={clearing}>
              {clearing && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("setting.storage.clearNow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 清除 Cookie 强警告确认 */}
      <Dialog open={confirmCookies} onOpenChange={(open) => !clearing && setConfirmCookies(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              {t("setting.storage.clearCookiesTitle")}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>{t("setting.storage.clearCookiesWarn")}</p>
              <p className="font-medium text-foreground">
                {t("setting.storage.clearCookiesWarn2")}
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCookies(false)} disabled={clearing}>
              {t("setting.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void handleClearCookies()} disabled={clearing}>
              {clearing && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("setting.storage.confirmLogout")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
