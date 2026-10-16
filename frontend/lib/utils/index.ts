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

/** 字节单位（1024 进制；下标即换算次数） */
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const BYTE_STEP = 1024;

/**
 * 字节数 → 可读文本（如 "1.2 MB"）
 * 用于附件大小展示；0 / 非法值统一显示 "0 B"。
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${BYTE_UNITS[0]}`;
  let value = bytes;
  let unit = 0;
  while (value >= BYTE_STEP && unit < BYTE_UNITS.length - 1) {
    value /= BYTE_STEP;
    unit += 1;
  }
  // 整数单位保留原值，其余保留 1 位小数并去掉尾随 ".0"
  const text =
    unit === 0
      ? String(Math.round(value))
      : value.toFixed(1).replace(/\.0$/, "");
  return `${text} ${BYTE_UNITS[unit]}`;
}

/**
 * Markdown 正文 → 纯文本摘要
 * 去代码块 / 行内代码 / 图片 / 链接标记 / 标题与列表前缀 / 强调符，压缩空白后按 max 截断。
 * 用于公告列表与首页预览卡片展示摘要（不渲染 Markdown，仅取纯文本）。
 */
export function markdownExcerpt(md: string, max = 96): string {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}[#>\-*+]+[ \t]*/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
