"use client";

/**
 * ThemePopover —— 外观（浅色 / 深色）选择浮层
 *
 * 账号菜单与设置菜单的「外观设置」入口弹出的独立浮层，
 * 通过 PopoverAnchor 挂在菜单项上，内容 Portal 挂载；
 * 选中立即生效并写入 localStorage（逻辑收敛于 useTheme）。
 */
import type { ReactNode } from "react";
import { Check, Moon, Sun } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useTheme, type Theme } from "@/lib/hooks/useTheme";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; labelKey: string; icon: typeof Sun }[] = [
  { value: "light", labelKey: "common.themeLight", icon: Sun },
  { value: "dark", labelKey: "common.themeDark", icon: Moon },
];

interface ThemePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 锚点元素（通常是外层菜单的菜单项，仅作定位锚） */
  anchor: ReactNode;
}

export function ThemePopover({ open, onOpenChange, anchor }: ThemePopoverProps) {
  const { t } = useI18n();
  const { theme, mounted, setTheme } = useTheme();

  /** 选中主题：立即生效并关闭浮层 */
  function pick(next: Theme) {
    setTheme(next);
    onOpenChange(false);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={12}
        alignOffset={-6}
        className="w-44 p-1"
      >
        {OPTIONS.map(({ value, labelKey, icon: Icon }) => {
          const active = mounted && theme === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => pick(value)}
              className={cn(
                "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent",
                active && "text-primary"
              )}
            >
              <Icon className="h-4 w-4" />
              {t(labelKey)}
              {active && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
