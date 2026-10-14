import { createHmac, timingSafeEqual } from "node:crypto";
import type { RiskGuardConfig } from "./config";

/**
 * 人机验证通行凭证（Cookie）：`<过期时间戳>.<HMAC-SHA256(IP 范围|过期时间戳)>`
 * 绑定访客 IP 范围（见 ipScope），换 IP 或 Cookie 被拷到别处均失效；无服务端状态，多实例通用
 */

export const PASS_COOKIE = "gdueca_rg";

function signingKey(cfg: RiskGuardConfig): string {
  if (cfg.passSecret) return cfg.passSecret;
  // 未单独配置时由 Turnstile 密钥派生，避免直接拿第三方密钥当签名密钥
  return createHmac("sha256", cfg.turnstileSecretKey).update("gdueca-risk-pass-v1").digest("hex");
}

function sign(scope: string, exp: number, cfg: RiskGuardConfig): string {
  return createHmac("sha256", signingKey(cfg)).update(`${scope}|${exp}`).digest("base64url");
}

export function issuePassToken(scope: string, cfg: RiskGuardConfig): { value: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + cfg.passTtlSeconds;
  return { value: `${exp}.${sign(scope, exp, cfg)}`, maxAge: cfg.passTtlSeconds };
}

export function verifyPassToken(token: string | undefined, scope: string, cfg: RiskGuardConfig): boolean {
  if (!token || (!cfg.passSecret && !cfg.turnstileSecretKey)) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isInteger(exp) || exp < Date.now() / 1000) return false;
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(scope, exp, cfg));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
