"use client";
/**
 * 可见性单选组（public / member_only / private）
 * 横向 3 列按钮组，简洁紧凑。
 */
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { MemoVisibility } from "@/types/api";

interface VisibilitySelectProps {
  value: MemoVisibility;
  onChange: (v: MemoVisibility) => void;
  disabled?: boolean;
}

const VIS: MemoVisibility[] = ["public", "member_only", "private"];

export function VisibilitySelect({ value, onChange, disabled }: VisibilitySelectProps) {
  const { t } = useI18n();
  return (
    <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/40">
      {VIS.map((v) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onClick={() => onChange(v)}
            title={t(`memo.visibility.${v}Desc`)}
            className={cn(
              "px-3 h-7 rounded text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {t(`memo.visibility.${v}`)}
          </button>
        );
      })}
    </div>
  );
}
