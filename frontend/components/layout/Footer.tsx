"use client";

/**
 * Footer - 页脚组件（克制科技风）
 * 桌面端（≥768px）：四栏——社团标识与简介 / 快速链接 / 关注我们 / 资源；底部版权行
 * 移动端（<768px）：两列——Logo+简介（通栏）→ 快速链接 | 资源（并排）→ 关注我们（通栏）→ 版权；
 * 链接触摸高度 ≥44px；底部 padding 适配手势安全区（env(safe-area-inset-bottom)）
 */
import Link from "next/link";
import { Github, Mail, MapPin } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { BrandMark } from "@/components/shared/BrandMark";
import { APP_VERSION } from "@/lib/version";

/** 页脚导航链接 */
const footerLinks = [
  { key: "nav.about", href: "/about" },
  { key: "nav.projects", href: "/projects" },
  { key: "nav.events", href: "/events" },
  { key: "nav.blog", href: "/blog" },
  { key: "nav.join", href: "/join" },
] as const;

const legalLinks = [
  { key: "footer.terms", href: "/terms" },
  { key: "footer.privacy", href: "/privacy" },
  { key: "footer.disclaimer", href: "/disclaimer" },
] as const;

/* 移动端：链接整行可点，最小触摸高度 44px（min-h-11），文字垂直居中 */
const linkClass =
  "text-sm text-muted-foreground transition-colors hover:text-foreground max-md:flex max-md:min-h-11 max-md:items-center";
/* 移动端板块分隔：细分隔线 + 上内边距（桌面端无） */
const sectionClass = "max-md:border-t max-md:border-border/60 max-md:pt-6";

export function Footer() {
  const { locale, t } = useI18n();

  function localePath(href: string) {
    return `/${locale}${href}`;
  }

  return (
    <footer className="border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="container mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 pt-8 pb-8 md:pt-12 md:pb-10">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4 md:gap-8">
          {/* 社团标识与简介 */}
          <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
            <BrandMark />
            <p className="text-sm text-muted-foreground leading-relaxed">{t("footer.description")}</p>
          </div>

          {/* 快速链接 */}
          <nav aria-labelledby="footer-links-title" className={`flex flex-col gap-2.5 ${sectionClass}`}>
            <h2 id="footer-links-title" className="text-[13px] font-semibold tracking-normal">
              {t("footer.quickLinks")}
            </h2>
            <ul className="grid grid-cols-1 gap-2.5 max-md:gap-0">
              {footerLinks.map((item) => (
                <li key={item.key}>
                  <Link href={localePath(item.href)} className={linkClass}>
                    {t(item.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* 关注我们（移动端排到最后、通栏，让快速链接与资源并排） */}
          <div className={`col-span-2 flex flex-col gap-2.5 max-md:order-last md:col-span-1 ${sectionClass}`}>
            <h2 className="text-[13px] font-semibold tracking-normal">{t("footer.connect")}</h2>
            <a href="mailto:gdueca@feishu.millennium.dpdns.org" className={`${linkClass} inline-flex items-start gap-2 break-all`}>
              <Mail className="h-4 w-4 mt-0.5 shrink-0 max-md:mt-0" aria-hidden="true" />
              gdueca@feishu.millennium.dpdns.org
            </a>
            <a
              href="https://github.com/GDUE-Computer-Association"
              target="_blank"
              rel="noopener noreferrer"
              className={`${linkClass} inline-flex items-start gap-2 break-all`}
            >
              <Github className="h-4 w-4 mt-0.5 shrink-0 max-md:mt-0" aria-hidden="true" />
              GDUE-Computer-Association
            </a>
            <span className="inline-flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              {t("contact.address")}
            </span>
          </div>

          {/* 资源 */}
          <nav aria-label={t("footer.resources")} className={`flex flex-col gap-2.5 ${sectionClass}`}>
            <h2 className="text-[13px] font-semibold tracking-normal">{t("footer.resources")}</h2>
            <ul className="grid grid-cols-1 gap-2.5 max-md:gap-0">
              {legalLinks.map((item) => (
                <li key={item.key}>
                  <Link href={localePath(item.href)} className={linkClass}>
                    {t(item.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* 版权行 */}
        <div className="mt-8 md:mt-10 flex flex-col gap-1.5 border-t border-border pt-4 text-xs md:text-[13px] text-muted-foreground md:flex-row md:justify-between">
          <p>{t("footer.copyright")}</p>
          <p className="md:text-right">
            {t("footer.madeWith")}
            <span className="ml-2 font-mono" aria-label={t("footer.version")}>
              {APP_VERSION}
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
