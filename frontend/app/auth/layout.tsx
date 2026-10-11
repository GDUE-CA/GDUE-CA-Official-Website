import type { Metadata } from "next";
import { AdminProviders } from "@/app/admin/AdminProviders";

/**
 * /auth 路由布局（P0：用户端登录 / 注册页）
 * - 复用 AdminProviders 提供多语言（与后台同一套 6 语言字典 + localStorage 记忆）
 * - robots noindex，避免认证页被搜索引擎收录
 */
export const metadata: Metadata = {
  title: {
    default: "账号登录 / 注册 | 广东第二师范学院计算机协会",
    template: "%s | 广东第二师范学院计算机协会",
  },
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminProviders>{children}</AdminProviders>;
}
