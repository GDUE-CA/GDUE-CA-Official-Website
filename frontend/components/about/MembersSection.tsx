"use client";

/**
 * MembersSection - 社团成员（CMS：现任 / 往届）
 * 公开接口按 display_order 升序返回；接口为空或异常时整体不渲染
 */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { listPublicMembers } from "@/lib/api/members";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Member } from "@/types/api";

function MemberCard({ member }: { member: Member }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        {member.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.avatar_url}
            alt={member.name}
            className="w-16 h-16 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xl font-semibold shrink-0">
            {member.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{member.name}</h3>
            {member.role_title && <Badge variant="secondary">{member.role_title}</Badge>}
          </div>
          {member.bio && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{member.bio}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function MembersSection() {
  const { t } = useI18n();
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPublicMembers()
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch(() => {
        /* CMS 无成员数据或网络错误：静默跳过 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!members || members.length === 0) return null;

  const current = members.filter((m) => m.term === "current");
  const former = members.filter((m) => m.term === "former");

  if (current.length === 0 && former.length === 0) return null;

  return (
    <section className="mb-20">
      {current.length > 0 && (
        <>
          <SectionHeading title={t("about.cmsMembersTitle")} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {current.map((m) => (
              <MemberCard key={m.id} member={m} />
            ))}
          </div>
        </>
      )}
      {former.length > 0 && (
        <>
          <SectionHeading title={t("about.cmsFormerMembersTitle")} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {former.map((m) => (
              <MemberCard key={m.id} member={m} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
