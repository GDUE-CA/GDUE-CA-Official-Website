import { redirect } from "next/navigation";
import { getServerLocale } from "@/lib/server-locale";

/** 旧路由 /setting/region 已合并进 /setting/display */
export default async function LegacyRegionPage() {
  const locale = await getServerLocale();
  redirect(`/${locale}/setting/display`);
}
