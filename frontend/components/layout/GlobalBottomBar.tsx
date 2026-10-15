"use client";

/**
 * GlobalBottomBar - 全站固定底栏
 * - 固定在页面最底部（PC 与移动端通用），承载黑色「提交」按钮
 * - 点击进入 /{locale}/submit 提交页（社团报名 / Bug 提交两项入口）
 * - 约束：按钮只在此处，禁止放入移动端抽屉、禁止放入 PC 顶部导航
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { navTransitionTypes } from "@/lib/navTransition";

export function GlobalBottomBar() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const href = `/${locale}/submit`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2.5 flex">
        <Link
          href={href}
          transitionTypes={navTransitionTypes(pathname, locale, "/submit")}
          className="flex h-11 w-full items-center justify-center rounded-lg bg-black px-6 text-sm font-semibold text-white transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:ml-auto md:w-auto md:min-w-[9rem]"
        >
          {t("nav.submit")}
        </Link>
      </div>
    </div>
  );
}
