"use client";

/**
 * /[locale]/query - 回执查询页（公开）
 * - 输入回执号码查询报名 / Bug 反馈进度
 * - 支持 ?code= 参数直达（扫码进入自动查询）
 * - 查询表单复用 shared/ReceiptQuery 组件（/join 页同款）
 */
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Ticket } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReceiptQuery } from "@/components/shared/ReceiptQuery";

export default function QueryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <QueryContent />
    </Suspense>
  );
}

function QueryContent() {
  const { t } = useI18n();
  const search = useSearchParams();
  const code = search.get("code") ?? "";

  return (
    <div className="container mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center mb-10">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 mb-4">
          <Ticket className="h-7 w-7" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-3">{t("query.title")}</h1>
        <p className="text-muted-foreground">{t("query.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("query.codeLabel")}</CardTitle>
          <CardDescription>{t("query.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ReceiptQuery initialCode={code} autoQuery={!!code} />
        </CardContent>
      </Card>
    </div>
  );
}
