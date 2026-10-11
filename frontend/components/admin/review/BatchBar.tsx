/**
 * 浮动批量操作栏：有选中项时显示在右下角，三类审核业务共用同一交互规范
 */
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type BatchAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: "default" | "outline" | "destructive";
};

export function BatchBar({
  countLabel,
  loading,
  actions,
  cancelLabel,
  onCancel,
}: {
  countLabel: string;
  loading?: boolean;
  actions: BatchAction[];
  cancelLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
      <span className="text-sm text-muted-foreground whitespace-nowrap">{countLabel}</span>
      <div className="flex gap-2">
        {actions.map((a) => (
          <Button key={a.key} size="sm" variant={a.variant ?? "default"} onClick={a.onClick} disabled={loading}>
            <a.icon className="h-4 w-4 mr-1" />
            {a.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
