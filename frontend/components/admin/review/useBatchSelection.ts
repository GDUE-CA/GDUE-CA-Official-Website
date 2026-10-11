/**
 * 批量选择 Hook：复选点选 + Ctrl/Cmd+A 全选 + 全选/取消全选按钮
 * isSelectable 返回 false 的行不可选中（如已签到报名、已处理的密码重置申请）
 */
import { useCallback, useEffect, useMemo, useState } from "react";

export function useBatchSelection<T extends { id: number }>(
  items: T[],
  isSelectable?: (item: T) => boolean
) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const selectableIds = useMemo(
    () => items.filter((i) => !isSelectable || isSelectable(i)).map((i) => i.id),
    [items, isSelectable]
  );

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelected = selectableIds.some((id) => selected.has(id));

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const all = selectableIds.length > 0 && selectableIds.every((id) => prev.has(id));
      return all ? new Set<number>() : new Set(selectableIds);
    });
  }, [selectableIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  /** Ctrl+A / Cmd+A 全选（输入框聚焦时不拦截） */
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
        const el = e.target as HTMLElement | null;
        const tag = el?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
        e.preventDefault();
        toggleAll();
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [toggleAll]);

  return { selected, toggle, toggleAll, clear, allSelected, someSelected, setSelected };
}
