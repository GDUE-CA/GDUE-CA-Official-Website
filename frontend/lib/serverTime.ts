/**
 * 后端权威系统计时器（服务端时间偏移量单例）
 *
 * 规范（docs/SPEC.md §9）：
 * - 后端所有 API 固定返回 X-Server-Utc-Time Header
 * - 前端维护「服务端时间偏移量」：前端时钟 = 服务器基准时间 + 本地流逝时间
 * - 永远不使用本地 new Date() 做业务时间（UI 展示也优先走 serverNow）
 * - 自动同步时机：每次 API 请求 / 页面重新可见（visibilitychange）/ 每 30 秒自动校准
 *
 * 本模块不依赖任何网络层：由 lib/api/client.ts 在每次响应后调用 syncServerTime，
 * 并通过 registerCalibrator 注册轻量校准请求（GET /health），避免循环依赖。
 */

/** 自动校准间隔（规范：每 30 秒；仅页面可见时发起） */
export const SERVER_TIME_CALIBRATION_INTERVAL_MS = 30_000;

/** 服务端时间 - 本地时钟 的偏移量（毫秒）；0 = 未校准（视为一致） */
let offsetMs = 0;

type Listener = () => void;
const listeners = new Set<Listener>();

type Calibrator = () => Promise<unknown>;
let calibrator: Calibrator | null = null;
let autoCalibrationStarted = false;

/** 注册轻量校准请求（由网络层注入，避免循环依赖） */
export function registerCalibrator(fn: Calibrator) {
  calibrator = fn;
}

/** 解析 X-Server-Utc-Time 响应头并更新偏移量；无效输入静默忽略 */
export function syncServerTime(headerValue: string | null | undefined) {
  if (!headerValue) return;
  const serverMs = Date.parse(headerValue);
  if (Number.isNaN(serverMs)) return;
  offsetMs = serverMs - Date.now();
  for (const fn of listeners) fn();
  ensureAutoCalibration();
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

/** 启动自动校准：30 秒间隔（仅页面可见时）+ visibilitychange 回到前台时 */
function ensureAutoCalibration() {
  if (autoCalibrationStarted || typeof window === "undefined") return;
  autoCalibrationStarted = true;
  const calibrate = () => {
    calibrator?.().catch(() => {
      /* 网络失败静默：下一次 API 请求 / 校准周期会再试 */
    });
  };
  window.setInterval(() => {
    if (document.visibilityState === "visible") calibrate();
  }, SERVER_TIME_CALIBRATION_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") calibrate();
  });
}
