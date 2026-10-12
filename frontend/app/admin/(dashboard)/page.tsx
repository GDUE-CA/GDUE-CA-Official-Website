import { redirect } from "next/navigation";
import { getServerLocale } from "@/lib/server-locale";

/**
 * /{locale}/admin 根路径：307 重定向到 /{locale}/admin/dashboard（后台仪表盘）
 * locale 取 proxy 注入的 x-locale 头（请求到此已带 locale 前缀）。
 */
export default async function AdminIndexPage() {
  const locale = await getServerLocale();
  redirect(`/${locale}/admin/dashboard`);
}
