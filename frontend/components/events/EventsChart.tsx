"use client";

/**
 * EventsChart - 活动参与人数统计（单系列横向条形图）
 *
 * 按 dataviz 规范：
 * - 横向条形：活动名在类目轴上按宽度折成最多两行（超长时末尾省略，完整名称见悬停与列表）
 * - 单系列无图例（标题即说明）；数据色 --chart-1 经校验脚本在浅 / 深面板底色上均通过
 * - 条宽 <= 20px，数据端 4px 圆角、基线端直角；网格为 1px 实线且只保留数值方向
 * - 悬停显示逐条数值；下方活动列表即表格视图
 * - 无活动数据时显示灰色「暂无数据」空状态（后端不可用降级为空列表时同样适用）
 */
import { useSyncExternalStore } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useI18n } from "@/i18n/provider";
import type { ClubEvent } from "@/types/api";

interface EventsChartProps {
  events: ClubEvent[];
}

const ROW_HEIGHT = 44;
const TICK_FONT = 12;

/** 窄屏（< 640px）时收窄类目轴 */
function useIsNarrow() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(max-width: 639px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(max-width: 639px)").matches,
    () => false
  );
}

/** 按可用宽度把名称折成至多两行（中日文按字宽估算，西文字符按半宽） */
function wrapLabel(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  let width = 0;
  for (const ch of text) {
    const w = /[\u0000-\u00ff]/.test(ch) ? TICK_FONT * 0.55 : TICK_FONT;
    if (width + w > maxWidth && line) {
      lines.push(line);
      line = "";
      width = 0;
      if (lines.length === 2) break;
    }
    line += ch;
    width += w;
  }
  if (lines.length < 2 && line) lines.push(line);
  const consumed = lines.join("").length;
  if (consumed < [...text].length) {
    lines[1] = lines[1].slice(0, -1) + "…";
  }
  return lines;
}

interface TickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
  maxWidth: number;
}

function CategoryTick({ x = 0, y = 0, payload, maxWidth }: TickProps) {
  const lines = wrapLabel(payload?.value ?? "", maxWidth);
  const offset = lines.length === 2 ? -7 : 0;
  return (
    <text x={x - 8} y={y + offset} textAnchor="end" dominantBaseline="middle" fontSize={TICK_FONT} fill="hsl(var(--foreground))">
      {lines.map((l, i) => (
        <tspan key={i} x={x - 8} dy={i === 0 ? 0 : 15}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

export function EventsChart({ events }: EventsChartProps) {
  const { t } = useI18n();
  const narrow = useIsNarrow();
  const axisWidth = narrow ? 128 : 220;

  if (events.length === 0) {
    return (
      <div className="flex h-40 w-full items-center justify-center text-sm text-muted-foreground">
        {t("events.empty")}
      </div>
    );
  }

  const data = events.map((e) => {
    const key = `home.events.items.${e.slug}.title`;
    const title = t(key);
    return {
      name: title === key ? e.title : title,
      participants: e.participants,
    };
  });

  return (
    <div className="w-full" style={{ height: data.length * ROW_HEIGHT + 40 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          barCategoryGap={0}
        >
          <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeWidth={1} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v: number) => v.toLocaleString("en-us")}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={axisWidth}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={<CategoryTick maxWidth={axisWidth - 12} />}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--secondary))" }}
            formatter={(value) => [Number(value).toLocaleString("en-us"), t("common.participants")]}
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "10px",
              fontSize: "13px",
              color: "hsl(var(--popover-foreground))",
            }}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            itemStyle={{ color: "hsl(var(--muted-foreground))" }}
          />
          <Bar
            dataKey="participants"
            fill="hsl(var(--chart-1))"
            maxBarSize={20}
            radius={[0, 4, 4, 0]}
            name={t("common.participants")}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
