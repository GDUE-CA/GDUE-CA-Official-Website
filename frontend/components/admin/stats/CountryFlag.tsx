"use client";

/**
 * 国旗 + 本地化国名（后台访问来源表用）
 * 国旗用 country-flag-icons 的 SVG（emoji 国旗在 Windows 上不显示），整个国旗集按需动态加载，
 * 不进后台首屏包；国名由 Intl.DisplayNames 按当前界面语言生成。
 */
import { useEffect, useState } from "react";
import type { FlagComponent } from "country-flag-icons/react/3x2";

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

export function CountryFlag({ code, locale, title }: { code: string; locale: string; title?: string }) {
  const [flags, setFlags] = useState<FlagMap | null>(null);

  useEffect(() => {
    let alive = true;
    loadFlags().then((m) => alive && setFlags(m)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const name = countryName(code, locale);
  const Flag = flags?.[code];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={title ?? name}>
      {Flag ? (
        <Flag className="h-3 w-[18px] shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" aria-hidden />
      ) : (
        <span className="h-3 w-[18px] shrink-0 rounded-[2px] bg-muted" aria-hidden />
      )}
      <span>{name}</span>
    </span>
  );
}
