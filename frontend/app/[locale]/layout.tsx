import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Script from "next/script";
import { locales, localeHtmlLang, isLocale, type Locale } from "@/lib/i18n";
import { getDictionaryByLocale } from "@/i18n/dictionary";
import { I18nProvider } from "@/i18n/provider";
import { SessionHeartbeat } from "@/components/shared/SessionHeartbeat";
import { BanModal } from "@/components/shared/BanModal";
import { NavDesktop } from "@/components/layout/NavDesktop";
import { Footer } from "@/components/layout/Footer";

/** 为每个语言生成静态参数 */
export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/** schema.org EducationalOrganization JSON-LD（与 locale 无关，全站统一） */
const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: "广东第二师范学院计算机协会",
  alternateName: "GDUE Computer Association",
  url: "https://gdueca.example.edu.cn",
  address: {
    "@type": "PostalAddress",
    addressRegion: "广东省",
    addressLocality: "广州市花都区",
    streetAddress: "工业大道11号",
    addressCountry: "CN",
  },
  parentOrganization: {
    "@type": "CollegeOrUniversity",
    name: "广东第二师范学院",
  },
  description:
    "广东第二师范学院（花都校区）计算机协会 - 学生计算机社团",
};

/** 动态 metadata：同时注入 hreflang alternates */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: localeStr } = await params;
  if (!isLocale(localeStr)) notFound();
  const locale: Locale = localeStr;
  const dict = await getDictionaryByLocale(locale);
  return {
    title: {
      default: dict.meta.title,
      template: `%s | ${dict.meta.title}`,
    },
    description: dict.meta.description,
    keywords: dict.meta.keywords.split(","),
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      type: "website",
    },
    alternates: {
      languages: Object.fromEntries(
        locales.map((l) => [l, `/${l}`])
      ),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeStr } = await params;
  if (!isLocale(localeStr)) notFound();
  const locale: Locale = localeStr;
  const messages = await getDictionaryByLocale(locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const htmlLang = localeHtmlLang[locale];

  return (
    <>
      {/*
        设置 <html lang>：在 hydration 前执行，覆盖根 layout 默认 zh-cn。
        使用 next/script（而非原生 <script>）避免 Next 16 的 React component 警告。
      */}
      <Script
        id="gdueca-html-lang"
        strategy="beforeInteractive"
        nonce={nonce}
      >
        {`document.documentElement.lang=${JSON.stringify(htmlLang)};`}
      </Script>

      {/*
        schema.org EducationalOrganization JSON-LD。
        next/script 会自动处理 idempotency，type="application/ld+json" 直接生效。
      */}
      <Script
        id="gdueca-schema-org"
        type="application/ld+json"
        strategy="afterInteractive"
        nonce={nonce}
      >
        {JSON.stringify(orgJsonLd)}
      </Script>

      {/* Umami 网站统计脚本（非 Google Analytics）—— next/script 自动挂到 head */}
      {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID &&
        process.env.NEXT_PUBLIC_UMAMI_SRC && (
          <Script
            async
            src={process.env.NEXT_PUBLIC_UMAMI_SRC}
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
            nonce={nonce}
            strategy="afterInteractive"
            fetchPriority="low"
          />
        )}

      <I18nProvider locale={locale} messages={messages}>
        <SessionHeartbeat />
        <BanModal />
        <NavDesktop />
        <main className="flex-1 pt-16">{children}</main>
        <Footer />
      </I18nProvider>
    </>
  );
}
