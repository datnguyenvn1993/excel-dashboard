"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { KpiDataset } from "@/types/data";
import { MIEN_ORDER, partnerName, partnerMien } from "@/lib/partners";
import { METRIC_ORDER, metricDef, formatValue, growthPct } from "@/lib/metrics";
import { monthKey, monthLabel } from "@/lib/storage";

interface DashboardProps {
  dataset: KpiDataset | null;
  onImportNew: () => void;
}

interface PartnerMeta {
  id: string;
  name: string;
  mien: string;
}

// value lookup: partnerId -> metric -> month -> value
type Index = Map<string, Map<string, Map<string, number>>>;

const PLACEHOLDER_MONTHS = [
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12",
].map((m) => `${m}/2026`);

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

export default function Dashboard({ dataset, onImportNew }: DashboardProps) {
  const hasData = !!dataset && dataset.rows.length > 0;

  // ── Build lookup + partner metadata ───────────────────────────────────────
  const { index, partners, metricsPresent, allMonths, multiYear } = useMemo(() => {
    const index: Index = new Map();
    const partnerSet = new Set<string>();
    const metricSet = new Set<string>();
    if (dataset) {
      for (const r of dataset.rows) {
        partnerSet.add(r.partnerId);
        metricSet.add(r.metric);
        let byMetric = index.get(r.partnerId);
        if (!byMetric) index.set(r.partnerId, (byMetric = new Map()));
        let byMonth = byMetric.get(r.metric);
        if (!byMonth) byMetric.set(r.metric, (byMonth = new Map()));
        byMonth.set(r.month, r.value);
      }
    }
    const partners: PartnerMeta[] = Array.from(partnerSet).map((id) => ({
      id,
      name: partnerName(id),
      mien: partnerMien(id),
    }));
    const mienRank = (m: string) => {
      const i = (MIEN_ORDER as readonly string[]).indexOf(m);
      return i === -1 ? 999 : i;
    };
    partners.sort(
      (a, b) => mienRank(a.mien) - mienRank(b.mien) || a.name.localeCompare(b.name, "vi")
    );
    const metricsPresent = METRIC_ORDER.filter((m) => metricSet.has(m)).concat(
      Array.from(metricSet).filter((m) => !METRIC_ORDER.includes(m))
    );
    const allMonths = (dataset?.months ?? []).slice();
    const years = new Set(allMonths.map((m) => m.split("/")[1]));
    return { index, partners, metricsPresent, allMonths, multiYear: years.size > 1 };
  }, [dataset]);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [selMiens, setSelMiens] = useState<Set<string>>(new Set());
  const [selPartners, setSelPartners] = useState<Set<string>>(new Set());
  const [selMetrics, setSelMetrics] = useState<Set<string>>(new Set());
  const [startMonth, setStartMonth] = useState<string>("");
  const [endMonth, setEndMonth] = useState<string>("");
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partnerOpen, setPartnerOpen] = useState(false);
  const partnerBoxRef = useRef<HTMLDivElement>(null);

  // Initialise month range when data arrives.
  useEffect(() => {
    if (allMonths.length) {
      setStartMonth(allMonths[0]);
      setEndMonth(allMonths[allMonths.length - 1]);
    }
  }, [allMonths]);

  // Close partner dropdown on outside click.
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (partnerBoxRef.current && !partnerBoxRef.current.contains(e.target as Node)) {
        setPartnerOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Derived visible sets ───────────────────────────────────────────────────
  const visibleMonths = useMemo(() => {
    if (!startMonth || !endMonth) return allMonths;
    const lo = Math.min(monthKey(startMonth), monthKey(endMonth));
    const hi = Math.max(monthKey(startMonth), monthKey(endMonth));
    return allMonths.filter((m) => monthKey(m) >= lo && monthKey(m) <= hi);
  }, [allMonths, startMonth, endMonth]);

  const visibleMiens = useMemo(
    () => (MIEN_ORDER as readonly string[]).filter((m) => partners.some((p) => p.mien === m)),
    [partners]
  );

  const visiblePartners = useMemo(() => {
    return partners.filter((p) => {
      if (selMiens.size && !selMiens.has(p.mien)) return false;
      if (selPartners.size && !selPartners.has(p.id)) return false;
      return true;
    });
  }, [partners, selMiens, selPartners]);

  const visibleMetrics = useMemo(
    () => metricsPresent.filter((m) => selMetrics.size === 0 || selMetrics.has(m)),
    [metricsPresent, selMetrics]
  );

  const filteredPartnerChoices = useMemo(() => {
    const q = partnerSearch.trim().toLowerCase();
    const base = selMiens.size ? partners.filter((p) => selMiens.has(p.mien)) : partners;
    if (!q) return base;
    return base.filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q));
  }, [partners, partnerSearch, selMiens]);

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const lastMonth = visibleMonths[visibleMonths.length - 1];
    let revenue = 0;
    let trips = 0;
    if (lastMonth) {
      for (const p of visiblePartners) {
        const byMetric = index.get(p.id);
        revenue += byMetric?.get("Doanh thu")?.get(lastMonth) ?? 0;
        trips += byMetric?.get("Tổng cuốc")?.get(lastMonth) ?? 0;
      }
    }
    return { lastMonth, revenue, trips, partnerCount: visiblePartners.length };
  }, [visiblePartners, visibleMonths, index]);

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    setter(n);
  };

  // ── CSV export of the current pivot ─────────────────────────────────────────
  const exportCsv = () => {
    const header = [
      "Tên hãng",
      "Miền",
      "Chỉ số",
      ...visibleMonths.map((m) => monthLabel(m, multiYear)),
    ];
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [header.map(esc).join(",")];
    for (const p of visiblePartners) {
      const byMetric = index.get(p.id);
      for (const metric of visibleMetrics) {
        const byMonth = byMetric?.get(metric);
        const cells = visibleMonths.map((m) => {
          const v = byMonth?.get(m);
          return v === undefined ? "" : String(v);
        });
        lines.push([esc(p.name), esc(p.mien), esc(metric), ...cells].join(","));
      }
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bao-cao-kpi-partner.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Columns for display (fallback to placeholder when empty).
  const monthCols = hasData ? visibleMonths : PLACEHOLDER_MONTHS;
  const monthColsMultiYear = hasData ? multiYear : false;

  const selectCls =
    "text-xs px-2 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 focus:outline-none focus:border-emerald-500 disabled:opacity-50 disabled:bg-gray-100";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 border-b shadow-sm px-4 sm:px-6 py-3"
        style={{ background: "#27BDBE", borderColor: "#22a7a8" }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold uppercase tracking-wide text-white">
              📊 Báo cáo KPI theo Partner
            </h1>
            <p className="text-xs text-cyan-50 mt-0.5">
              {hasData
                ? `${summary.partnerCount} hãng · ${visibleMonths.length} tháng${
                    dataset ? ` · ${dataset.fileName}` : ""
                  }`
                : "Chưa có dữ liệu — bấm Import file để bắt đầu"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasData && (
              <button
                onClick={exportCsv}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/15 hover:bg-white/25 text-white border border-white/30"
              >
                ⬇ Xuất CSV
              </button>
            )}
            <button
              onClick={onImportNew}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-teal-700 hover:bg-cyan-50 shadow-sm"
            >
              ⬆ Import file
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 space-y-4">
        {/* ── Summary cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Số hãng", value: hasData ? String(summary.partnerCount) : "--" },
            { label: "Số tháng", value: hasData ? String(visibleMonths.length) : "--" },
            {
              label: `Doanh thu ${summary.lastMonth ? "T" + parseInt(summary.lastMonth) : "tháng cuối"}`,
              value: hasData ? formatValue(summary.revenue, "vnd") : "--",
            },
            {
              label: `Tổng cuốc ${summary.lastMonth ? "T" + parseInt(summary.lastMonth) : "tháng cuối"}`,
              value: hasData ? formatValue(summary.trips, "int") : "--",
            },
          ].map((c) => (
            <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 truncate">
                {c.label}
              </div>
              <div className="text-lg font-bold text-gray-800 truncate">{c.value}</div>
            </div>
          ))}
        </div>

        {/* ── Filter bar ────────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-wrap items-center gap-3">
          {/* Miền */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-500">Miền:</span>
            <button
              disabled={!hasData}
              onClick={() => setSelMiens(new Set())}
              className={`px-2 py-1 text-xs rounded-md border ${
                selMiens.size === 0
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "border-gray-300 text-gray-600 hover:border-gray-400"
              } disabled:opacity-50`}
            >
              Tất cả
            </button>
            {(hasData ? visibleMiens : MIEN_ORDER).map((m) => (
              <button
                key={m}
                disabled={!hasData}
                onClick={() => toggle(selMiens, m, setSelMiens)}
                className={`px-2 py-1 text-xs rounded-md border ${
                  selMiens.has(m)
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "border-gray-300 text-gray-600 hover:border-gray-400"
                } disabled:opacity-50`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Partner multi-select */}
          <div className="relative" ref={partnerBoxRef}>
            <button
              disabled={!hasData}
              onClick={() => setPartnerOpen((v) => !v)}
              className={`${selectCls} min-w-[150px] text-left flex items-center justify-between gap-2`}
            >
              <span>{selPartners.size === 0 ? "Tất cả hãng" : `${selPartners.size} hãng đã chọn`}</span>
              <span className="text-gray-400">▾</span>
            </button>
            {partnerOpen && hasData && (
              <div className="absolute z-40 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
                <input
                  value={partnerSearch}
                  onChange={(e) => setPartnerSearch(e.target.value)}
                  placeholder="Tìm hãng..."
                  className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-md mb-2 focus:outline-none focus:border-emerald-500"
                />
                <div className="flex items-center justify-between mb-1 px-1">
                  <button
                    onClick={() => setSelPartners(new Set())}
                    className="text-[11px] text-emerald-600 hover:underline"
                  >
                    Bỏ chọn tất cả
                  </button>
                  <span className="text-[11px] text-gray-400">{filteredPartnerChoices.length} hãng</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredPartnerChoices.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 px-1 py-1 text-xs hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selPartners.has(p.id)}
                        onChange={() => toggle(selPartners, p.id, setSelPartners)}
                      />
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto text-[10px] text-gray-400 shrink-0">{p.mien}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Month range */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Từ</span>
            <select
              disabled={!hasData}
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
              className={selectCls}
            >
              {allMonths.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m, multiYear)} ({m})
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">đến</span>
            <select
              disabled={!hasData}
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              className={selectCls}
            >
              {allMonths.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m, multiYear)} ({m})
                </option>
              ))}
            </select>
          </div>

          {/* Metric reset */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Chỉ số:</span>
            <button
              disabled={!hasData}
              onClick={() => setSelMetrics(new Set())}
              className={`px-2 py-1 text-xs rounded-md border ${
                selMetrics.size === 0
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "border-gray-300 text-gray-600 hover:border-gray-400"
              } disabled:opacity-50`}
            >
              Tất cả ({metricsPresent.length})
            </button>
          </div>
        </div>

        {/* Metric chips */}
        {hasData && (
          <div className="flex flex-wrap gap-1.5">
            {metricsPresent.map((m) => (
              <button
                key={m}
                onClick={() => toggle(selMetrics, m, setSelMetrics)}
                className={`px-2 py-0.5 text-[11px] rounded-full border ${
                  selMetrics.size === 0 || selMetrics.has(m)
                    ? "bg-teal-50 border-teal-300 text-teal-700"
                    : "bg-white border-gray-200 text-gray-400"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {/* ── Pivot table ───────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table className="text-xs border-collapse">
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-100 text-gray-600">
                  <th className="sticky left-0 z-10 bg-gray-100 text-left px-3 py-2 font-semibold border-b border-r border-gray-200 min-w-[180px]">
                    Tên hãng
                  </th>
                  <th className="text-left px-3 py-2 font-semibold border-b border-r border-gray-200 min-w-[90px]">
                    Miền
                  </th>
                  <th className="text-left px-3 py-2 font-semibold border-b border-r border-gray-200 min-w-[210px]">
                    Chỉ số
                  </th>
                  {monthCols.map((m) => (
                    <th
                      key={m}
                      className="text-right px-3 py-2 font-semibold border-b border-gray-200 min-w-[88px] whitespace-nowrap"
                    >
                      {monthLabel(m, monthColsMultiYear)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!hasData ? (
                  METRIC_ORDER.slice(0, 5).map((metric, i) => (
                    <tr key={metric} className={i % 2 ? "bg-gray-50/50" : ""}>
                      {i === 0 && (
                        <>
                          <td
                            rowSpan={5}
                            className="sticky left-0 bg-white px-3 py-2 border-r border-gray-200 align-top text-gray-300"
                          >
                            —
                          </td>
                          <td
                            rowSpan={5}
                            className="px-3 py-2 border-r border-gray-200 align-top text-gray-300"
                          >
                            —
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2 border-r border-gray-200 text-gray-400">{metric}</td>
                      {monthCols.map((m) => (
                        <td key={m} className="px-3 py-2 text-right text-gray-300">
                          --
                        </td>
                      ))}
                    </tr>
                  ))
                ) : visiblePartners.length === 0 || visibleMetrics.length === 0 ? (
                  <tr>
                    <td colSpan={3 + monthCols.length} className="px-4 py-10 text-center text-gray-400">
                      Không có dữ liệu khớp bộ lọc.
                    </td>
                  </tr>
                ) : (
                  visiblePartners.map((p, pi) => {
                    const byMetric = index.get(p.id);
                    const rowBg = pi % 2 ? "bg-gray-50/40" : "bg-white";
                    return visibleMetrics.map((metric, mi) => {
                      const def = metricDef(metric);
                      const byMonth = byMetric?.get(metric);
                      const first = mi === 0;
                      return (
                        <tr
                          key={p.id + "|" + metric}
                          className={`${rowBg} ${first ? "border-t-2 border-gray-200" : ""}`}
                        >
                          {first && (
                            <>
                              <td
                                rowSpan={visibleMetrics.length}
                                className={`sticky left-0 z-[1] ${rowBg} px-3 py-2 border-r border-gray-200 align-top font-medium text-gray-800`}
                              >
                                {p.name}
                              </td>
                              <td
                                rowSpan={visibleMetrics.length}
                                className="px-3 py-2 border-r border-gray-200 align-top text-gray-500 whitespace-nowrap"
                              >
                                {p.mien || "—"}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-1.5 border-r border-gray-100 text-gray-600 whitespace-nowrap">
                            {metric}
                          </td>
                          {visibleMonths.map((m, idx) => {
                            const v = byMonth?.get(m);
                            const prev = idx > 0 ? byMonth?.get(visibleMonths[idx - 1]) : undefined;
                            return (
                              <td
                                key={m}
                                className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums"
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

        {!hasData && (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-gray-400 text-sm">Chưa có dữ liệu để hiển thị.</p>
            <button
              onClick={onImportNew}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium"
            >
              ⬆ Import file dữ liệu
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
