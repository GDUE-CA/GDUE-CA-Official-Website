import { redirect } from "next/navigation";

/**
 * /setting 默认页：重定向到第一个 Tab（基础资料）
 */
export default function SettingIndexPage() {
  redirect("/setting/profile");
}
