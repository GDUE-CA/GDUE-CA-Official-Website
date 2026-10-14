import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { RiskGuardConfig } from "./config";
import { riskLog } from "./log";

/**
 * 通行凭证（Cookie）：`<过期时间戳>.<HMAC-SHA256(IP 范围|过期时间戳)>`
 * 绑定访客 IP 范围（见 ipScope），换 IP 或 Cookie 被拷到别处均失效；无服务端状态，多实例通用
 */

export const PASS_COOKIE = "gdueca_rg";

let ephemeralKey: string | null = null;

/** 签名密钥：RISK_PASS_SECRET > 由 Turnstile 密钥派生 > 进程内随机（重启 / 多实例间不通用） */
export function signingKey(cfg: RiskGuardConfig): string {
  if (cfg.passSecret) return cfg.passSecret;
  if (cfg.turnstileSecretKey) {
    // 避免直接拿第三方密钥当签名密钥
    return createHmac("sha256", cfg.turnstileSecretKey).update("gdueca-risk-pass-v1").digest("hex");
  }
  if (!ephemeralKey) {
    ephemeralKey = randomBytes(32).toString("hex");
    riskLog("WARN", "-", "未配置 RISK_PASS_SECRET / TURNSTILE_SECRET_KEY，使用进程内随机密钥：重启后访客需重新检测，多实例部署必须配置");
  }
  return ephemeralKey;
}

/** 带用途前缀的 HMAC，防止通行凭证与 PoW 题目签名互相冒用 */
export function hmac(purpose: string, data: string, cfg: RiskGuardConfig): string {
  return createHmac("sha256", signingKey(cfg)).update(`${purpose}|${data}`).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function issuePassToken(scope: string, cfg: RiskGuardConfig): { value: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + cfg.passTtlSeconds;
  return { value: `${exp}.${hmac("pass", `${scope}|${exp}`, cfg)}`, maxAge: cfg.passTtlSeconds };
}

export function verifyPassToken(token: string | undefined, scope: string, cfg: RiskGuardConfig): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isInteger(exp) || exp < Date.now() / 1000) return false;
  return safeEqual(token.slice(dot + 1), hmac("pass", `${scope}|${exp}`, cfg));
}
