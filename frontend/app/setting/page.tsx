import { redirect } from "next/navigation";
import { getServerLocale } from "@/lib/server-locale";

/**
 * /{locale}/setting 默认页：重定向到第一个 Tab（基础资料）
 * locale 取 proxy 注入的 x-locale 头。
 */
export default async function SettingIndexPage() {
  const locale = await getServerLocale();
  redirect(`/${locale}/setting/profile`);
}
