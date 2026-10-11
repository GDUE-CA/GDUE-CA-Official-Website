import { cn } from "@/lib/utils";

/**
 * BrandMark - 社团标识：墨黑方块 + 终端提示符「>_」+ GDUECA 字标
 * 导航栏、页脚、移动端抽屉共用
 */
export function BrandMark({
  className,
  hideWordmarkOnMobile = false,
}: {
  className?: string;
  /** 小屏只显示图形标识（导航栏空间不足时） */
  hideWordmarkOnMobile?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-primary font-mono text-xs font-medium text-primary-foreground"
      >
        &gt;_
      </span>
      <span
        className={cn(
          "text-base font-semibold tracking-tight",
          hideWordmarkOnMobile && "hidden sm:inline"
        )}
      >
        GDUECA
      </span>
    </span>
  );
}
