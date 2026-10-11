"use client";

/**
 * LanguageSwitcher - 语言切换下拉组件
 * 使用 DropdownMenu 展示 4 种语言选项，切换时替换 URL 中的语言前缀
 */
import { usePathname, useRouter } from "next/navigation";
import { Languages, Check } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { locales, localeNames, type Locale } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { locale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  /** 切换语言：替换路径中的语言前缀 */
  function switchLocale(targetLocale: Locale) {
    if (targetLocale === locale) return;

    // 从当前路径中移除旧的语言前缀，添加新的
    const segments = pathname.split("/");
    // segments[0] 是空字符串, segments[1] 是当前 locale
    segments[1] = targetLocale;
    const newPath = segments.join("/");
    router.push(newPath);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Languages className="h-4 w-4" />
          <span className="hidden sm:inline">{localeNames[locale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => switchLocale(loc)}
            className="justify-between"
          >
            {localeNames[loc]}
            {loc === locale && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
