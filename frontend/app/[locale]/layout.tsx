import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Script from "next/script";
import {
  locales,
  defaultLocale,
  isLocale,
  urlLangToLocale,
  localeToHreflang,
  type Locale,
} from "@/lib/i18n";
import { getDictionaryByLocale } from "@/i18n/dictionary";
import { I18nProvider } from "@/i18n/provider";
import { SessionHeartbeat } from "@/components/shared/SessionHeartbeat";
import { HtmlLangSync } from "@/components/shared/HtmlLangSync";
import { getSiteUrl } from "@/lib/site";
import { BanModal } from "@/components/shared/BanModal";
import { NavDesktop } from "@/components/layout/NavDesktop";
import { Footer } from "@/components/layout/Footer";
import { BackgroundTaskFloat } from "@/components/notifications/BackgroundTaskFloat";

/** 为每个语言生成静态参数 */
export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/** schema.org EducationalOrganization JSON-LD（与 locale 无关，全站统一；url 运行时注入） */
const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: "广东第二师范学院计算机协会",
  alternateName: "GDUE Computer Association",
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

/**
 * 从 proxy.ts 注入的 x-pathname（浏览器源 URL，含 locale 前缀）剥掉 locale 段，
 * 返回剩余子路径（无 locale 前缀）。用于生成各语言版本的 hreflang alternate。
 * 例：/zh-cn/about → /about；/zh-cn → ""；/zh-cn/events/8 → /events/8
 */
function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split("/");
  if (segments.length > 1 && urlLangToLocale(segments[1])) {
    const sub = segments.slice(2).join("/").replace(/^\/+/, "");
    return sub ? `/${sub}` : "";
  }
  return pathname;
}

/** 动态 metadata：按当前页路径生成 hreflang alternates（规范 §6） */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: localeStr } = await params;
  if (!isLocale(localeStr)) notFound();
  const locale: Locale = localeStr;
  const dict = await getDictionaryByLocale(locale);

  // proxy.ts 注入 x-pathname（含 locale 前缀的浏览器源 URL）；
  // 兜底为 /{locale}（仅当 header 缺失时，通常是 SSR 直发场景）
  const currentPath = (await headers()).get("x-pathname") ?? `/${locale}`;
  const rest = stripLocalePrefix(currentPath);
  // 站点根 URL（与 sitemap.ts / robots.ts 同源，见 lib/site.ts）
  const baseUrl = await getSiteUrl();

  // 每个支持的语言生成一条 alternate（hreflang 用 BCP 47 规范大小写，如 zh-CN / en-GB），
  // 全部带 locale 前缀；x-default 指向默认语言
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[localeToHreflang(l)] = `${baseUrl}/${l}${rest}`;
  }
  languages["x-default"] = `${baseUrl}/${defaultLocale}${rest}`;

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
    ...(baseUrl ? { metadataBase: new URL(baseUrl) } : {}),
    alternates: { canonical: `${baseUrl}/${locale}${rest}`, languages },
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

  return (
    <>
      {/*
        <html lang> 由根 layout 按 x-locale 在服务端输出；这里只负责客户端切换语言后的同步。
        （原 beforeInteractive 脚本放在嵌套 layout 中无效，且触发 React「script tag」报错）
      */}
      <HtmlLangSync locale={locale} />

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
        {JSON.stringify({ ...orgJsonLd, url: await getSiteUrl() })}
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
        <BackgroundTaskFloat />
        <NavDesktop />
        <main className="flex-1 pt-16">{children}</main>
        <Footer />
      </I18nProvider>
    </>
  );
}
