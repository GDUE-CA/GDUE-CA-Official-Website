import type { RiskGuardConfig } from "./config";
import { riskLog } from "./log";

/**
 * 外部 IP 风控查询（GET {RISK_API_URL}，{ip} 替换为访客 IP）
 *
 * 该接口有频率限制（429 + retry_after）与 WAF，因此：
 * - 结果按 IP 缓存，同一 IP 的并发查询合并为一次
 * - 收到 429 / 403 / 5xx 后进入冷却期，期间不再请求
 * - 查询失败一律放行（fail-open）：风控服务不可用不能拖垮整站
 */

export interface RiskVerdict {
  isRisky: boolean;
  isIdc: boolean;
  isProxy: boolean;
  /** 接口返回的说明，如 "IP is in risky list: X4BNet-datacenter" */
  message: string;
}

interface CacheEntry {
  verdict: RiskVerdict;
  expiresAt: number;
}

const MAX_CACHE_ENTRIES = 10_000;
/** 查询失败时的短暂负缓存，避免对同一 IP 反复重试 */
const FAILURE_CACHE_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 30_000;

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<RiskVerdict | null>>();
const failures = new Map<string, number>();
let cooldownUntil = 0;

function cacheSet(ip: string, verdict: RiskVerdict, ttlMs: number): void {
  if (ttlMs <= 0) return;
  // Map 按插入顺序迭代：超出上限时淘汰最早写入的条目
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(ip, { verdict, expiresAt: Date.now() + ttlMs });
}

function parseVerdict(body: unknown): RiskVerdict | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.isRisky !== "boolean" || typeof b.isIdc !== "boolean" || typeof b.isProxy !== "boolean") {
    return null;
  }
  return {
    isRisky: b.isRisky,
    isIdc: b.isIdc,
    isProxy: b.isProxy,
    message: typeof b.message === "string" ? b.message.slice(0, 200) : "",
  };
}

async function fetchVerdict(ip: string, cfg: RiskGuardConfig, traceId: string): Promise<RiskVerdict | null> {
  const url = cfg.apiUrl.replace("{ip}", encodeURIComponent(ip));
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(cfg.apiTimeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      let retryAfterSec = Number(res.headers.get("retry-after"));
      if (res.status === 429) {
        const body = (await res.json().catch(() => null)) as { retry_after?: unknown } | null;
        if (typeof body?.retry_after === "number") retryAfterSec = body.retry_after;
      }
      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        const ms = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : DEFAULT_COOLDOWN_MS;
        cooldownUntil = Date.now() + ms;
        riskLog("WARN", traceId, `风控接口返回 ${res.status}，暂停查询 ${Math.round(ms / 1000)}s（期间放行）`);
      } else {
        riskLog("WARN", traceId, `风控接口返回 ${res.status}，本次放行`);
      }
      return null;
    }
    const verdict = parseVerdict(await res.json());
    if (!verdict) riskLog("WARN", traceId, "风控接口响应格式无法识别，本次放行");
    return verdict;
  } catch (err) {
    const reason = err instanceof Error ? err.name : "unknown";
    riskLog("WARN", traceId, `风控接口请求失败（${reason}），本次放行`);
    return null;
  }
}

/** 查询 IP 风险；接口不可用时返回 null（调用方应放行） */
export async function lookupRisk(ip: string, cfg: RiskGuardConfig, traceId: string): Promise<RiskVerdict | null> {
  const now = Date.now();
  const hit = cache.get(ip);
  if (hit && hit.expiresAt > now) return hit.verdict;
  if (hit) cache.delete(ip);

  if (now < cooldownUntil) return null;
  const failedAt = failures.get(ip);
  if (failedAt && now - failedAt < FAILURE_CACHE_MS) return null;

  const pending = inflight.get(ip);
  if (pending) return pending;

  const task = fetchVerdict(ip, cfg, traceId)
    .then((verdict) => {
      if (verdict) {
        failures.delete(ip);
        cacheSet(ip, verdict, cfg.cacheTtlSeconds * 1000);
      } else {
        if (failures.size >= MAX_CACHE_ENTRIES) failures.clear();
        failures.set(ip, Date.now());
      }
      return verdict;
    })
    .finally(() => inflight.delete(ip));
  inflight.set(ip, task);
  return task;
}
