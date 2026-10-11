import type { Metadata } from "next";
import { AdminProviders } from "./AdminProviders";

/**
 * /admin 路由布局
 * - 使用 AdminProviders 提供多语言（默认 zh-cn，localStorage 记忆，顶栏可切换）
 * - 共用根 layout 提供的 <html><body> 与主题脚本
 * - robots noindex，避免后台被搜索引擎收录
 */
export const metadata: Metadata = {
  title: {
    default: "管理员后台 | 广东第二师范学院计算机协会",
    template: "%s | 管理员后台",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminProviders>{children}</AdminProviders>
  );
}
