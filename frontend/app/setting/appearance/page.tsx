import { redirect } from "next/navigation";
import { getServerLocale } from "@/lib/server-locale";

/** 旧路由 /setting/appearance 已合并进 /setting/display */
export default async function LegacyAppearancePage() {
  const locale = await getServerLocale();
  redirect(`/${locale}/setting/display`);
}
