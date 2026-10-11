"use client";

/**
 * FormattedEventTime —— 活动业务时间展示
 *
 * 业务规则（保留原有）：
 *   主显示固定为北京时间 Asia/Shanghai（UTC+8 业务基准）；
 *   若浏览器探测到的时区不是 Asia/Shanghai，追加展示浏览器本地对照时间；
 *   时区偏移由 Intl API 计算，禁止硬编码偏移数字。
 *
 * 不再依赖全局时区 context，时区获取用纯 hook：
 *   - browserTz 来自 useEffectiveTimezone().browserTz
 *   - Asia/Shanghai 是业务常量
 */
import { useI18n } from "@/i18n/provider";
import { useEffectiveTimezone } from "@/lib/hooks/useEffectiveTimezone";

/** 业务基准时区：北京时间 */
const EVENT_BASE_TIMEZONE = "Asia/Shanghai";

const FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

function formatIn(utcIso: string, timeZone: string): string | null {
  try {
    const date = new Date(utcIso);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("sv-SE", { ...FORMAT, timeZone }).format(date);
  } catch {
    return null;
  }
}

export function FormattedEventTime({
  utcIso,
  showZone = false,
  className,
}: {
  utcIso: string;
  showZone?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const { browserTz, ready } = useEffectiveTimezone();

  if (!ready) {
    return <span className={className}>—</span>;
  }

  const base = formatIn(utcIso, EVENT_BASE_TIMEZONE);
  if (!base) {
    return <span className={className}>{utcIso}</span>;
  }

  const showLocal = browserTz && browserTz !== EVENT_BASE_TIMEZONE;
  const local = showLocal ? formatIn(utcIso, browserTz) : null;

  return (
    <span className={className}>
      <time dateTime={utcIso}>
        {base}
        {showZone && (
          <span className="ml-1 text-xs text-muted-foreground">
            ({t("common.beijingTime")})
          </span>
        )}
      </time>
      {local && (
        <span className="ml-2 text-xs text-muted-foreground">
          {local}
          {showZone && (
            <span className="ml-1">({t("common.localTime")})</span>
          )}
        </span>
      )}
    </span>
  );
}
