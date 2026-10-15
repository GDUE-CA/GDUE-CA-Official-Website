"use client";

/**
 * AboutSite —— 关于本站（/setting/about）
 * 版本号 / 开源仓库 / 隐私政策 / 用户协议
 */
import Link from "next/link";
import Info from "@/assets/icons/status/info.svg";
import Github from "@/assets/icons/brand/github.svg";
import ShieldCheck from "@/assets/icons/status/shield-check.svg";
import FileText from "@/assets/icons/status/file-text.svg";
import Tag from "@/assets/icons/status/tag.svg";
import ChevronLeft from "@/assets/icons/navigation/chevron-left.svg";
import ExternalLink from "@/assets/icons/navigation/external-link.svg";
import { useI18n } from "@/i18n/provider";
import { useLocalizedPath } from "@/lib/navigation";
import { APP_VERSION } from "@/lib/version";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const REPO_URL = "https://github.com/liang1481624299/GDUE-CA-Official-Website";

export function AboutSite() {
  const { t } = useI18n();
  const lp = useLocalizedPath();

  const rows = [
    {
      icon: Tag,
      label: t("setting.about.version"),
      value: APP_VERSION,
    },
    {
      icon: Github,
      label: t("setting.about.repo"),
      value: "GitHub",
      href: REPO_URL,
      external: true,
    },
    {
      icon: ShieldCheck,
      label: t("setting.about.privacy"),
      href: lp("/privacy"),
    },
    {
      icon: FileText,
      label: t("setting.about.terms"),
      href: lp("/terms"),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Info className="h-4 w-4" />
          {t("setting.about.title")}
        </CardTitle>
        <CardDescription>{t("setting.about.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/60 rounded-md border border-border">
          {rows.map((row) => {
            const Icon = row.icon;
            const inner = (
              <>
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm">{row.label}</span>
                {row.value && (
                  <span className="text-xs text-muted-foreground font-mono">{row.value}</span>
                )}
                {row.external ? (
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                )}
              </>
            );
            const cls =
              "flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-muted/60 transition-colors";
            return row.href ? (
              row.external ? (
                <a
                  key={row.label}
                  href={row.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cls}
                >
                  {inner}
                </a>
              ) : (
                <Link key={row.label} href={row.href} className={cls}>
                  {inner}
                </Link>
              )
            ) : (
              <div key={row.label} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
