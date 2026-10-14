import type { RiskGuardConfig } from "./config";
import { riskLog } from "./log";

/** Cloudflare Turnstile 服务端校验 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** 与挑战页渲染组件时的 action 一致，防止其他页面签发的令牌被挪用 */
export const TURNSTILE_ACTION = "page-gate";

interface SiteverifyResult {
  success: boolean;
  action?: string;
  "error-codes"?: string[];
}

export async function verifyTurnstile(
  token: string,
  ip: string,
  cfg: RiskGuardConfig,
  traceId: string,
): Promise<boolean> {
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: cfg.turnstileSecretKey, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const data = (await res.json()) as SiteverifyResult;
    if (!data.success) {
      riskLog("INFO", traceId, `Turnstile 校验未通过：${(data["error-codes"] ?? []).join(",") || "unknown"}`);
      return false;
    }
    // 测试密钥不返回 action，仅在有值时比对
    if (data.action && data.action !== TURNSTILE_ACTION) {
      riskLog("WARN", traceId, `Turnstile action 不匹配：${data.action}`);
      return false;
    }
    return true;
  } catch (err) {
    riskLog("ERROR", traceId, `Turnstile 校验请求失败：${err instanceof Error ? err.name : "unknown"}`);
    return false;
  }
}
