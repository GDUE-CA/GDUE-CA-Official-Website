import { cn } from "@/lib/utils";

/**
 * FieldError 组件 - 输入框下方的字段错误提示
 * 无内容时不渲染；role="alert" 让读屏软件在错误出现时播报
 */
function FieldError({ children, className }: { children?: string | null; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("text-xs text-destructive", className)}>
      {children}
    </p>
  );
}

export { FieldError };
