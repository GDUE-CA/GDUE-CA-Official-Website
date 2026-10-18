import { createHash, randomBytes } from "node:crypto";
import type { RiskGuardConfig } from "./config";
import { hmac, safeEqual } from "./passToken";

/**
 * 工作量证明（PoW）
 *
 * 风控结果由浏览器自行查询、无法在服务端验真，因此每次换取通行凭证都要求浏览器
 * 解出 count 道子题：第 i 题找到 nonce，使 SHA-256("<salt>:<i>:<nonce>") 至少有 bits 个前导零位。
 * 总计算量约 count × 2^bits，拆成多道子题是为了让耗时稳定（单题耗时服从几何分布，长尾明显）。
 *
 * 算力门槛对原生代码 / GPU 求解的 bot 意义有限，因此另设最短耗时：题目签发后不足
 * powMinSeconds 秒的提交一律拒绝，每次通过都至少付出这段时间，与求解速度无关。
 *
 * 题目由服务端签名、绑定访客 IP 范围并限时，无服务端状态。
 */

/** 题目有效期：足够完成检测与计算，又不能囤积 */
const CHALLENGE_TTL_SECONDS = 10 * 60;

export interface PowChallenge {
  salt: string;
  /** 签发时间（Unix 秒），用于最短耗时校验 */
  iat: number;
  exp: number;
  /** 每道子题的前导零位数 */
  bits: number;
  /** 子题数 */
  count: number;
  sig: string;
}

type UnsignedChallenge = Omit<PowChallenge, "sig">;

function payload(c: UnsignedChallenge, scope: string): string {
  return `${c.salt}|${c.iat}|${c.exp}|${c.bits}|${c.count}|${scope}`;
}

/** 按总难度与子题数推算每题难度：总计算量保持约 2^powDifficulty */
function puzzleBits(cfg: RiskGuardConfig): number {
  return Math.max(1, cfg.powDifficulty - Math.round(Math.log2(cfg.powPuzzles)));
}

export function issuePowChallenge(scope: string, cfg: RiskGuardConfig): PowChallenge {
  const now = Math.floor(Date.now() / 1000);
  const c: UnsignedChallenge = {
    salt: randomBytes(12).toString("base64url"),
    iat: now,
    exp: now + CHALLENGE_TTL_SECONDS,
    bits: puzzleBits(cfg),
    count: cfg.powPuzzles,
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

function isNonce(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}

export function verifyPow(input: unknown, nonces: unknown, scope: string, cfg: RiskGuardConfig): boolean {
  if (!input || typeof input !== "object") return false;
  const c = input as Record<string, unknown>;
  if (
    typeof c.salt !== "string" ||
    typeof c.sig !== "string" ||
    !Number.isInteger(c.iat) ||
    !Number.isInteger(c.exp) ||
    !Number.isInteger(c.bits) ||
    !Number.isInteger(c.count) ||
    !Array.isArray(nonces) ||
    nonces.length !== c.count ||
    !nonces.every(isNonce)
  ) {
    return false;
  }
  const challenge: UnsignedChallenge = {
    salt: c.salt,
    iat: c.iat as number,
    exp: c.exp as number,
    bits: c.bits as number,
    count: c.count as number,
  };
  const now = Date.now() / 1000;
  if (challenge.exp < now) return false;
  // 最短耗时：签发后不足 powMinSeconds 秒的提交拒绝（iat 已签名，无法前移）
  if (now - challenge.iat < cfg.powMinSeconds) return false;
  // 难度与子题数以服务端当前配置为下限，防止拿旧的低难度题目
  if (challenge.bits < puzzleBits(cfg) || challenge.count < cfg.powPuzzles) return false;
  if (!safeEqual(c.sig, hmac("pow", payload(challenge, scope), cfg))) return false;
  return nonces.every(
    (nonce, i) =>
      leadingZeroBits(createHash("sha256").update(`${challenge.salt}:${i}:${nonce}`).digest()) >= challenge.bits,
  );
}
