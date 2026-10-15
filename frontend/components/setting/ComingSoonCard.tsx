"use client";

/**
 * ComingSoonCard —— P1/P2 尚未上线功能的统一占位卡片
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/i18n/provider";
import Hammer from "@/assets/icons/action/hammer.svg";
import type { IconComponent } from "@/types/icons";

export function ComingSoonCard({
  icon: Icon = Hammer,
  title,
  description,
}: {
  icon?: IconComponent;
  title: string;
  description?: string;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {t("setting.soonBadge")}
        </span>
        <p className="text-sm text-muted-foreground">{t("setting.comingSoon")}</p>
      </CardContent>
    </Card>
  );
}
