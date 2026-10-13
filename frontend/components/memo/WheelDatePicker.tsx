"use client";
/**
 * WheelDatePicker - 移动端滚轮式日期选择器（年 / 月 / 日 三列，滚动吸附）
 *
 * 供 /memo 主页搜索栏的日期按钮唤起（Dialog）：选定后回调 YYYY-MM-DD。
 * 桌面端不使用（桌面端直接展示方块日历 MemoCalendar），断点切换无需刷新。
 *
 * 交互：滚动吸附（snap-mandatory）+ 停止滚动 120ms 后取中心项；
 * 跨列联动（切换月份自动收敛天数）；已选日期时支持在弹窗内直接清除筛选。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

const ITEM_H = 40; // 单项高度 px
const VISIBLE = 5; // 可见项数（奇数）
const PAD_H = ((VISIBLE - 1) / 2) * ITEM_H; // 上下留白，保证首尾项可居中

function daysInMonth(y: number, m: number) {
  // m: 1-12
  return new Date(y, m, 0).getDate();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

interface WheelColumnProps {
  items: string[];
  index: number;
  onChange: (index: number) => void;
}

/** 单列滚轮：受控 index，滚动停止后回调中心项 */
function WheelColumn({ items, index, onChange }: WheelColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userScrolling = useRef(false);

  // index 外部变化（初始化 / 跨列联动 / 收敛）→ 无动画滚到对应位置；用户滚动中不打扰
  useEffect(() => {
    const el = ref.current;
    if (el && !userScrolling.current) {
      el.scrollTop = index * ITEM_H;
    }
  }, [index]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    userScrolling.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      userScrolling.current = false;
      const i = Math.min(
        items.length - 1,
        Math.max(0, Math.round(el.scrollTop / ITEM_H)),
      );
      if (i !== index) onChange(i);
    }, 120);
  }

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="date wheel column"
      onScroll={handleScroll}
      className="h-[200px] overflow-y-auto snap-y snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <div style={{ height: PAD_H }} aria-hidden="true" />
      {items.map((label, i) => (
        <div
          key={i}
          role="option"
          aria-selected={i === index}
          className={cn(
            "h-10 flex items-center justify-center snap-center text-sm select-none transition-colors",
            i === index
              ? "text-foreground font-semibold"
              : "text-muted-foreground/70",
          )}
        >
          {label}
        </div>
      ))}
      <div style={{ height: PAD_H }} aria-hidden="true" />
    </div>
  );
}

interface WheelDatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前已选日期（YYYY-MM-DD），null 表示未筛选 */
  value: string | null;
  /** 确认回调：YYYY-MM-DD；清除时回调 null */
  onConfirm: (date: string | null) => void;
}

export function WheelDatePicker({
  open,
  onOpenChange,
  value,
  onConfirm,
}: WheelDatePickerProps) {
  const { t } = useI18n();

  // 弹窗内的工作副本：打开时按 value（或今天）初始化
  const [y, setY] = useState(2026);
  const [m, setM] = useState(1); // 1-12
  const [d, setD] = useState(1);

  useEffect(() => {
    if (!open) return;
    if (value) {
      const [yy, mm, dd] = value.split("-").map(Number);
      setY(yy);
      setM(mm);
      setD(dd);
    } else {
      const now = new Date();
      setY(now.getFullYear());
      setM(now.getMonth() + 1);
      setD(now.getDate());
    }
  }, [open, value]);

  const years = useMemo(() => {
    const cy = new Date().getFullYear();
    const arr: number[] = [];
    for (let yy = cy - 10; yy <= cy + 1; yy++) arr.push(yy);
    return arr;
  }, []);
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => i + 1),
    [],
  );
  const maxDay = daysInMonth(y, m);
  const days = useMemo(
    () => Array.from({ length: maxDay }, (_, i) => i + 1),
    [maxDay],
  );
  // 收敛：切换月份后选中日不得超过当月天数
  const effDay = Math.min(d, maxDay);

  function confirm() {
    onConfirm(`${y}-${pad2(m)}-${pad2(effDay)}`);
    onOpenChange(false);
  }

  function clear() {
    onConfirm(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{t("memo.dateFilter.title")}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          {/* 中心高亮带（pointer-events-none 纯视觉） */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-10 rounded-md bg-muted/70 border border-border"
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-center text-[10px] text-muted-foreground mb-1">
                {t("memo.dateFilter.year")}
              </div>
              <WheelColumn
                items={years.map(String)}
                index={Math.max(0, years.indexOf(y))}
                onChange={(i) => setY(years[i])}
              />
            </div>
            <div>
              <div className="text-center text-[10px] text-muted-foreground mb-1">
                {t("memo.dateFilter.month")}
              </div>
              <WheelColumn
                items={months.map(pad2)}
                index={m - 1}
                onChange={(i) => setM(i + 1)}
              />
            </div>
            <div>
              <div className="text-center text-[10px] text-muted-foreground mb-1">
                {t("memo.dateFilter.day")}
              </div>
              <WheelColumn
                items={days.map(pad2)}
                index={effDay - 1}
                onChange={(i) => setD(i + 1)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clear}
            >
              {t("memo.dateFilter.clear")}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t("memo.editor.cancel")}
          </Button>
          <Button type="button" size="sm" onClick={confirm}>
            {t("memo.dateFilter.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
