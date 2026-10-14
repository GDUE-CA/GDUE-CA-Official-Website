"use client";

/**
 * EmailBinding —— 绑定邮箱（/setting/security/email）
 *
 * 邮箱是登录与账号找回的重要凭证：当前展示绑定状态（脱敏）。
 * 换绑邮箱（验证码校验 + 唯一约束）在后续迭代开放。
 */
import { useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchProfile } from "@/lib/api/auth";

/** 邮箱脱敏：a***@domain */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const head = name.slice(0, 1);
  return `${head}***@${domain}`;
}

export function EmailBinding() {
  const { t } = useI18n();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const p = await fetchProfile();
        setEmail(p.email ?? "");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-4 w-4" />
          {t("setting.bindEmail.title")}
        </CardTitle>
        <CardDescription>{t("setting.bindEmail.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("setting.bindEmail.current")}：</span>
              <span className="font-medium">
                {email ? maskEmail(email) : t("setting.bindEmail.none")}
              </span>
            </div>
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              {t("setting.bindEmail.changeSoon")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
