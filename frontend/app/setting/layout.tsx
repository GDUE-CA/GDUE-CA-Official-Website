import type { Metadata } from "next";
import { SettingProviders } from "./SettingProviders";

/**
 * /setting 路由布局（用户个人设置）
 * - 复用 AdminProviders 提供多语言 + SessionHeartbeat 会话保活
 * - SettingRoot 客户端校验登录态，未登录跳转 /auth/login
 * - robots noindex，避免个人设置页被搜索引擎收录
 */
export const metadata: Metadata = {
  title: {
    default: "个人设置 | 广东第二师范学院计算机协会",
    template: "%s | 个人设置",
  },
  robots: { index: false, follow: false },
};

export default function SettingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingProviders>{children}</SettingProviders>;
}
