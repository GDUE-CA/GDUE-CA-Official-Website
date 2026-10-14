/**
 * 与后端 / Nginx 一致的单行日志格式：时间 级别 [trace=…] 来源 | 内容
 */
type Level = "INFO" | "WARN" | "ERROR";

export function riskLog(level: Level, traceId: string, message: string): void {
  const line = `${new Date().toISOString()} ${level.padEnd(5)} [trace=${traceId || "-"}] risk_guard | ${message}`;
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.info(line);
}
