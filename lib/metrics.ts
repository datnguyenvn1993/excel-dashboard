// KPI metric definitions: display order, number format, and whether a higher
// value is "good" (controls the growth-arrow colour).

export type MetricFormat = "pct" | "vnd" | "vndInt" | "dec1" | "dec2" | "int";

export interface MetricDef {
  name: string; // exact "Chỉ số" value from the data
  format: MetricFormat;
  higherIsBetter: boolean;
}

// Order follows the natural order of the source file.
export const METRICS: MetricDef[] = [
  { name: "AR", format: "pct", higherIsBetter: true },
  { name: "Hủy", format: "pct", higherIsBetter: false },
  { name: "Rating", format: "dec2", higherIsBetter: true },
  { name: "Doanh thu", format: "vnd", higherIsBetter: true },
  { name: "Tổng cuốc", format: "int", higherIsBetter: true },
  { name: "Doanh thu TB mỗi cuốc", format: "vndInt", higherIsBetter: true },
  { name: "Doanh thu TB mỗi TX mỗi ngày", format: "vndInt", higherIsBetter: true },
  { name: "Cuốc xe TB mỗi TX mỗi ngày", format: "dec1", higherIsBetter: true },
  { name: "Tỉ lệ hoàn thành cuốc", format: "pct", higherIsBetter: true },
  { name: "Tỉ lệ vận doanh trên tổng xe", format: "pct", higherIsBetter: true },
  { name: "Số xe vận doanh TB mỗi ngày", format: "dec1", higherIsBetter: true },
  { name: "Số giờ trực tuyến TB mỗi TX mỗi ngày", format: "dec1", higherIsBetter: true },
  { name: "Số giờ vận doanh TB mỗi TX mỗi ngày", format: "dec1", higherIsBetter: true },
];

export const METRIC_ORDER: string[] = METRICS.map((m) => m.name);

const METRIC_BY_NAME: Record<string, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.name, m])
);

export function metricDef(name: string): MetricDef {
  return METRIC_BY_NAME[name] ?? { name, format: "dec1", higherIsBetter: true };
}

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("vi-VN", { minimumFractionDigits: min, maximumFractionDigits: max });

/** Format a raw metric value for display, by metric format. */
export function formatValue(value: number | null | undefined, format: MetricFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  switch (format) {
    case "pct":
      // Stored as a 0..1 ratio.
      return (value * 100).toFixed(1) + "%";
    case "vnd": {
      // Large money: Tỉ / Tr / K.
      const abs = Math.abs(value);
      if (abs >= 1e9) return (value / 1e9).toFixed(2) + " Tỉ";
      if (abs >= 1e6) return (value / 1e6).toFixed(1) + " Tr";
      if (abs >= 1e3) return (value / 1e3).toFixed(1) + " K";
      return nf(0, 0).format(value);
    }
    case "vndInt":
      return nf(0, 0).format(Math.round(value));
    case "dec1":
      return nf(1, 1).format(value);
    case "dec2":
      return nf(2, 2).format(value);
    case "int":
      return nf(0, 0).format(Math.round(value));
    default:
      return String(value);
  }
}

/** Relative month-over-month change, as a percentage (null if no baseline). */
export function growthPct(curr: number | undefined, prev: number | undefined): number | null {
  if (curr === undefined || prev === undefined) return null;
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}
