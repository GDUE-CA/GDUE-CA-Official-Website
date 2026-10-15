"use client";

/**
 * 国旗 + 国名（后台访问来源表用）
 * - 国旗用 country-flag-icons 的 SVG（emoji 国旗在 Windows 上不显示），整个国旗集按需动态加载，
 *   不进后台首屏包；
 * - 国名：有纯真库（qqwry）结果且界面为中文时优先用它（中文原文），否则 Intl.DisplayNames 本地化；
 * - 有纯真库结果时国名可点击，浮层展示国家 / 省份 / 城市 / area 与网络（ASN · 运营商）。
 */
import { useEffect, useState } from "react";
import type { FlagComponent } from "country-flag-icons/react/3x2";
import { useI18n } from "@/i18n/provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { QqwryInfo } from "@/types/api";

type FlagMap = Record<string, FlagComponent | undefined>;

let flagsPromise: Promise<FlagMap> | null = null;
function loadFlags(): Promise<FlagMap> {
  flagsPromise ??= import("country-flag-icons/react/3x2").then((m) => m as unknown as FlagMap);
  return flagsPromise;
}

/**
 * ISO-3166-1 alpha-2 → 当前语言的国家 / 地区名；无法生成时原样返回代码
 * 部分界面语言 ID 不是合法 BCP 47（如 zh-yue-cn、zh-cn-sg 会抛错），
 * 依次回退到「首段-末段」（zh-cn / zh-sg）、「首段-次段」、首段与英文
 */
export function countryName(code: string, locale: string): string {
  const [first, second, last] = locale.split("-");
  const candidates = [locale];
  if (last) candidates.push(`${first}-${last}`);
  if (second) candidates.push(`${first}-${second}`);
  candidates.push(first, "en");
  for (const l of candidates) {
    try {
      const name = new Intl.DisplayNames([l], { type: "region" }).of(code);
      if (name) return name;
    } catch {
      /* 尝试下一个 */
    }
  }
  return code;
}

/** 纯真库的省 + 市（同名只留一个，如直辖市），用于表格内的简短属地 */
export function qqwryPlace(q: QqwryInfo): string {
  return q.province && q.city && q.province !== q.city ? `${q.province}${q.city}` : q.province || q.city;
}

interface CountryFlagProps {
  code: string | null;
  qqwry?: QqwryInfo | null;
  asn?: string | null;
  org?: string | null;
}

export function CountryFlag({ code, qqwry, asn, org }: CountryFlagProps) {
  const { t, locale } = useI18n();
  const [flags, setFlags] = useState<FlagMap | null>(null);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    loadFlags().then((m) => alive && setFlags(m)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [code]);

  const network = [asn, org].filter(Boolean).join(" · ");
  const name =
    (locale.startsWith("zh") && qqwry?.country) || (code ? countryName(code, locale) : qqwry?.country || "");
  const Flag = code ? flags?.[code] : undefined;

  const flag = code ? (
    Flag ? (
      <Flag className="h-3 w-[18px] shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" aria-hidden />
    ) : (
      <span className="h-3 w-[18px] shrink-0 rounded-[2px] bg-muted" aria-hidden />
    )
  ) : null;

  if (!qqwry) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs" title={network || name}>
        {flag}
        <span>{name}</span>
      </span>
    );
  }

  const rows: [string, string][] = [
    [t("admin.dashboard.accessGeoCountry"), qqwry.country],
    [t("admin.dashboard.accessGeoProvince"), qqwry.province],
    [t("admin.dashboard.accessGeoCity"), qqwry.city],
    [t("admin.dashboard.accessGeoArea"), qqwry.area],
  ];
  if (network) rows.push([t("admin.dashboard.accessGeoNetwork"), network]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-sm text-xs underline decoration-dotted underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${name} · ${t("admin.dashboard.accessGeoDetails")}`}
        >
          {flag}
          <span>{name}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto min-w-56 max-w-80 p-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words">{value || "—"}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">{t("admin.dashboard.accessGeoSource")}</p>
      </PopoverContent>
    </Popover>
  );
}
