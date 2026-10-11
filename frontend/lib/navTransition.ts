/**
 * 导航链接的页面过渡类型（配合 components/shared/DirectionalTransition）
 *
 * - 前往首页：nav-back（后退滑动）
 * - 从首页前往栏目页：nav-forward（前进滑动）
 * - 栏目页之间平级切换：不带类型，不做页面动画
 *
 * @param pathname 当前路径（usePathname）
 * @param locale 当前语言
 * @param href 目标路径（不含语言前缀，首页为 ""）
 */
export function navTransitionTypes(
  pathname: string,
  locale: string,
  href: string
): string[] | undefined {
  if (href === "") return ["nav-back"];
  if (pathname === `/${locale}`) return ["nav-forward"];
  return undefined;
}
