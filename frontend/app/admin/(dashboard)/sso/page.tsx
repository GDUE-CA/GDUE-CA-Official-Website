import type { Metadata } from "next";
import { SsoClientsManager } from "@/components/admin/sso/SsoClientsManager";

export const metadata: Metadata = { title: "SSO 受信应用" };

/** /admin/sso - 自建 SSO 受信应用管理页（页面只做组合，业务在组件内） */
export default function AdminSsoPage() {
  return <SsoClientsManager />;
}
