/**
 * 后端权威系统计时器（服务端时间偏移量单例）
 *
 * 规范（docs/SPEC.md §9）：
 * - 以 API 响应的标准 HTTP `Date` 头为服务器基准时间（/api/* 均为 no-store，Date 恒为实时）
 * - 前端维护「服务端时间偏移量」：前端时钟 = 服务器基准时间 + 本地流逝时间
 * - 永远不使用本地 new Date() 做业务时间（UI 展示也优先走 serverNow）
 * - 同步时机：每次 API 响应（不再额外轮询校准接口）
 *
 * 本模块不依赖任何网络层：由 lib/api/client.ts 在每次响应后调用 syncServerTime。
 */

/** `Date` 头只精确到秒且向下取整：补半秒取区间中点，期望误差 ±0.5s */
const DATE_HEADER_ROUNDING_MS = 500;

/** 秒级精度下每次响应算出的偏移会抖动；变化小于该阈值不更新，避免倒计时来回跳 */
const OFFSET_JITTER_TOLERANCE_MS = 1000;

/** 服务端时间 - 本地时钟 的偏移量（毫秒）；未校准前为 0（视为一致） */
let offsetMs = 0;
let calibrated = false;

type Listener = () => void;
const listeners = new Set<Listener>();

/** 解析响应 `Date` 头（RFC 7231 IMF-fixdate）并更新偏移量；无效输入静默忽略 */
export function syncServerTime(headerValue: string | null | undefined) {
  if (!headerValue) return;
  const serverMs = Date.parse(headerValue);
  if (Number.isNaN(serverMs)) return;
  const next = serverMs + DATE_HEADER_ROUNDING_MS - Date.now();
  if (calibrated && Math.abs(next - offsetMs) < OFFSET_JITTER_TOLERANCE_MS) return;
  offsetMs = next;
  calibrated = true;
  for (const fn of listeners) fn();
}

/** 服务器基准下的当前时间（毫秒时间戳） */
export function serverNowMs(): number {
  return Date.now() + offsetMs;
}

/** 服务器基准下的当前时间 */
export function getServerNow(): Date {
  return new Date(serverNowMs());
}

/** 订阅偏移量变化（校准后触发）；返回取消订阅函数 */
export function subscribeServerTime(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
