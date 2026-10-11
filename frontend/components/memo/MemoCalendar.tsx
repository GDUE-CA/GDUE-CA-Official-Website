"use client";
/**
 * MemoCalendar - 日历选择器
 *
 * 按月显示；点日期 → 加载当天全部可见 Memo；
 * 高亮有 Memo 的日期。
 */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMemoByDate, getTimeline } from "@/lib/api/memos";
import { cn } from "@/lib/utils";
import type { MemoBriefOut } from "@/types/api";
import { MemoCard } from "./MemoCard";

interface MemoCalendarProps {
  initialDate?: string; // YYYY-MM-DD
  onPickDate?: (date: string) => void;
  onMemoClick?: (memoId: number) => void;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function MemoCalendar({ initialDate, onPickDate, onMemoClick }: MemoCalendarProps) {
  const { t, locale } = useI18n();
  const [view, setView] = useState(() => {
    const d = initialDate ? new Date(initialDate) : new Date();
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  });
  const [picked, setPicked] = useState<string | null>(initialDate ?? null);
  const [pickedItems, setPickedItems] = useState<MemoBriefOut[] | null>(null);
  const [daysWithMemo, setDaysWithMemo] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 拉取整月（page_size=100），把有 memo 的日期写入集合
    const ym = `${view.getUTCFullYear()}-${String(view.getUTCMonth() + 1).padStart(2, "0")}`;
    const start = `${ym}-01`;
    // 计算下月第一天 - 1 天：直接 page_size 200 取一个月范围
    getTimeline({ page: 1, page_size: 200 })
      .then((resp) => {
        const set = new Set<string>();
        for (const m of resp.items) {
          if (m.created_at.slice(0, 7) === ym) {
            set.add(m.created_at.slice(0, 10));
          }
        }
        setDaysWithMemo(set);
      })
      .catch(() => setDaysWithMemo(new Set()));
    void start;
  }, [view]);

  async function pick(date: string) {
    setPicked(date);
    setLoading(true);
    try {
      const r = await getMemoByDate(date);
      setPickedItems(r.items);
      onPickDate?.(date);
    } catch {
      setPickedItems([]);
    } finally {
      setLoading(false);
    }
  }

  function shift(delta: number) {
    const d = new Date(view);
    d.setUTCMonth(d.getUTCMonth() + delta);
    setView(d);
    setPicked(null);
    setPickedItems(null);
  }

  // 渲染当月日历网格
  const first = new Date(view);
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  const startWeekday = first.getUTCDay(); // 0=Sun
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: { date: string | null; day: number | null }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date, day: d });
  }
  // 凑满 6 行
  while (cells.length < 42) cells.push({ date: null, day: null });

  const monthLabel = view.toLocaleDateString(locale, {
    year: "numeric", month: "long", timeZone: "UTC",
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="prev month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium">{monthLabel}</div>
          <Button type="button" variant="ghost" size="icon" onClick={() => shift(1)} aria-label="next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (!c.date) return <div key={i} className="h-9" />;
            const active = picked === c.date;
            const has = daysWithMemo.has(c.date);
            return (
              <button
                key={i}
                type="button"
                onClick={() => pick(c.date!)}
                className={cn(
                  "h-9 rounded text-xs flex flex-col items-center justify-center gap-0.5",
                  active ? "bg-primary text-primary-foreground" :
                    has ? "bg-primary/10 text-foreground hover:bg-primary/20" :
                      "hover:bg-muted text-muted-foreground",
                )}
              >
                <span>{c.day}</span>
                {has && !active && <span className="block h-1 w-1 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {picked && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            {picked} · {loading ? "..." : `${pickedItems?.length ?? 0} 条`}
          </div>
          {pickedItems && pickedItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t("memo.calendar.noMemosOnDay")}
            </p>
          )}
          {pickedItems?.map((m) => (
            <div key={m.id} onClick={() => onMemoClick?.(m.id)}>
              <MemoCard memo={m} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
