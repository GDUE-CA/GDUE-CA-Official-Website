import JavaScriptObfuscator from "javascript-obfuscator";
import type { ObfuscatorOptions } from "javascript-obfuscator";

/**
 * 前端反逆向混淆器（共用）
 *
 * 本站生产 CSP 为 `script-src 'self' 'nonce-...' 'strict-dynamic'`，不含 `unsafe-eval`。
 * 因此禁用一切依赖 eval / Function 构造器的选项——混淆器自带的 `debugProtection` 正是用
 * `Function('debugger')` 实现，会被 CSP 拦截，故一律不启用；反调试改由 antiDebug.ts 用
 * 纯 `debugger` 语句（无需 eval）提供，再经本混淆器隐藏。
 *
 * 提供两档强度：
 *  - "strong"：检测页脚本、反调试片段等「高价值小体积」代码。控制流平坦化 +
 *    字符串 RC4 加密 + 防篡改自毁（selfDefending，不依赖 eval）。不注入死代码：
 *    检测页处于首访关键路径，死代码让体积 +22%，而反混淆工具能自动剔除，性价比低。
 *    CPU 热点（如 PoW 的 SHA-256）须在源码中用 `// javascript-obfuscator:disable` 排除，
 *    控制流平坦化会让热循环慢数百倍。
 *  - "lite"：站点业务 chunk（已被打包器压缩，体量大）。仅标识符改名 + 字符串 RC4，
 *    不做控制流平坦化 / 死代码 / selfDefending，避免体积翻倍与破坏打包器运行时。
 */
export type ObfuscationProfile = "strong" | "lite";

const BASE: ObfuscatorOptions = {
  target: "browser",
  compact: true,
  // stringArray 的 rc4 解码器不使用 eval，兼容本站无 unsafe-eval 的 CSP
  stringArray: true,
  stringArrayEncoding: ["rc4"],
  stringArrayThreshold: 1,
  stringArrayWrappersType: "function",
  identifierNamesGenerator: "mangled",
  // 关键：不启用 debugProtection（其实现依赖 Function 构造器，违反 CSP）
  debugProtection: false,
  renameGlobals: false,
};

const PROFILES: Record<ObfuscationProfile, ObfuscatorOptions> = {
  strong: {
    ...BASE,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: false,
    stringArrayWrappersCount: 2,
    splitStrings: true,
    splitStringsChunkLength: 8,
    numbersToExpressions: true,
    simplify: true,
    transformObjectKeys: true,
    // 被格式化 / 篡改后自毁，防止「美化后改一行放行」；不依赖 eval
    selfDefending: true,
  },
  lite: {
    ...BASE,
    // 打包器产物已压缩，这里只做改名 + 字符串加密，保证体积与运行时稳定
    controlFlowFlattening: false,
    deadCodeInjection: false,
    stringArrayWrappersCount: 1,
    selfDefending: false,
  },
};

/** 以指定档位混淆任意脚本文本；reserved 中的标识符（正则）保名不改 */
export function obfuscate(code: string, profile: ObfuscationProfile, reserved: string[] = []): string {
  return JavaScriptObfuscator.obfuscate(code, {
    ...PROFILES[profile],
    reservedNames: reserved,
  }).getObfuscatedCode();
}

/**
 * 检测页浏览器脚本混淆
 *
 * 脚本全部逻辑包进具名函数 `__gate(C)`，配置 `C` 以参数传入：原顶层声明
 * （submitToken / runPow / checkFailed 等）成为函数内局部而被改名；仅保留 `__gate` 与 `C`
 * 两个名字，由调用方 `__gate(<配置JSON>)` 注入配置并启动。
 * （若直接混淆裸脚本，顶层声明在混淆器看来是全局，renameGlobals:false 下不会改名。）
 *
 * 返回「混淆后的 __gate 函数声明」文本；调用方需追加 `__gate(<配置JSON>)` 启动，
 * 并整体包一层 IIFE，使 `__gate` 不落到真正的全局作用域。
 */
export function obfuscateClientScript(script: string): string {
  return obfuscate(`function __gate(C){\n${script}\n}`, "strong", ["^C$", "^__gate$"]);
}
