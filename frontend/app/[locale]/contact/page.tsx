import { getDictionary } from "@/i18n/dictionary";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Github, MessageCircle, Smartphone } from "lucide-react";
import { BugForm } from "@/components/contact/BugForm";

/**
 * 联系我们页面 - 社团邮箱、GitHub、社交账号 + Bug 反馈表单
 */
export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  const contactCards = [
    {
      icon: Mail,
      label: dict.contact.email,
      value: "gdueca@feishu.millennium.dpdns.org",
      href: "mailto:gdueca@feishu.millennium.dpdns.org",
      color: "bg-blue-500/10 text-blue-600",
    },
    {
      icon: Github,
      label: dict.contact.github,
      value: "github.com/GDUE-Computer-Association",
      href: "https://github.com/GDUE-Computer-Association",
      color: "bg-slate-500/10 text-slate-600",
    },
    {
      icon: MessageCircle,
      label: dict.contact.qq,
      value: "招新群见公众号推文",
      href: "#",
      color: "bg-cyan-500/10 text-cyan-600",
    },
    {
      icon: Smartphone,
      label: dict.contact.wechat,
      value: "广东二师花都校区计协（GDEI_CA）",
      href: "#",
      color: "bg-green-500/10 text-green-600",
    },
  ];

  return (
    <>
      <PageHeader title={dict.contact.title} subtitle={dict.contact.subtitle} />

      <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 space-y-16">
        {/* 联系方式卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {contactCards.map((card, i) => (
            <a
              key={i}
              href={card.href}
              target={card.href.startsWith("http") ? "_blank" : undefined}
              rel={card.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="block"
            >
              <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer h-full">
                <CardContent className="flex items-center gap-4 p-6">
                  <div className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${card.color} shrink-0`}>
                    <card.icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground mb-0.5">{card.label}</p>
                    <p className="font-medium truncate">{card.value}</p>
                  </div>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>

        {/* Bug 反馈表单 */}
        <div>
          <h2 className="text-2xl font-bold mb-2 text-center">{dict.bug.title}</h2>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            {dict.bug.subtitle}
          </p>
          <BugForm />
        </div>
      </div>
    </>
  );
}
