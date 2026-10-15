/**
 * /{locale}/setting 默认页：不再强制重定向到个人资料。
 * 直接渲染空内容，由外层 SettingShell 接管：
 * - 桌面端：展示一级菜单 + 当前分组二级菜单（内容区为空，等用户选择）
 * - 移动端：展示一级菜单列表（不自动跳入子页，修复返回死循环 BUG）
 */
export default function SettingIndexPage() {
  return null;
}
