"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatValue } from "@/lib/metrics";
import { PeriodKind, periodLabel, periodRange } from "@/lib/period";

const C_REVENUE = "#2a78d6";
const C_TRIPS = "#eb6834";
const INK = "#374151";
const INK_MUTED = "#6b7280";
const GRID = "#e5e7eb";

interface RegionOverviewProps {
  months: string[]; // các kỳ, tăng dần theo thời gian
  multiYear: boolean;
  kind?: PeriodKind;
  miens: string[]; // thứ tự hiển thị
  // Tổng một chỉ số (cộng dồn) của các hãng đang lọc thuộc miền, trong tháng.
  sumFor: (mien: string, metric: string, month: string) => number | undefined;
}

type Point = { mien: string; revenue?: number; trips?: number };

const fmtRevenue = (v: unknown) => formatValue(typeof v === "number" ? v : undefined, "vnd");
const fmtTrips = (v: unknown) => formatValue(typeof v === "number" ? v : undefined, "int");

// Nhãn một dòng, căn giữa trên đầu cột / điểm.
// halo: viền trắng quanh chữ để không bị đè bởi đường / cột phía sau.
function valueLabel(format: (v: unknown) => string, color: string, dy: number, halo = true) {
  // eslint-disable-next-line react/display-name
  return (props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) => {
    if (props.value === undefined || props.value === null) return null;
    const x = Number(props.x ?? 0) + Number(props.width ?? 0) / 2;
    const y = Number(props.y ?? 0) + dy;
    return (
      <text
        x={x}
        y={y}
        textAnchor="middle"
        fill={color}
        fontSize={11}
        fontWeight={600}
        stroke={halo ? "#fff" : undefined}
        strokeWidth={halo ? 3 : undefined}
        paintOrder="stroke"
      >
        {format(props.value)}
      </text>
    );
  };
}

export default function RegionOverview({
  months,
  multiYear,
  miens,
  sumFor,
  kind = "month",
}: RegionOverviewProps) {
  const latest = months[months.length - 1] ?? "";
  const [month, setMonth] = useState(latest);

  // Mặc định tháng mới nhất; giữ lựa chọn nếu tháng đó vẫn còn trong dữ liệu.
  useEffect(() => {
    if (!months.includes(month)) setMonth(latest);
  }, [months, month, latest]);

  const data: Point[] = useMemo(
    () =>
      miens.map((m) => ({
        mien: m,
        revenue: sumFor(m, "Doanh thu", month),
        trips: sumFor(m, "Tổng cuốc", month),
      })),
    [miens, month, sumFor]
  );

  const totalRevenue = data.reduce((s, d) => s + (d.revenue ?? 0), 0);
  const totalTrips = data.reduce((s, d) => s + (d.trips ?? 0), 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-gray-200">
        <div>
          <h2 className="text-sm font-bold text-gray-700">
            Tổng quan theo Miền · {month ? periodLabel(kind, month, multiYear) : "--"}
            {month && kind === "week" && (
              <span className="ml-1 font-normal text-gray-400">({periodRange(kind, month)})</span>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Cột: Doanh thu ({fmtRevenue(totalRevenue)}) · Đường: Tổng cuốc ({fmtTrips(totalTrips)})
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          {kind === "week" ? "Tuần" : "Tháng"}
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 focus:outline-none focus:border-emerald-500"
          >
            {months
              .slice()
              .reverse()
              .map((m) => (
                <option key={m} value={m}>
                  {periodLabel(kind, m, multiYear)} ({periodRange(kind, m)}){m === latest ? " · mới nhất" : ""}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="h-80 px-2 py-3">
        {data.length === 0 ? (
          <p className="text-center text-gray-400 text-sm pt-28">Không có dữ liệu khớp bộ lọc.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 24, right: 16, left: 8, bottom: 0 }}>
              <XAxis
                dataKey="mien"
                tick={{ fill: INK_MUTED, fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
              />
              <YAxis
                yAxisId="rev"
                tickFormatter={fmtRevenue}
                domain={[0, (max: number) => max * 1.5]}
                hide // giá trị đã có nhãn; ẩn trục để không phải đọc 2 thang đo

              />
              <YAxis
                yAxisId="trips"
                orientation="right"
                tickFormatter={fmtTrips}
                domain={[0, (max: number) => max * 1.1]}
                hide

              />
              <Tooltip
                itemStyle={{ color: "#111827" }}
                formatter={(v, name) =>
                  name === "Doanh thu" ? [fmtRevenue(v), name] : [fmtTrips(v), String(name)]
                }
              />
              <Legend wrapperStyle={{ fontSize: 12, color: INK_MUTED }} />
              <Bar
                yAxisId="rev"
                dataKey="revenue"
                name="Doanh thu"
                fill={C_REVENUE}
                radius={[4, 4, 0, 0]}
                maxBarSize={56}
                isAnimationActive={false}
              >
                {/* Nhãn doanh thu nằm trong đầu cột để không đè nhãn tổng cuốc. */}
                <LabelList dataKey="revenue" content={valueLabel(fmtRevenue, "#fff", 16, false)} />
              </Bar>
              <Line
                yAxisId="trips"
                dataKey="trips"
                name="Tổng cuốc"
                stroke={C_TRIPS}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              >
                <LabelList dataKey="trips" content={valueLabel(fmtTrips, C_TRIPS, -10)} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
