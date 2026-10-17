"use client";

/**
 * AdminList —— 后台数据列表统一公共组件（V0.5.7）
 *
 * 响应式硬性约定（禁止用 overflow-x:auto 适配移动端）：
 *   ≥768px：渲染原生 <table>（结构/类名与旧表格一致，PC 行为零变化）；
 *   <768px：每行渲染一张 AdminListCard（顶部复选框+标题+徽标，
 *           中部竖向键值对，底部操作按钮），搜索/筛选/多选/分页由
 *           调用方在外层实现，两端共用同一批数据与回调，功能不丢失。
 *
 * 用法：替换原 `<div className="overflow-x-auto"><table/></div>`，
 * 外层保留 Card > CardContent(p-0) 容器即可。
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AdminListCard } from "./AdminListCard";

export interface AdminListColumn<T> {
  key: string;
  /** 表头内容 */
  header?: ReactNode;
  /** th 附加类（宽度/对齐，如 w-[12%]、text-right） */
  headerClassName?: string;
  /** td 附加类；可按行动态（如编辑行高亮） */
  cellClassName?: string | ((row: T) => string);
  /** 单元格内容（PC 表格 + 移动卡片键值区共用） */
  render: (row: T) => ReactNode;
  /** 移动端卡片字段名；不填则该列不进入卡片键值区（选择/操作等） */
  mobileLabel?: ReactNode;
  /** 移动端字段值（默认取 render(row)） */
  mobileRender?: (row: T) => ReactNode;
  /** 移动端键值区外层附加类 */
  mobileFieldClassName?: string;
  /** 移动端值用等宽字体 */
  mobileMono?: boolean;
}

export interface AdminListProps<T> {
  rows: T[];
  rowKey: (row: T) => string | number;
  columns: AdminListColumn<T>[];

  /** 行内操作：PC 末列右对齐；移动端卡片底部 */
  actions?: (row: T) => ReactNode;
  actionsHeader?: ReactNode;
  /** 操作列 th 附加类（宽度，如 w-[13%]） */
  actionsHeaderClassName?: string;

  /** 多选（不传则无选择列/卡片复选框） */
  selectable?: boolean;
  selectedKeys?: Set<string | number>;
  onToggleOne?: (row: T) => void;
  onToggleAll?: () => void;
  allSelected?: boolean;
  /** 部分选中态（表头/移动全选条的横线） */
  indeterminate?: boolean;
  /** 部分行不可选（如自己、已处理申请） */
  isRowSelectable?: (row: T) => boolean;
  /** 是否显示表头选择框（用户页仅超管显示） */
  showHeaderCheckbox?: boolean;
  /** PC 端自定义表头选择控件（如 Square/SquareCheck 图标按钮），默认原生 checkbox */
  renderHeaderSelection?: () => ReactNode;
  /** PC 端自定义行选择控件；默认原生 checkbox */
  renderRowSelection?: (row: T) => ReactNode;
  /** 移动端全选条文案（全选条仅在 selectable 时出现） */
  selectAllLabel?: ReactNode;
  selectedCountLabel?: ReactNode;
  checkboxAriaLabel?: (row: T) => string;

  /** 空态（两种布局共用） */
  empty?: ReactNode;

  /** 样式透传（保持各页 PC 原样） */
  tableClassName?: string;
  tableHeadClassName?: string;
  headRowClassName?: string;
  /** 表头/单元格基础内边距（部分页面为 px-3 py-2） */
  headerCellBaseClassName?: string;
  cellBaseClassName?: string;
  /** 表头文字附加类（个别页面表头由 thead 统一控制，传 "" 去除） */
  headerCellTextClassName?: string;
  /** 选择列 th/td 类（默认 w-[4%] / 空） */
  selectionHeaderClassName?: string;
  /** 操作按钮容器类（默认右对齐 flex justify-end gap-1） */
  actionsContainerClassName?: string;
  rowClassName?: string | ((row: T) => string);
  /** 移动端卡片列表容器附加类（默认 p-3 space-y-3，适配 CardContent p-0） */
  mobileContainerClassName?: string;
  /** 移动端卡片标题（必填：卡片主标识，如用户名/活动名） */
  mobileTitle: (row: T) => ReactNode;
  /** 移动端卡片右上角徽标（状态/角色等） */
  mobileBadge?: (row: T) => ReactNode;
}

export function AdminList<T>({
  rows,
  rowKey,
  columns,
  actions,
  actionsHeader,
  actionsHeaderClassName,
  selectable = false,
  selectedKeys,
  onToggleOne,
  onToggleAll,
  allSelected = false,
  indeterminate = false,
  isRowSelectable,
  showHeaderCheckbox = true,
  selectAllLabel,
  selectedCountLabel,
  checkboxAriaLabel,
  empty,
  tableClassName = "w-full text-sm",
  tableHeadClassName = "border-b border-border bg-muted/30",
  headRowClassName = "text-left",
  headerCellBaseClassName = "px-3 py-3",
  cellBaseClassName = "px-3 py-3",
  headerCellTextClassName = "font-medium text-muted-foreground",
  selectionHeaderClassName = "w-[4%]",
  actionsContainerClassName = "flex justify-end gap-1",
  rowClassName = "border-b border-border last:border-0 hover:bg-muted/20 align-top",
  mobileContainerClassName = "p-3 space-y-3",
  mobileTitle,
  mobileBadge,
  renderHeaderSelection,
  renderRowSelection,
}: AdminListProps<T>) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  const rowSelected = (row: T) => !!selectedKeys?.has(rowKey(row));
  const rowSelectable = (row: T) =>
    selectable && (!isRowSelectable || isRowSelectable(row));

  const headerSelectionNode =
    selectable && showHeaderCheckbox && onToggleAll
      ? (renderHeaderSelection?.() ?? (
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = !allSelected && indeterminate;
            }}
            onChange={onToggleAll}
            className="h-4 w-4 accent-primary cursor-pointer"
            aria-label={typeof selectAllLabel === "string" ? selectAllLabel : undefined}
          />
        ))
      : null;

  return (
    <>
      {/* ===== 桌面端（≥768px）：原生表格，结构/样式与旧实现一致 ===== */}
      <div className="hidden md:block">
        <table className={tableClassName}>
          <thead className={tableHeadClassName}>
            <tr className={headRowClassName}>
              {headerSelectionNode && (
                <th className={cn(headerCellBaseClassName, selectionHeaderClassName)}>
                  {headerSelectionNode}
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={cn(headerCellBaseClassName, headerCellTextClassName, c.headerClassName)}>
                  {c.header}
                </th>
              ))}
              {actions && (
                <th className={cn(headerCellBaseClassName, headerCellTextClassName, "text-right", actionsHeaderClassName)}>
                  {actionsHeader}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  typeof rowClassName === "function" ? rowClassName(row) : rowClassName
                )}
              >
                {selectable && (
                  <td className={cellBaseClassName}>
                    {rowSelectable(row)
                      ? (renderRowSelection?.(row) ??
                          (onToggleOne && (
                            <input
                              type="checkbox"
                              checked={rowSelected(row)}
                              onChange={() => onToggleOne(row)}
                              className="h-4 w-4 accent-primary cursor-pointer"
                              aria-label={checkboxAriaLabel?.(row)}
                            />
                          )))
                      : null}
                  </td>
                )}
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      cellBaseClassName,
                      typeof c.cellClassName === "function"
                        ? c.cellClassName(row)
                        : c.cellClassName
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
                {actions && (
                  <td className={cellBaseClassName}>
                    <div className={actionsContainerClassName}>{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== 移动端（<768px）：卡片式，禁止横向滚动 ===== */}
      <div className={cn("md:hidden", mobileContainerClassName)}>
        {selectable && onToggleAll && (
          <div className="flex items-center gap-2 px-1 text-sm">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = !allSelected && indeterminate;
              }}
              onChange={onToggleAll}
              className="h-4 w-4 accent-primary cursor-pointer"
            />
            <span>{selectAllLabel}</span>
            {selectedCountLabel && (
              <span className="ml-auto text-xs text-muted-foreground">
                {selectedCountLabel}
              </span>
            )}
          </div>
        )}

        {rows.map((row) => (
          <AdminListCard
            key={rowKey(row)}
            selected={rowSelected(row)}
            checked={rowSelected(row)}
            onToggle={
              rowSelectable(row) && onToggleOne
                ? () => onToggleOne(row)
                : undefined
            }
            checkboxAriaLabel={checkboxAriaLabel?.(row)}
            title={mobileTitle(row)}
            badge={mobileBadge?.(row)}
            fields={columns
              .filter((c) => c.mobileLabel !== undefined)
              .map((c) => ({
                label: c.mobileLabel as ReactNode,
                value: (c.mobileRender ?? c.render)(row),
                mono: c.mobileMono,
                className: c.mobileFieldClassName,
              }))}
            actions={actions?.(row)}
          />
        ))}
      </div>
    </>
  );
}
