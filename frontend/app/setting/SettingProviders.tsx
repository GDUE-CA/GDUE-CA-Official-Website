"use client";

/**
 * SettingProviders —— /setting 客户端 Provider 组合
 *
 * - SettingProviders：复用 AdminProviders（6 语言字典 + SessionHeartbeat 保活）
 * - SettingRoot：挂载时 fetchMe() 校验登录态
 * 401 / 网络失败 → clearLocalSession + 跳转 /login
 *   - me.must_change_password → 跳转 /admin/change-password 强制改密
 *   - 通过后写回本地会话展示信息并渲染 children（未校验完显示 Loading）
 */
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AdminProviders } from "@/app/admin/AdminProviders";
import { useLocalizedPath } from "@/lib/navigation";
import { SettingShell } from "@/components/setting/SettingShell";
import { SettingGuardProvider } from "@/components/setting/SettingGuardContext";
import { fetchMe } from "@/lib/api/auth";
import { clearLocalSession, saveSession } from "@/lib/auth";

export function SettingRoot({ children }: { children: ReactNode }) {
  const router = useRouter();
  const lp = useLocalizedPath();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (me.must_change_password) {
          router.replace(lp("/admin/change-password"));
          return;
        }
        saveSession({
          username: me.username,
          role: me.role,
          realnameVerified: me.realname_verified,
        });
        if (!cancelled) setReady(true);
      } catch {
        // 401 或网络失败：未登录
        clearLocalSession();
        router.replace(lp("/login"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}

export function SettingProviders({ children }: { children: ReactNode }) {
  return (
    <AdminProviders>
      <SettingRoot>
        <SettingGuardProvider>
          <SettingShell>{children}</SettingShell>
        </SettingGuardProvider>
      </SettingRoot>
    </AdminProviders>
  );
}
