"use client";

/**
 * JoinCTA - 首页底部行动区：反色面板 + 强调色按钮（全页唯一的信号绿按钮）
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";

export function JoinCTA() {
  const { locale, t } = useI18n();

  return (
    <section className="container mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 pb-10 md:py-12">
      <div className="flex flex-col gap-6 rounded-[18px] md:rounded-[20px] bg-primary p-7 md:flex-row md:items-center md:justify-between md:px-14 md:py-12 text-primary-foreground">
        <div className="flex flex-col gap-2.5">
          <span aria-hidden="true" className="font-mono text-xs text-primary-foreground/60">
            $ join --club gdueca
          </span>
          <h2 className="text-[28px] md:text-[40px] leading-tight">{t("home.quickNav.joinTitle")}</h2>
          <p className="text-[15px] md:text-base text-primary-foreground/65">{t("home.quickNav.joinDesc")}</p>
        </div>
        <Button asChild variant="signal" size="lg" className="md:h-[52px] md:px-7 md:text-base">
          <Link href={`/${locale}/join`} transitionTypes={["nav-forward"]}>
            {t("home.hero.cta1")}
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}
