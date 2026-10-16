"use client";

import { useMemo, useState } from "react";
import { metricDef, formatValue, growthPct } from "@/lib/metrics";
import { monthLabel } from "@/lib/storage";

export interface PivotRow {
  key: string;
  label: string;
  sub: string; // cột thứ 2 (Miền / Số hãng)
  href?: string; // nếu có: tên là link mở tab mới
}

interface PivotTableProps {
  title: string;
  labelHeader: string;
  subHeader: string;
  rows: PivotRow[];
  metrics: string[];
  months: string[]; // thứ tự hiển thị (mới nhất bên trái)
  multiYear: boolean;
  getValue: (rowKey: string, metric: string, month: string) => number | undefined;
  placeholder?: boolean; // chưa có dữ liệu → hiển thị khung trống
  sortable?: boolean; // mặc định true
}

type SortDir = "desc" | "asc";
type SortState = { col: "label" } | { col: "month"; month: string };

function GrowthArrow({
  cur,
  prev,
  higherIsBetter,
}: {
  cur: number | undefined;
  prev: number | undefined;
  higherIsBetter: boolean;
}) {
  const g = growthPct(cur, prev);
  // Hide arrows that would round to 0% to keep the grid readable.
  if (g === null || Math.abs(g) < 0.5) return null;
  const up = g > 0;
  const good = up === higherIsBetter;
  const color = good ? "text-emerald-600" : "text-red-500";
  return (
    <span className={`ml-1 text-[10px] font-semibold ${color}`}>
      {up ? "▲" : "▼"}
      {Math.abs(g).toFixed(0)}%
    </span>
  );
}

export default function PivotTable({
  title,
  labelHeader,
  subHeader,
  rows,
  metrics,
  months,
  multiYear,
  getValue,
  placeholder,
  sortable = true,
}: PivotTableProps) {
  const canSort = sortable && !placeholder;
  const [sort, setSort] = useState<SortState | null>(null);
  const [dir, setDir] = useState<SortDir>("desc");
  const [sortMetricRaw, setSortMetric] = useState<string>("");

  // Chỉ số dùng để sắp xếp theo cột tháng (mặc định: Doanh thu nếu có).
  const sortMetric = metrics.includes(sortMetricRaw)
    ? sortMetricRaw
    : metrics.includes("Doanh thu")
      ? "Doanh thu"
      : metrics[0] ?? "";

  const clickHeader = (next: SortState) => {
    const same =
      sort &&
      sort.col === next.col &&
      (next.col === "label" || (sort.col === "month" && sort.month === next.month));
    if (!same) {
      setSort(next);
      setDir(next.col === "label" ? "asc" : "desc");
    } else if (dir === (next.col === "label" ? "asc" : "desc")) {
      setDir(dir === "asc" ? "desc" : "asc");
    } else {
      setSort(null); // lần bấm thứ 3: bỏ sắp xếp
    }
  };

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const sign = dir === "asc" ? 1 : -1;
    const out = rows.slice();
    if (sort.col === "label") {
      out.sort((a, b) => sign * a.label.localeCompare(b.label, "vi"));
    } else {
      out.sort((a, b) => {
        const va = getValue(a.key, sortMetric, sort.month);
        const vb = getValue(b.key, sortMetric, sort.month);
        // Hàng thiếu dữ liệu luôn xuống cuối.
        if (va === undefined && vb === undefined) return 0;
        if (va === undefined) return 1;
        if (vb === undefined) return -1;
        return sign * (va - vb);
      });
    }
    return out;
  }, [rows, sort, dir, sortMetric, getValue]);

  const arrow = (active: boolean) =>
    active ? (dir === "asc" ? " ▲" : " ▼") : <span className="text-gray-300"> ⇅</span>;

  const th =
    "px-3 py-2 font-semibold border-b border-gray-200 text-center whitespace-nowrap";

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-3 py-2 border-b border-gray-200">
        <h2 className="text-sm font-bold text-gray-700">{title}</h2>
        {canSort && metrics.length > 1 && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            Sắp xếp cột tháng theo
            <select
              value={sortMetric}
              onChange={(e) => setSortMetric(e.target.value)}
              className="text-xs px-2 py-1 rounded-lg border border-gray-300 bg-white text-gray-700 focus:outline-none focus:border-emerald-500"
            >
              {metrics.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="text-xs border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-gray-100 text-gray-600">
              <th
                onClick={() => canSort && clickHeader({ col: "label" })}
                className={`${th} sticky left-0 z-10 bg-gray-100 border-r min-w-[180px] ${canSort ? "cursor-pointer select-none hover:bg-gray-200" : ""}`}
              >
                {labelHeader}
                {canSort && arrow(sort?.col === "label")}
              </th>
              <th className={`${th} border-r min-w-[90px]`}>{subHeader}</th>
              <th className={`${th} border-r min-w-[210px]`}>Chỉ số</th>
              {months.map((m) => {
                const active = sort?.col === "month" && sort.month === m;
                return (
                  <th
                    key={m}
                    onClick={() => canSort && clickHeader({ col: "month", month: m })}
                    title={!canSort ? undefined : `Sắp xếp theo ${sortMetric} ${m}`}
                    className={`${th} min-w-[96px] ${canSort ? "cursor-pointer select-none hover:bg-gray-200" : ""} ${
                      active ? "text-teal-700" : ""
                    }`}
                  >
                    {monthLabel(m, multiYear)}
                    {canSort && arrow(active)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {placeholder ? (
              metrics.slice(0, 5).map((metric, i) => (
                <tr key={metric} className={i % 2 ? "bg-gray-50/50" : ""}>
                  {i === 0 && (
                    <>
                      <td
                        rowSpan={Math.min(5, metrics.length)}
                        className="sticky left-0 bg-white px-3 py-2 border-r border-gray-200 text-center align-middle text-gray-300"
                      >
                        —
                      </td>
                      <td
                        rowSpan={Math.min(5, metrics.length)}
                        className="px-3 py-2 border-r border-gray-200 text-center align-middle text-gray-300"
                      >
                        —
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2 border-r border-gray-200 text-center text-gray-400">{metric}</td>
                  {months.map((m) => (
                    <td key={m} className="px-3 py-2 text-center text-gray-300">
                      --
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedRows.length === 0 || metrics.length === 0 ? (
              <tr>
                <td colSpan={3 + months.length} className="px-4 py-10 text-center text-gray-400">
                  Không có dữ liệu khớp bộ lọc.
                </td>
              </tr>
            ) : (
              sortedRows.map((r, ri) => {
                const rowBg = ri % 2 ? "bg-gray-50/40" : "bg-white";
                return metrics.map((metric, mi) => {
                  const def = metricDef(metric);
                  const first = mi === 0;
                  const isSortMetric = sort?.col === "month" && metric === sortMetric;
                  return (
                    <tr
                      key={r.key + "|" + metric}
                      className={`${rowBg} ${first ? "border-t-2 border-gray-200" : ""}`}
                    >
                      {first && (
                        <>
                          <td
                            rowSpan={metrics.length}
                            className={`sticky left-0 z-[1] ${rowBg} px-3 py-2 border-r border-gray-200 text-center align-middle font-medium text-gray-800`}
                          >
                            {r.href ? (
                              <a
                                href={r.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Mở phân tích chi tiết trong tab mới"
                                className="text-teal-700 hover:underline"
                              >
                                {r.label} ↗
                              </a>
                            ) : (
                              r.label
                            )}
                          </td>
                          <td
                            rowSpan={metrics.length}
                            className="px-3 py-2 border-r border-gray-200 text-center align-middle text-gray-500 whitespace-nowrap"
                          >
                            {r.sub || "—"}
                          </td>
                        </>
                      )}
                      <td
                        className={`px-3 py-1.5 border-r border-gray-100 text-center whitespace-nowrap ${
                          isSortMetric ? "text-teal-700 font-semibold" : "text-gray-600"
                        }`}
                      >
                        {metric}
                      </td>
                      {months.map((m, idx) => {
                        const v = getValue(r.key, metric, m);
                        // Tháng liền trước (theo thời gian) nằm ở cột bên phải.
                        const prevMonth = months[idx + 1];
                        const prev = prevMonth ? getValue(r.key, metric, prevMonth) : undefined;
                        return (
                          <td
                            key={m}
                            className="px-3 py-1.5 text-center whitespace-nowrap tabular-nums"
                          >
                            <span className="text-gray-800">{formatValue(v, def.format)}</span>
                            <GrowthArrow cur={v} prev={prev} higherIsBetter={def.higherIsBetter} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                });
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
