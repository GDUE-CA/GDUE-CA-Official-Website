/**
 * 图标组件统一类型（阶段 3-5 图标矢量化）
 *
 * 替代 lucide-react 的 LucideIcon：本地 SVG 经 @svgr/webpack 编译后的默认导出
 * 均为此类型（接受 className / width / height / aria-* 等 SVG props）。
 * 调用点尺寸沿用 Tailwind 类（h-4 w-4 等），CSS 优先级高于 svg width/height 属性。
 */
import type { ComponentType, SVGProps } from "react";

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
