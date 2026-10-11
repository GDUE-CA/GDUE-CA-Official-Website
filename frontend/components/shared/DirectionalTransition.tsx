import { ViewTransition } from "react";

/**
 * DirectionalTransition - 页面级方向性过渡
 *
 * 放在各页面组件（而非 layout）最外层：
 * - 带 nav-forward 类型的导航（首页 → 栏目页）：旧页左移淡出，新页从右滑入
 * - 带 nav-back 类型的导航（导航栏 Logo 返回首页）：方向相反
 * - 其他导航（栏目页之间平级切换、浏览器前进后退）不带类型，不做页面动画
 *
 * 类型由 <Link transitionTypes={["nav-forward"]}> 等方式添加。
 */
export function DirectionalTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      <div>{children}</div>
    </ViewTransition>
  );
}
