import { getDictionary } from "@/i18n/dictionary";
import { PageHeader } from "@/components/shared/PageHeader";

/**
 * 隐私政策页 - 重点说明数据收集、使用和保护
 */
export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  const page = dict.privacy;

  return (
    <>
      <PageHeader title={page.title} subtitle={page.subtitle} />

      <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
        <p className="text-sm text-muted-foreground mb-8">{page.updatedAt}</p>

        <div className="space-y-6">
          {page.items.map((item: { title: string; content: string }, i: number) => (
            <section key={i} className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-semibold mb-2">
                {i + 1}. {item.title}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.content}
              </p>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
