import { createPublicKey, randomBytes, verify, type KeyObject } from "node:crypto";
import type { RiskGuardConfig } from "./config";
import { ipScope, normalizeIp } from "./ip";
import { riskLog } from "./log";
import { hmac, safeEqual } from "./passToken";

/**
 * 风控接口 v2 签名令牌（binaryYuki/riskAPI internal/risktoken）
 *
 * 令牌：base64url(payload JSON) "." base64url(Ed25519 签名)，签名覆盖第一段 ASCII。
 * 浏览器只负责转交；本站用 /.well-known/risk-keys.json 公布的公钥（按 kid）验签，
 * 再自行比对 aud / nonce / IP——这三项接口不替接入方校验。
 */

export interface RiskClaims {
  v: number;
  kid: string;
  ip: string;
  status: string;
  isRisky: boolean;
  isIdc: boolean;
  isProxy: boolean;
  aud: string;
  nonce: string;
  iat: number;
  exp: number;
}

// ---------- nonce：本站签名、绑定 IP 范围、限时，无服务端状态 ----------

/** 足够完成检测与验证，又不至于被囤积；令牌本身另有约 2 分钟有效期 */
const NONCE_TTL_SECONDS = 10 * 60;

/** 格式 `<exp>.<rand>.<sig>`，字符集满足接口要求的 [A-Za-z0-9._~-]、8~128 位 */
export function issueNonce(scope: string, cfg: RiskGuardConfig): string {
  const exp = Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS;
  const rand = randomBytes(12).toString("base64url");
  return `${exp}.${rand}.${hmac("nonce", `${scope}|${exp}|${rand}`, cfg)}`;
}

function verifyNonce(nonce: string, scope: string, cfg: RiskGuardConfig): boolean {
  const [expRaw, rand, sig, ...rest] = nonce.split(".");
  const exp = Number(expRaw);
  if (rest.length > 0 || !rand || !sig || !Number.isInteger(exp) || exp < Date.now() / 1000) return false;
  return safeEqual(sig, hmac("nonce", `${scope}|${exp}|${rand}`, cfg));
}

// ---------- 公钥集：缓存 5 分钟；遇到未知 kid（密钥轮换）时最多每 30 秒强制刷新一次 ----------

const KEYS_TTL_MS = 5 * 60 * 1000;
const KEYS_MIN_REFRESH_MS = 30 * 1000;

let keys = new Map<string, KeyObject>();
let keysFetchedAt = 0;
let inflight: Promise<void> | null = null;

async function refreshKeys(cfg: RiskGuardConfig, traceId: string): Promise<void> {
  try {
    const res = await fetch(cfg.keysUrl, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { keys?: unknown };
    const next = new Map<string, KeyObject>();
    for (const jwk of Array.isArray(body.keys) ? body.keys : []) {
      const k = jwk as Record<string, unknown>;
      if (k.kty !== "OKP" || k.crv !== "Ed25519" || typeof k.kid !== "string" || typeof k.x !== "string") continue;
      try {
        next.set(k.kid, createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: k.x }, format: "jwk" }));
      } catch {
        /* 单个公钥非法时跳过 */
      }
    }
    if (next.size === 0) throw new Error("no usable Ed25519 key");
    keys = next;
  } catch (err) {
    riskLog("WARN", traceId, `获取风控公钥失败（${err instanceof Error ? err.message : "unknown"}），本次按检测失败处理`);
  } finally {
    // 失败也记录时间，避免公钥服务故障时每个请求都去拉取
    keysFetchedAt = Date.now();
  }
}

async function keyFor(kid: string, cfg: RiskGuardConfig, traceId: string): Promise<KeyObject | undefined> {
  const age = Date.now() - keysFetchedAt;
  if (age > KEYS_TTL_MS || (!keys.has(kid) && age > KEYS_MIN_REFRESH_MS)) {
    inflight ??= refreshKeys(cfg, traceId).finally(() => {
      inflight = null;
    });
    await inflight;
  }
  return keys.get(kid);
}

// ---------- 验签 ----------

function parse(token: string): { head: string; sig: Buffer; claims: RiskClaims } | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as RiskClaims;
    const sig = Buffer.from(parts[1], "base64url");
    if (claims?.v !== 1 || typeof claims.kid !== "string" || sig.length !== 64) return null;
    if (typeof claims.isRisky !== "boolean" || typeof claims.isIdc !== "boolean" || typeof claims.isProxy !== "boolean") {
      return null;
    }
    return { head: parts[0], sig, claims };
  } catch {
    return null;
  }
}

/**
 * 校验令牌并返回判定结果；任一项不通过返回失败原因（调用方按「检测失败」处理）
 * @param clientIp 本站看到的访客 IP，与令牌内 IP 按 ipScope 比对（IPv6 按 /64）
 */
export async function verifyRiskToken(
  token: string,
  clientIp: string,
  cfg: RiskGuardConfig,
  traceId: string,
): Promise<{ ok: true; claims: RiskClaims } | { ok: false; reason: string }> {
  const parsed = parse(token);
  if (!parsed) return { ok: false, reason: "malformed" };
  const { head, sig, claims } = parsed;

  const key = await keyFor(claims.kid, cfg, traceId);
  if (!key) return { ok: false, reason: `unknown kid ${claims.kid.slice(0, 32)}` };
  if (!verify(null, Buffer.from(head, "ascii"), key, sig)) return { ok: false, reason: "bad signature" };

  const now = Date.now() / 1000;
  if (!Number.isFinite(claims.exp) || now >= claims.exp) return { ok: false, reason: "expired" };
  if (!cfg.audiences.includes(String(claims.aud).toLowerCase())) return { ok: false, reason: "aud mismatch" };
  if (typeof claims.nonce !== "string" || !verifyNonce(claims.nonce, ipScope(clientIp), cfg)) {
    return { ok: false, reason: "nonce invalid" };
  }
  // 浏览器访问风控接口与访问本站可能走不同出口（如 IPv6 / IPv4），此时无法确认是同一访客
  const tokenIp = typeof claims.ip === "string" ? normalizeIp(claims.ip) : null;
  if (!tokenIp || ipScope(tokenIp) !== ipScope(clientIp)) {
    // 记录令牌内 IP，便于区分「v4/v6 出口不同」与「风控接口拿到的是 CDN 节点 IP」
    return { ok: false, reason: `ip mismatch token_ip=${tokenIp ?? "(无)"}` };
  }
  return { ok: true, claims };
}
