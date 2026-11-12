"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { monthShortLabel } from "@/lib/analytics/periods";
import { formatCents, formatCentsRounded } from "@/lib/utils/money";

const AXIS = { fontSize: 12, fill: "#5b6b70" } as const;
const GRID = "#e2e7e5";
const ACCENT = "#0f766e";
const PALETTE = [
  "#0f766e",
  "#2f8f87",
  "#5fa9a3",
  "#8fc2bd",
  "#b6d8d4",
  "#cfe5e2",
  "#dcebe9",
  "#e8f2f1",
];

const compactMoney = (cents: number) => formatCents(cents, "CAD", { compact: true });

type MonthPoint = { month: string; totalCents: number; partial: boolean };

export function MonthlyTrendChart({ data }: { data: MonthPoint[] }) {
  const rows = data.map((d) => ({
    ...d,
    label: monthShortLabel(d.month) + (d.partial ? "*" : ""),
  }));
  return (
    <div className="h-64" role="img" aria-label="Line chart of monthly recorded invoice expenses">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={compactMoney}
          />
          <Tooltip
            formatter={(v) => formatCents(Number(v))}
            labelFormatter={(l) => String(l).replace("*", " (month in progress)")}
          />
          <Line
            type="monotone"
            dataKey="totalCents"
            name="Invoiced"
            stroke={ACCENT}
            strokeWidth={2.5}
            dot={{ r: 3, fill: ACCENT }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type Named = { name: string; totalCents: number };

export function CategoryChart({ data }: { data: Named[] }) {
  const total = data.reduce((a, d) => a + d.totalCents, 0) || 1;
  return (
    <div>
      <div className="h-56" role="img" aria-label="Bar chart of expenses by category">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis
              type="number"
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              tickFormatter={compactMoney}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              width={120}
            />
            <Tooltip
              formatter={(v) =>
                `${formatCents(Number(v))} (${Math.round((Number(v) / total) * 100)}%)`
              }
            />
            <Bar dataKey="totalCents" name="Invoiced" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function SupplierChart({ data }: { data: Named[] }) {
  return (
    <div
      className="h-56"
      role="img"
      aria-label="Bar chart of top suppliers by recorded invoice totals"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            tickFormatter={compactMoney}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={130}
            tickFormatter={(n: string) => (n.length > 18 ? `${n.slice(0, 17)}…` : n)}
          />
          <Tooltip formatter={(v) => formatCentsRounded(Number(v))} />
          <Bar dataKey="totalCents" name="Invoiced" fill={ACCENT} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
