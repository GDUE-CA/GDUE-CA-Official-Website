"use client";

/**
 * RecruitmentInfoSection - 最新招新信息（CMS）
 * 公开接口自动过滤未启用/过期信息；接口为空或异常时整体不渲染
 */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { listPublicRecruitment } from "@/lib/api/recruitment";
import { MarkdownProse } from "@/components/shared/MarkdownProse";
import { FormattedUserActionTime } from "@/components/shared/FormattedUserActionTime";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RecruitmentInfo } from "@/types/api";

function RecruitmentCard({ info }: { info: RecruitmentInfo }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{info.title}</h3>
          {info.target_dept && <Badge variant="secondary">{info.target_dept}</Badge>}
        </div>
        {(info.start_at || info.end_at) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {info.start_at && <FormattedUserActionTime utcIso={info.start_at} className="font-mono" />}
            {info.start_at && info.end_at && <span>—</span>}
            {info.end_at && <FormattedUserActionTime utcIso={info.end_at} className="font-mono" />}
          </div>
        )}
        <MarkdownProse content={info.content} className="text-sm md:text-base" />
      </CardContent>
    </Card>
  );
}

export function RecruitmentInfoSection() {
  const { t } = useI18n();
  const [items, setItems] = useState<RecruitmentInfo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPublicRecruitment()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        /* CMS 无招新信息或网络错误：静默跳过 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section className="mb-12">
      <SectionHeading title={t("join.cmsRecruitmentTitle")} />
      <div className="space-y-6">
        {items.map((info) => (
          <RecruitmentCard key={info.id} info={info} />
        ))}
      </div>
    </section>
  );
}
