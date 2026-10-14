import { redirect } from "next/navigation";
import { getServerLocale } from "@/lib/server-locale";

/** 旧路由 /setting/regional-format 已合并进 /setting/display */
export default async function LegacyRegionalFormatPage() {
  const locale = await getServerLocale();
  redirect(`/${locale}/setting/display`);
}
