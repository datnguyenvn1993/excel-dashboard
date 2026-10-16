"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiDataset } from "@/types/data";
import { fetchServerData, monthLabel } from "@/lib/storage";
import { partnerMien, partnerName } from "@/lib/partners";
import { METRIC_ORDER, formatValue, growthPct, metricDef } from "@/lib/metrics";
import PivotTable from "@/components/PivotTable";

// Palette (categorical slot 1–2) + recessive chart ink.
const C_BLUE = "#2a78d6";
const C_ORANGE = "#eb6834";
const INK_MUTED = "#6b7280";
const GRID = "#e5e7eb";

// 6 chỉ số chính, gom theo mức độ liên quan.
const KEY_METRICS = [
  "Doanh thu",
  "Tổng cuốc",
  "AR",
  "Hủy",
  "Rating",
  "Số xe vận doanh TB mỗi ngày",
];

type Point = { month: string; label: string } & Record<string, number | string | undefined>;

function fmt(metric: string) {
  const f = metricDef(metric).format;
  return (v: unknown) => formatValue(typeof v === "number" ? v : undefined, f);
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      <div className="h-64 mt-3">{children}</div>
    </div>
  );
}

const axisProps = {
  tick: { fill: INK_MUTED, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: GRID },
};

function SingleBar({ data, metric }: { data: Point[]; metric: string }) {
  const f = fmt(metric);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} axisLine={false} width={64} tickFormatter={f} />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
          itemStyle={{ color: "#111827" }}
          formatter={(v) => [f(v), metric]}
          labelFormatter={(_, p) => (p?.[0]?.payload as Point | undefined)?.month ?? ""}
        />
        <Bar dataKey={metric} fill={C_BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Lines({
  data,
  series,
  domain,
}: {
  data: Point[];
  series: { metric: string; color: string }[];
  domain?: [number | "auto", number | "auto"];
}) {
  const f = fmt(series[0].metric);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis
          {...axisProps}
          axisLine={false}
          width={56}
          tickFormatter={f}
          domain={domain ?? ["auto", "auto"]}
        />
        <Tooltip
          itemStyle={{ color: "#111827" }}
          formatter={(v, name) => [fmt(String(name))(v), String(name)]}
          labelFormatter={(_, p) => (p?.[0]?.payload as Point | undefined)?.month ?? ""}
        />
        {series.length > 1 && (
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: INK_MUTED }} />
        )}
        {series.map((s) => (
          <Line
            key={s.metric}
            type="linear"
            dataKey={s.metric}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const partnerId = decodeURIComponent(params.id);
  const [dataset, setDataset] = useState<KpiDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchServerData(partnerId)
      .then((d) => alive && setDataset(d))
      .catch(() => alive && setError("Không tải được dữ liệu từ server."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [partnerId]);

  const name = partnerName(partnerId);
  const mien = partnerMien(partnerId);

  useEffect(() => {
    document.title = `${name} · Phân tích KPI`;
  }, [name]);

  // metric -> month -> value
  const { byMetric, months, multiYear, metrics } = useMemo(() => {
    const byMetric = new Map<string, Map<string, number>>();
    for (const r of dataset?.rows ?? []) {
      if (!byMetric.has(r.metric)) byMetric.set(r.metric, new Map());
      byMetric.get(r.metric)!.set(r.month, r.value);
    }
    const months = dataset?.months ?? [];
    const years = new Set(months.map((m) => m.split("/")[1]));
    const metrics = METRIC_ORDER.filter((m) => byMetric.has(m)).concat(
      Array.from(byMetric.keys()).filter((m) => !METRIC_ORDER.includes(m))
    );
    return { byMetric, months, multiYear: years.size > 1, metrics };
  }, [dataset]);

  const data: Point[] = useMemo(
    () =>
      months.map((m) => {
        const p: Point = { month: m, label: monthLabel(m, multiYear) };
        for (const k of KEY_METRICS) p[k] = byMetric.get(k)?.get(m);
        return p;
      }),
    [months, multiYear, byMetric]
  );

  const getValue = useCallback(
    (_: string, metric: string, month: string) => byMetric.get(metric)?.get(month),
    [byMetric]
  );

  const last = months[months.length - 1];
  const prev = months[months.length - 2];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="sticky top-0 z-30 border-b shadow-sm px-4 sm:px-6 py-3"
        style={{ background: "#27BDBE", borderColor: "#22a7a8" }}
      >
        <h1 className="text-sm sm:text-base font-bold text-white">📈 {name}</h1>
        <p className="text-xs text-cyan-50 mt-0.5">
          {mien || "Chưa rõ miền"}
          {months.length > 0 && ` · ${months[0]} – ${last}`}
        </p>
      </header>

      <main className="p-4 sm:p-6 space-y-6">
        {error && (
          <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}
        {!error && months.length === 0 && (
          <p className="text-center text-gray-400 py-16">Hãng này chưa có dữ liệu.</p>
        )}

        {months.length > 0 && (
          <>
            {/* KPI tiles: tháng gần nhất so với tháng trước */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {KEY_METRICS.map((k) => {
                const def = metricDef(k);
                const v = byMetric.get(k)?.get(last);
                const pv = prev ? byMetric.get(k)?.get(prev) : undefined;
                const g = growthPct(v, pv);
                const good = g !== null && g > 0 === def.higherIsBetter;
                return (
                  <div key={k} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 truncate">
                      {k} · {monthLabel(last, multiYear)}
                    </div>
                    <div className="text-lg font-bold text-gray-800 mt-1">
                      {formatValue(v, def.format)}
                    </div>
                    <div className="text-[11px] mt-0.5 text-gray-500">
                      {g === null ? (
                        "—"
                      ) : (
                        <>
                          <span className={good ? "text-emerald-600" : "text-red-500"}>
                            {g > 0 ? "▲" : "▼"} {Math.abs(g).toFixed(1)}%
                          </span>{" "}
                          so với tháng trước
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <section className="space-y-3">
              <h2 className="text-sm font-bold text-gray-700">1. Quy mô kinh doanh</h2>
              <div className="grid lg:grid-cols-2 gap-4">
                <ChartCard title="Doanh thu" subtitle="Theo tháng">
                  <SingleBar data={data} metric="Doanh thu" />
                </ChartCard>
                <ChartCard title="Tổng cuốc" subtitle="Theo tháng — thường đi cùng chiều doanh thu">
                  <SingleBar data={data} metric="Tổng cuốc" />
                </ChartCard>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-bold text-gray-700">2. Chất lượng phục vụ</h2>
              <div className="grid lg:grid-cols-2 gap-4">
                <ChartCard title="AR và tỉ lệ Hủy" subtitle="Tỉ lệ nhận cuốc (cao là tốt) và tỉ lệ hủy (thấp là tốt)">
                  <Lines
                    data={data}
                    series={[
                      { metric: "AR", color: C_BLUE },
                      { metric: "Hủy", color: C_ORANGE },
                    ]}
                    domain={[0, "auto"]}
                  />
                </ChartCard>
                <ChartCard title="Rating" subtitle="Điểm đánh giá trung bình">
                  <Lines data={data} series={[{ metric: "Rating", color: C_BLUE }]} />
                </ChartCard>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-bold text-gray-700">3. Đội xe</h2>
              <div className="grid lg:grid-cols-2 gap-4">
                <ChartCard title="Số xe vận doanh TB mỗi ngày" subtitle="Năng lực cung — động lực chính của tổng cuốc">
                  <SingleBar data={data} metric="Số xe vận doanh TB mỗi ngày" />
                </ChartCard>
              </div>
            </section>

            <PivotTable
              title="Bảng số liệu đầy đủ"
              labelHeader="Tên hãng"
              subHeader="Miền"
              rows={[{ key: partnerId, label: name, sub: mien }]}
              metrics={metrics}
              months={months.slice().reverse()}
              multiYear={multiYear}
              getValue={getValue}
              sortable={false}
            />
          </>
        )}
      </main>
    </div>
  );
}
