import { obfuscate } from "@/lib/riskGuard/obfuscate";

/**
 * 全站反调试脚本（CSP 安全，无需 unsafe-eval）
 *
 * 用纯 `debugger` 语句周期性触发：访客打开 DevTools 时每轮都会命中断点，形成「调试即卡住」的
 * debugger 循环，妨碍断点调试与运行时改写；DevTools 未打开时 `debugger` 为空操作，正常访客无感。
 * 不做任何破坏性动作（不清页、不跳转、不上报），仅提高逆向门槛。
 *
 * 之所以不使用 javascript-obfuscator 自带的 debugProtection：其实现依赖 `Function('debugger')`
 * 构造器，会被本站生产 CSP（无 unsafe-eval）拦截。这里改用自己的 `debugger` 语句（eval-free），
 * 再经 strong 档混淆（selfDefending + 字符串 RC4）隐藏，既满足 CSP 又具备防篡改能力。
 */
export const ANTI_DEBUG_SOURCE = `
(function(){
  if (typeof window === "undefined" || !window.setInterval) return;
  var tick = function(){ (function(){ debugger; })(); };
  try { tick(); window.setInterval(tick, 1500); } catch (e) {}
})();
`;

/** 进程内缓存：模块加载时混淆一次 */
let cached: string | null = null;

/** 返回混淆后的全站反调试脚本（可直接内联进 <script nonce>） */
export function antiDebugScript(): string {
  if (cached !== null) return cached;
  cached = obfuscate(ANTI_DEBUG_SOURCE, "strong");
  return cached;
}
