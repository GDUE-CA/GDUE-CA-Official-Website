/**
 * SVG 模块类型声明（阶段 3-5 图标矢量化，规范 2.5 方案 A）
 *
 * assets/icons 目录下的 .svg 经 @svgr/webpack 编译为内联 React 组件，
 * 默认导出统一为 IconComponent 类型。
 */
declare module "*.svg" {
  import type { IconComponent } from "@/types/icons";

  const component: IconComponent;
  export default component;
}
