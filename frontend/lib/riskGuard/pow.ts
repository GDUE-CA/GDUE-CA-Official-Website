import { createHash, randomBytes } from "node:crypto";
import type { RiskGuardConfig } from "./config";
import { hmac, safeEqual } from "./passToken";

/**
 * 工作量证明（PoW）
 *
 * 风控结果由浏览器自行查询、无法在服务端验真，因此每次换取通行凭证都要求浏览器
 * 找到 nonce，使 SHA-256("<salt>:<nonce>") 至少有 bits 个前导零位：
 * 正常访客无感（约 1 秒、每个有效期一次），批量伪造则需要为每个 IP 付出同等算力。
 *
 * 题目由服务端签名、绑定访客 IP 范围并限时，无服务端状态。
 */

/** 题目有效期：足够完成检测与计算，又不能囤积 */
const CHALLENGE_TTL_SECONDS = 10 * 60;

export interface PowChallenge {
  salt: string;
  exp: number;
  bits: number;
  sig: string;
}

function payload(c: Omit<PowChallenge, "sig">, scope: string): string {
  return `${c.salt}|${c.exp}|${c.bits}|${scope}`;
}

export function issuePowChallenge(scope: string, cfg: RiskGuardConfig): PowChallenge {
  const c = {
    salt: randomBytes(12).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS,
    bits: cfg.powDifficulty,
  };
  return { ...c, sig: hmac("pow", payload(c, scope), cfg) };
}

function leadingZeroBits(digest: Buffer): number {
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

export function verifyPow(input: unknown, nonce: unknown, scope: string, cfg: RiskGuardConfig): boolean {
  if (!input || typeof input !== "object") return false;
  const c = input as Record<string, unknown>;
  if (
    typeof c.salt !== "string" ||
    typeof c.sig !== "string" ||
    !Number.isInteger(c.exp) ||
    !Number.isInteger(c.bits) ||
    typeof nonce !== "number" ||
    !Number.isSafeInteger(nonce) ||
    nonce < 0
  ) {
    return false;
  }
  const challenge = { salt: c.salt, exp: c.exp as number, bits: c.bits as number };
  if (challenge.exp < Date.now() / 1000) return false;
  // 难度以服务端当前配置为下限，防止拿旧的低难度题目
  if (challenge.bits < cfg.powDifficulty) return false;
  if (!safeEqual(c.sig, hmac("pow", payload(challenge, scope), cfg))) return false;
  const digest = createHash("sha256").update(`${challenge.salt}:${nonce}`).digest();
  return leadingZeroBits(digest) >= challenge.bits;
}
