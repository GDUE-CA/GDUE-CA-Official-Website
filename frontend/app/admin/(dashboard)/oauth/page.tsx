import type { Metadata } from "next";
import { OAuthChannelsManager } from "@/components/admin/oauth/OAuthChannelsManager";

export const metadata: Metadata = { title: "第三方登录渠道" };

/** /admin/oauth - 第三方登录渠道配置页（页面只做组合，业务在组件内） */
export default function AdminOauthPage() {
  return <OAuthChannelsManager />;
}
