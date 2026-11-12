"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ForecastPoint } from "@/lib/forecast/calc";
import { formatCents } from "@/lib/utils/money";

const AXIS = { fontSize: 12, fill: "#5b6b70" } as const;
const compact = (cents: number) => formatCents(cents, "CAD", { compact: true });

export function ForecastChart({ points }: { points: ForecastPoint[] }) {
  const rows = points.map((p) => ({
    label: `M${p.month}`,
    Scenario: p.projectedCents,
    "Flat spending": p.flatCents,
  }));
  return (
    <div
      className="h-64"
      role="img"
      aria-label="Chart of projected monthly expenses against flat spending"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e2e7e5" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#e2e7e5" }} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={compact}
            domain={[0, "auto"]}
          />
          <Tooltip formatter={(v) => formatCents(Number(v))} />
          <Legend verticalAlign="top" height={28} iconType="plainline" />
          <Line
            type="monotone"
            dataKey="Scenario"
            stroke="#0f766e"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="Flat spending"
            stroke="#8a9aa0"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
