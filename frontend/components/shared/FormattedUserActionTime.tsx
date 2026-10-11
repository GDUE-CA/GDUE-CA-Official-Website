"use client";

/**
 * FormattedUserActionTime —— 用户行为时间展示
 *
 * 适用：报名提交、Bug 反馈、操作日志等。
 * 时区来源：useEffectiveTimezone() 三级优先级计算出的最终生效时区
 *   （用户手动指定 IANA → 浏览器探测 → 系统时区 → Asia/Shanghai）
 * 优先展示绝对时间（YYYY-MM-DD HH:mm），title tooltip 显示相对时间。
 *
 * 接收的 utcIso 必须是后端输出的带大写 Z 的 UTC ISO-8601 字符串。
 */
import { useEffectiveTimezone } from "@/lib/hooks/useEffectiveTimezone";

const FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

function relativeLabel(date: Date, now: Date): string {
  const diffSec = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  try {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (abs < 60) return rtf.format(Math.round(diffSec), "second");
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
    if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
    return rtf.format(Math.round(diffSec / (86400 * 365)), "year");
  } catch {
    return "";
  }
}

export function FormattedUserActionTime({
  utcIso,
  className,
}: {
  utcIso: string;
  className?: string;
}) {
  const { tz, ready } = useEffectiveTimezone();

  if (!ready) {
    return <span className={className}>—</span>;
  }

  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return <span className={className}>{utcIso}</span>;
  }

  let formatted: string;
  try {
    formatted = new Intl.DateTimeFormat("sv-SE", {
      ...FORMAT,
      timeZone: tz,
    }).format(date);
  } catch {
    return <span className={className}>{utcIso}</span>;
  }

  return (
    <time
      dateTime={utcIso}
      title={relativeLabel(date, new Date())}
      className={className}
    >
      {formatted}
    </time>
  );
}
