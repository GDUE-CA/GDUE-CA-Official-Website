/**
 * Icon —— 全站统一图标调用入口（阶段 3-5，规范 2.6 薄封装）
 *
 * 仅做「尺寸/颜色默认值 + className 合并 + aria-hidden 语义」封装，
 * 不使用 next/image（Image 无法继承 currentColor，破坏明暗主题跟随）。
 *
 * 存量调用点可直接使用 `@/assets/icons/**` 导入的组件（尺寸沿用 className）；
 * 新代码建议经本组件消费以获得统一默认尺寸。
 *
 * 注意：本组件无状态无副作用，刻意不加 "use client"，服务端组件亦可使用。
 */
import type { IconComponent } from "@/types/icons";
import { cn } from "@/lib/utils";

export function Icon({
  icon: Glyph,
  size = 24,
  className,
  ...rest
}: {
  icon: IconComponent;
  /** 像素尺寸（写入 svg width/height 属性；CSS h-* w-* 类仍可覆盖） */
  size?: number;
  className?: string;
} & React.SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      width={size}
      height={size}
      aria-hidden
      className={cn("inline-block shrink-0", className)}
      {...rest}
    />
  );
}
