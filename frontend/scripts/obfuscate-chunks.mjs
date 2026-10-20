#!/usr/bin/env node
/**
 * 站点业务 chunk 后置混淆（opt-in，默认不执行）
 *
 * 对 `next build` 产出的浏览器 chunk 做「保守档」混淆（标识符改名 + 字符串 RC4），
 * 提高业务代码逆向门槛。框架 / 运行时 chunk（webpack、framework、react、polyfills 等）
 * 一律跳过，避免破坏打包器运行时与 hydration。
 *
 * 风险提示：Next 产物已压缩，二次混淆存在破坏可能。本脚本：
 *   - 仅在环境变量 OBFUSCATE_CHUNKS=1 时执行，默认 no-op（不接入自动部署）；
 *   - 逐文件 try/catch，单个文件混淆失败则保留原文件（fail-open），不致整站崩溃；
 *   - 启用前务必在预发环境跑通并做浏览器冒烟测试（首页 / 登录 / 后台若干页）。
 *
 * 用法：OBFUSCATE_CHUNKS=1 node scripts/obfuscate-chunks.mjs
 * 配置：与 lib/riskGuard/obfuscate.ts 的 "lite" 档保持一致。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JavaScriptObfuscator from "javascript-obfuscator";

if (process.env.OBFUSCATE_CHUNKS !== "1") {
  console.log("[obfuscate-chunks] 跳过（设置 OBFUSCATE_CHUNKS=1 启用）");
  process.exit(0);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 可能存在的 chunk 目录：常规构建与 standalone 产物 */
const CHUNK_DIRS = [
  path.join(ROOT, ".next", "static", "chunks"),
  path.join(ROOT, ".next", "standalone", ".next", "static", "chunks"),
];

/** 框架 / 运行时 chunk：跳过，不可混淆（破坏运行时或 hydration） */
const SKIP = /(^|[/\\])(webpack|framework|main|main-app|polyfills|react|react-dom|next)[-.]/;

/** "lite" 档：仅改名 + 字符串 RC4，不做控制流平坦化 / 死代码 / selfDefending（见 obfuscate.ts） */
const LITE = {
  target: "browser",
  compact: true,
  stringArray: true,
  stringArrayEncoding: ["rc4"],
  stringArrayThreshold: 1,
  stringArrayWrappersType: "function",
  stringArrayWrappersCount: 1,
  identifierNamesGenerator: "mangled",
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  renameGlobals: false,
};

let done = 0;
let skipped = 0;
let failed = 0;

for (const dir of CHUNK_DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const entry of fs.readdirSync(dir, { recursive: true })) {
    const rel = String(entry);
    if (!rel.endsWith(".js")) continue;
    if (SKIP.test(rel)) {
      skipped++;
      continue;
    }
    const file = path.join(dir, rel);
    let code;
    try {
      code = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    try {
      const out = JavaScriptObfuscator.obfuscate(code, LITE).getObfuscatedCode();
      fs.writeFileSync(file, out, "utf8");
      done++;
    } catch (err) {
      // 单文件失败保留原文件，不影响整体
      failed++;
      console.warn(`[obfuscate-chunks] 跳过（混淆失败）: ${rel} — ${err?.message ?? err}`);
    }
  }
}

console.log(`[obfuscate-chunks] 完成：混淆 ${done}，跳过框架 ${skipped}，失败保留 ${failed}`);
