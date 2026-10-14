"use client";

import * as React from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * PasswordInput —— 全局统一密码输入组件（含显示/隐藏切换眼睛按钮）
 *
 * 需求硬性约束：
 * - 站内所有 type="password" 输入框一律复用本组件，禁止直接手写原生 input；
 * - 默认隐藏（掩码），点击眼睛切换明文，再点切回；仅控制当前输入框，互不联动；
 * - 仅浏览器本地切换，提交时仍按原值正常提交；
 * - 开关状态不持久化：每次页面刷新一律重置为隐藏（useState 初始值，非受控记忆）；
 * - 眼睛按钮 tabIndex=-1 不可聚焦（Tab 跳过）、仅鼠标/触屏点击生效；
 * - 图标内嵌输入框右侧，不占外部间距。
 */
const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type">
>(({ className, ...props }, ref) => {
  // 刷新即重置为隐藏：不做任何 localStorage / sessionStorage 持久化
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative w-full">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
        ref={ref}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer select-none rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
