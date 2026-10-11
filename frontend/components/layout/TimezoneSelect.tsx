"use client";

/**
 * TimezoneSelect —— IANA 时区选择下拉
 *
 * 两种使用模式：
 *   1. 受控模式（推荐）：传入 value + onChange，纯 UI 组件，不做持久化。
 *      前台 /profile 和后台 /admin/settings 都用这种，直接绑定后端字段。
 *   2. 旧版兼容模式：不传 value 时内部维护状态，调用 useEffectiveTimezone。
 *      （仅供 admin/profile 兼容，后续可统一为受控模式）
 *
 * 选项：第一项「自动」+ 全球主要 IANA 时区（按大洲分组）。
 *
 * DST 自动切换：
 *   偏移标签由 Intl.DateTimeFormat 基于「当前时刻」动态计算，
 *   凡是当地有夏令时制度的时区（Europe/London、America/New_York、
 *   Australia/Sydney、Pacific/Auckland 等），冬夏偏移会自动切换，
 *   无需任何硬编码偏移数字。
 */
import { useI18n } from "@/i18n/provider";
import { useEffectiveTimezone } from "@/lib/hooks/useEffectiveTimezone";

/**
 * 全球主要 IANA 时区分组列表
 *
 * 覆盖：所有大洲的主要城市 + 所有 DST 规则代表
 * （北半球 DST / 南半球 DST / 反向 DST / 无 DST / 摩洛哥特殊 DST 等）
 * 列表内顺序即下拉显示顺序。
 */
export const TIMEZONE_GROUPS: { region: string; zones: string[] }[] = [
  {
    region: "Asia",
    zones: [
      "Asia/Shanghai", // 中国标准时间 UTC+8（无 DST）
      "Asia/Hong_Kong",
      "Asia/Macau",
      "Asia/Taipei",
      "Asia/Tokyo", // 日本标准时间 UTC+9（无 DST）
      "Asia/Seoul", // 韩国标准时间 UTC+9（无 DST）
      "Asia/Singapore",
      "Asia/Kuala_Lumpur",
      "Asia/Manila",
      "Asia/Bangkok", // 中南半岛 UTC+7
      "Asia/Hanoi",
      "Asia/Jakarta", // 印尼西部 UTC+7
      "Asia/Kolkata", // 印度 UTC+5:30
      "Asia/Karachi", // 巴基斯坦 UTC+5
      "Asia/Dhaka", // 孟加拉 UTC+6
      "Asia/Dubai", // 海湾标准时间 UTC+4
      "Asia/Tehran", // 伊朗 UTC+3:30 / UTC+4:30（有 DST）
      "Asia/Yekaterinburg", // 俄罗斯叶卡捷琳堡 UTC+5（无 DST）
    ],
  },
  {
    region: "Europe",
    zones: [
      "Europe/London", // GMT/BST UTC+0 / UTC+1（有 DST）
      "Europe/Dublin", // GMT/IST 爱尔兰反向 DST
      "Europe/Lisbon", // WET/WEST UTC+0 / UTC+1（有 DST）
      "Europe/Paris", // CET/CEST UTC+1 / UTC+2（有 DST）
      "Europe/Berlin",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Amsterdam",
      "Europe/Brussels",
      "Europe/Vienna",
      "Europe/Zurich",
      "Europe/Stockholm",
      "Europe/Oslo",
      "Europe/Copenhagen",
      "Europe/Helsinki", // EET/EEST UTC+2 / UTC+3（有 DST）
      "Europe/Warsaw",
      "Europe/Prague",
      "Europe/Budapest",
      "Europe/Athens", // EET/EEST（有 DST）
      "Europe/Istanbul", // TRT UTC+3（无 DST）
      "Europe/Moscow", // MSK UTC+3（无 DST）
      "Europe/Kyiv", // EET/EEST（有 DST）
    ],
  },
  {
    region: "Americas",
    zones: [
      "America/New_York", // EST/EDT UTC-5 / UTC-4（有 DST）
      "America/Toronto",
      "America/Chicago", // CST/CDT UTC-6 / UTC-5（有 DST）
      "America/Denver", // MST/MDT UTC-7 / UTC-6（有 DST）
      "America/Phoenix", // MST UTC-7（无 DST）
      "America/Los_Angeles", // PST/PDT UTC-8 / UTC-7（有 DST）
      "America/Vancouver",
      "America/Anchorage", // AKST/AKDT UTC-9 / UTC-8（有 DST）
      "America/Halifax", // AST/ADT UTC-4 / UTC-3（有 DST）
      "America/St_Johns", // NST/NDT UTC-3:30 / UTC-2:30 纽芬兰特殊
      "America/Mexico_City", // CST UTC-6（2022 起无 DST）
      "America/Bogota", // COT UTC-5（无 DST）
      "America/Lima", // PET UTC-5（无 DST）
      "America/Santiago", // CLT/CLST UTC-4 / UTC-3 南半球 DST
      "America/Sao_Paulo", // BRT UTC-3（2019 起无 DST）
      "America/Buenos_Aires", // ART UTC-3（无 DST）
    ],
  },
  {
    region: "Africa",
    zones: [
      "Africa/Cairo", // EET UTC+2（埃及，曾恢复 DST）
      "Africa/Lagos", // WAT UTC+1
      "Africa/Johannesburg", // SAST UTC+2
      "Africa/Nairobi", // EAT UTC+3
      "Africa/Casablanca", // WET/WEST 摩洛哥特殊 DST
      "Africa/Accra", // GMT UTC+0
    ],
  },
  {
    region: "Oceania",
    zones: [
      "Australia/Sydney", // AEDT/AEST UTC+11 / UTC+10（有 DST）
      "Australia/Melbourne",
      "Australia/Brisbane", // AEST UTC+10（无 DST）
      "Australia/Perth", // AWST UTC+8（无 DST）
      "Australia/Adelaide", // ACDT/ACST UTC+10:30 / UTC+9:30（有 DST）
      "Pacific/Auckland", // NZST/NZDT UTC+12 / UTC+13（有 DST）
      "Pacific/Fiji", // FJT/FJST UTC+12 / UTC+13（有 DST）
      "Pacific/Honolulu", // HST UTC-10（无 DST）
      "Pacific/Guam", // ChST UTC+10
      "Pacific/Tahiti", // TAHT UTC-10
    ],
  },
  {
    region: "UTC",
    zones: ["UTC"],
  },
];

/** 扁平化全量时区列表（向后兼容导出） */
export const COMMON_TIMEZONES: readonly string[] = TIMEZONE_GROUPS.flatMap(
  (g) => g.zones,
);

/** 动态计算某 IANA 时区相对 UTC 的偏移标签（UTC+8），禁止硬编码偏移数字。
 *  传入的 at 为「当前时刻」时，DST 期间会自动返回夏令时偏移。 */
function utcOffsetLabel(timeZone: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-us", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(at);
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    // "GMT+8" / "GMT+8:30" -> "UTC+8" / "UTC+8:30"
    return name ? name.replace(/^GMT/, "UTC") : timeZone;
  } catch {
    return timeZone;
  }
}

export interface TimezoneSelectProps {
  className?: string;
  /** 受控值："auto" 或 IANA 时区字符串。不传则走旧版兼容模式。 */
  value?: string;
  /** 受控模式的变化回调 */
  onChange?: (tz: string) => void;
  /** label（i18n key 或直接文本） */
  label?: string;
}

const AUTO = "auto";

export function TimezoneSelect({
  className,
  value,
  onChange,
  label,
}: TimezoneSelectProps) {
  const { t } = useI18n();
  const tz = useEffectiveTimezone();

  const now = new Date();

  // 受控模式：用传入的 value
  // 非受控兼容模式：初始化为 userTz ?? AUTO
  const current =
    value !== undefined ? value : tz.userTz ?? AUTO;

  function handle(e: React.ChangeEvent<HTMLSelectElement>) {
    if (onChange) {
      // 受控模式：仅回调，外部持久化
      onChange(e.target.value);
    }
    // 非受控兼容：暂不做（admin/profile 后续会切到受控模式）
  }

  return (
    <select
      aria-label={label ?? t("nav.timezone")}
      title={label ?? t("nav.timezone")}
      className={
        className ??
        "h-9 rounded-md border border-input bg-background px-2 text-sm"
      }
      value={current}
      onChange={handle}
    >
      <option value={AUTO}>{t("nav.timezoneAuto")}</option>
      {TIMEZONE_GROUPS.map((group) => (
        <optgroup key={group.region} label={group.region}>
          {group.zones.map((tzName) => (
            <option key={tzName} value={tzName}>
              {tzName}（{utcOffsetLabel(tzName, now)}）
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
