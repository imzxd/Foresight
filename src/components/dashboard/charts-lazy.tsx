"use client";

import dynamic from "next/dynamic";

const Skeleton = () => (
  <div className="h-56 animate-pulse rounded-lg bg-info-soft" aria-hidden="true" />
);

/** Recharts is heavy; load it on the client only, after first paint. */
export const MonthlyTrendChart = dynamic(
  () => import("./charts").then((m) => m.MonthlyTrendChart),
  { ssr: false, loading: Skeleton },
);
export const CategoryChart = dynamic(() => import("./charts").then((m) => m.CategoryChart), {
  ssr: false,
  loading: Skeleton,
});
export const SupplierChart = dynamic(() => import("./charts").then((m) => m.SupplierChart), {
  ssr: false,
  loading: Skeleton,
});
export const ForecastChart = dynamic(
  () => import("../forecast/forecast-chart").then((m) => m.ForecastChart),
  { ssr: false, loading: Skeleton },
);
