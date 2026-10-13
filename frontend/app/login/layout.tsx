import type { Metadata } from "next";
import { AdminProviders } from "@/app/admin/AdminProviders";

/**
 * /login 统一登录入口布局
 * - 必须包 AdminProviders：页面内 useAdminLocale / useI18n 依赖该 Provider 提供 locale 与字典；
 *   旧 /admin/login、/auth/login 分别在 app/admin/layout.tsx、app/auth/layout.tsx 内被包，
 *   统一到 /login 后需在此补齐，否则 useAdminLocale 抛 "must be used within AdminProviders"。
 * - robots noindex，避免登录页被搜索引擎收录
 */
export const metadata: Metadata = {
  title: {
    default: "账号登录 | 广东第二师范学院计算机协会",
    template: "%s | 账号登录",
  },
  robots: { index: false, follow: false },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminProviders>{children}</AdminProviders>;
}
