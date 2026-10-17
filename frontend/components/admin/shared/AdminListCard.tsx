"use client";

/**
 * AdminListCard —— 后台列表「卡片行」统一外壳（V0.5.7 公共组件）
 *
 * 统一三段式结构（移动端列表规范）：
 *   header：复选框（多选）+ 标题（min-w-0 防溢出）+ 右侧状态徽标
 *   body  ：富内容 children（说说/工单详情等）或标准 label/value 键值区
 *   footer：全部业务操作按钮统一放底部（flex-wrap，不溢出不重叠）
 *
 * 本组件在所有断点下视觉一致；原本就是卡片布局的后台页面（Bug 工单、
 * 实名审核、活动、说说、院系资料等）统一替换到此外壳，PC 外观保持不变。
 */
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface AdminListCardField {
  label: ReactNode;
  value: ReactNode;
  /** 等宽字体值（学号/IP/单号等） */
  mono?: boolean;
  className?: string;
}

export interface AdminListCardProps {
  /** 选中态：边框高亮（与各页既有 selected 样式一致） */
  selected?: boolean;
  /** 顶部多选复选框；不传则不渲染 */
  checked?: boolean;
  onToggle?: () => void;
  checkboxAriaLabel?: string;
  /** 自定义选择控件（如 Square/SquareCheck 图标按钮），提供时优先于原生 checkbox */
  selectionNode?: ReactNode;
  /** 标题区 */
  title: ReactNode;
  /** 标题下小字元信息行（单号/翻译切换等） */
  meta?: ReactNode;
  /** 右上角状态徽标 */
  badge?: ReactNode;
  /** 富主体内容（与 fields 二选一或并存，fields 通常渲染在 children 之下） */
  children?: ReactNode;
  /** 标准键值区：字段名 ∶ 字段值 竖排 */
  fields?: AdminListCardField[];
  /**
   * 底部操作区（全部业务按钮）。
   * 默认全断点显示在卡片底部；当同时传入 headerActions 时，
   * 底部操作区仅在移动端显示（md:hidden），桌面端显示 headerActions，
   * 以保持原「按钮在卡片右上/右侧」页面的 PC 布局零变化。
   */
  actions?: ReactNode;
  /** 桌面端头部右侧操作区（≥768px 显示，移动端隐藏） */
  headerActions?: ReactNode;
  /** 标题附加类（如 whitespace-pre-wrap） */
  titleClassName?: string;
  /** 底部操作区附加类（如 border-t-0 去除分隔线） */
  footerClassName?: string;
  className?: string;
  contentClassName?: string;
}

export function AdminListCard({
  selected = false,
  checked,
  onToggle,
  checkboxAriaLabel,
  selectionNode,
  title,
  meta,
  badge,
  children,
  fields,
  actions,
  headerActions,
  titleClassName,
  footerClassName,
  className,
  contentClassName,
}: AdminListCardProps) {
  return (
    <Card className={cn(selected && "border-primary/50", className)}>
      <CardContent className={cn("p-4 space-y-2", contentClassName)}>
        {/* header：复选框 + 标题 + 状态徽标 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            {selectionNode ??
              (onToggle && (
                <input
                  type="checkbox"
                  checked={!!checked}
                  onChange={onToggle}
                  aria-label={checkboxAriaLabel}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary cursor-pointer"
                />
              ))}
            <div className="min-w-0">
              <h3 className={cn("font-semibold break-words", titleClassName)}>{title}</h3>
              {meta && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {meta}
                </div>
              )}
            </div>
          </div>
          {badge && <div className="shrink-0">{badge}</div>}
          {headerActions && (
            <div className="hidden md:flex shrink-0 items-center gap-1.5">
              {headerActions}
            </div>
          )}
        </div>

        {/* 富内容区 */}
        {children}

        {/* 标准键值区：竖向 label ∶ value */}
        {fields && fields.length > 0 && (
          <dl className="space-y-1.5 border-t border-border/60 pt-2 text-xs">
            {fields.map((f, i) => (
              <div key={i} className={cn("flex flex-col gap-0.5", f.className)}>
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className={cn("break-words text-foreground", f.mono && "font-mono")}>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/* footer：操作按钮统一底部 */}
        {actions && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 border-t border-border pt-2",
              headerActions && "md:hidden",
              footerClassName
            )}
          >
            {actions}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
