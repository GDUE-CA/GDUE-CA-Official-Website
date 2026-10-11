/**
 * 审核中心外壳：标题 + 业务类型 Tab（报名审核 / Bug 反馈 / 重置密码）
 * Tab 状态由父页面持久化到 searchParams（?tab=），支持深链直达
 */
"use client";

import { cn } from "@/lib/utils";

export type ReviewTabKey = "registrations" | "bugs" | "resets";

export function ReviewShell({
  title,
  tabs,
  active,
  onChange,
  children,
}: {
  title: string;
  tabs: { key: ReviewTabKey; label: string }[];
  active: ReviewTabKey;
  onChange: (key: ReviewTabKey) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="flex flex-wrap gap-2" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active === tab.key}
              onClick={() => onChange(tab.key)}
              className={cn(
                "h-9 px-4 rounded-md border text-sm font-medium transition-colors",
                active === tab.key
                  ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                  : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
