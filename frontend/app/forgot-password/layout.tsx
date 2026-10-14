import type { Metadata } from "next";
import { AdminProviders } from "@/app/admin/AdminProviders";

/**
 * /forgot-password 忘记密码（邮箱验证码通道）布局
 * - 必须包 AdminProviders：页面内 useAdminLocale / useI18n 依赖该 Provider 提供 locale 与字典；
 *   与 /login 布局同理（统一登录入口布局的先例），否则 SSR 抛
 *   "useI18n must be used within I18nProvider"。
 * - robots noindex，避免找回密码流程页被搜索引擎收录
 */
export const metadata: Metadata = {
  title: {
    default: "找回密码 | 广东第二师范学院计算机协会",
    template: "%s | 找回密码",
  },
  robots: { index: false, follow: false },
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminProviders>{children}</AdminProviders>;
}
