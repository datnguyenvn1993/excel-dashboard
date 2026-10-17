// KPI metric definitions: display order, number format, and whether a higher
// value is "good" (controls the growth-arrow colour).

export type MetricFormat = "pct" | "vnd" | "vndInt" | "dec1" | "dec2" | "int";

// Cách gộp một chỉ số từ nhiều hãng lên cấp Miền:
// - "sum": cộng dồn (Doanh thu, Tổng cuốc, Số xe...)
// - { weight }: trung bình có trọng số theo chỉ số khác của từng hãng
//   (vd. AR/Hủy/Rating theo Tổng cuốc, chỉ số "mỗi TX" theo Số xe vận doanh).
export type MetricAgg = "sum" | { weight: string };

const W_TRIPS: MetricAgg = { weight: "Tổng cuốc" };
const W_CARS: MetricAgg = { weight: "Số xe vận doanh TB mỗi ngày" };

export interface MetricDef {
  name: string; // exact "Chỉ số" value from the data
  format: MetricFormat;
  higherIsBetter: boolean;
  agg: MetricAgg;
}

// Order follows the natural order of the source file.
export const METRICS: MetricDef[] = [
  { name: "AR", format: "pct", higherIsBetter: true, agg: W_TRIPS },
  { name: "Hủy", format: "pct", higherIsBetter: false, agg: W_TRIPS },
  { name: "Rating", format: "dec2", higherIsBetter: true, agg: W_TRIPS },
  { name: "Doanh thu", format: "vnd", higherIsBetter: true, agg: "sum" },
  { name: "Tổng cuốc", format: "int", higherIsBetter: true, agg: "sum" },
  { name: "Doanh thu TB mỗi cuốc", format: "vndInt", higherIsBetter: true, agg: W_TRIPS },
  { name: "Doanh thu TB mỗi TX mỗi ngày", format: "vndInt", higherIsBetter: true, agg: W_CARS },
  { name: "Cuốc xe TB mỗi TX mỗi ngày", format: "dec1", higherIsBetter: true, agg: W_CARS },
  { name: "Tỉ lệ hoàn thành cuốc", format: "pct", higherIsBetter: true, agg: W_TRIPS },
  { name: "Tỉ lệ vận doanh trên tổng xe", format: "pct", higherIsBetter: true, agg: W_CARS },
  { name: "Số xe vận doanh TB mỗi ngày", format: "dec1", higherIsBetter: true, agg: "sum" },
  // Số tài xế hoạt động trong tháng của hãng → cộng dồn khi gộp theo miền.
  { name: "TX active", format: "int", higherIsBetter: true, agg: "sum" },
  { name: "Số giờ trực tuyến TB mỗi TX mỗi ngày", format: "dec1", higherIsBetter: true, agg: W_CARS },
  { name: "Số giờ vận doanh TB mỗi TX mỗi ngày", format: "dec1", higherIsBetter: true, agg: W_CARS },
];

export const METRIC_ORDER: string[] = METRICS.map((m) => m.name);

const METRIC_BY_NAME: Record<string, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.name, m])
);

const METRIC_BY_LOWER: Record<string, string> = Object.fromEntries(
  METRICS.map((m) => [m.name.toLowerCase(), m.name])
);

/** Chuẩn hóa tên chỉ số theo danh sách METRICS, không phân biệt hoa/thường ("TX Active" → "TX active"). */
export function canonicalMetric(name: string): string {
  const t = name.trim();
  return METRIC_BY_LOWER[t.toLowerCase()] ?? t;
}

export function metricDef(name: string): MetricDef {
  return METRIC_BY_NAME[name] ?? { name, format: "dec1", higherIsBetter: true, agg: W_TRIPS };
}

/**
 * Gộp giá trị một chỉ số của nhiều hãng (cùng tháng) thành một số.
 * `get(partnerId, metric)` trả giá trị của hãng; bỏ qua hãng thiếu dữ liệu.
 * Trung bình có trọng số rơi về trung bình thường nếu không hãng nào có trọng số.
 */
export function aggregateMetric(
  metric: string,
  partnerIds: string[],
  get: (partnerId: string, metric: string) => number | undefined
): number | undefined {
  const { agg } = metricDef(metric);
  let sum = 0;
  let n = 0;
  if (agg === "sum") {
    for (const id of partnerIds) {
      const v = get(id, metric);
      if (v !== undefined) {
        sum += v;
        n++;
      }
    }
    return n ? sum : undefined;
  }
  let wSum = 0;
  let wvSum = 0;
  for (const id of partnerIds) {
    const v = get(id, metric);
    if (v === undefined) continue;
    sum += v;
    n++;
    const w = get(id, agg.weight);
    if (w !== undefined && w > 0) {
      wSum += w;
      wvSum += w * v;
    }
  }
  if (!n) return undefined;
  return wSum > 0 ? wvSum / wSum : sum / n;
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
