/**
 * 通用工具函数
 * cn: 合并 className 并处理 Tailwind CSS 类名冲突
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * UTC ISO 字符串 → datetime-local 输入值（浏览器本地时区）
 * 后端全量存储 UTC（规范 §10）；回填表单时必须先转本地时间，
 * 否则把 UTC 值当本地时间展示且再次提交会产生二次偏移。
 */
export function utcToLocalInput(utcIso: string): string {
  const d = new Date(utcIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * datetime-local 输入值（浏览器本地时区）→ UTC ISO 字符串
 * 空字符串 / 非法日期返回空字符串（调用方按"清空"语义处理）
 */
export function localInputToUtcIso(localInput: string): string {
  if (!localInput) return "";
  const d = new Date(localInput);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}
