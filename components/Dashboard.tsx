"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { KpiDataset } from "@/types/data";
import { MIEN_ORDER, partnerName, partnerMien } from "@/lib/partners";
import { METRIC_ORDER, formatValue, aggregateMetric } from "@/lib/metrics";
import PivotTable, { PivotRow } from "@/components/PivotTable";
import { formatImportTime, monthKey, monthLabel } from "@/lib/storage";
import { usePartnerDirectory } from "@/lib/usePartnerDirectory";
import AppNav from "@/components/AppNav";
import RegionOverview from "@/components/RegionOverview";

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

export default function Dashboard({ dataset, onImportNew }: DashboardProps) {
  const hasData = !!dataset && dataset.rows.length > 0;
  // Tên/miền nhập thêm ở trang Danh mục partner (DB) — version đổi thì tính lại.
  const { version: dirVersion } = usePartnerDirectory();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, dirVersion]);

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

  // Thứ tự hiển thị cột: tháng gần nhất bên trái.
  const displayMonths = useMemo(() => visibleMonths.slice().reverse(), [visibleMonths]);

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
    let txActive: number | undefined; // undefined = tháng này chưa có chỉ số TX active
    if (lastMonth) {
      for (const p of visiblePartners) {
        const byMetric = index.get(p.id);
        revenue += byMetric?.get("Doanh thu")?.get(lastMonth) ?? 0;
        trips += byMetric?.get("Tổng cuốc")?.get(lastMonth) ?? 0;
        const tx = byMetric?.get("TX active")?.get(lastMonth);
        if (tx !== undefined) txActive = (txActive ?? 0) + tx;
      }
    }
    return { lastMonth, revenue, trips, txActive, partnerCount: visiblePartners.length };
  }, [visiblePartners, visibleMonths, index]);

  // ── Rows + value getters for the two pivot tables ──────────────────────────
  const partnerRows: PivotRow[] = useMemo(
    () =>
      visiblePartners.map((p) => ({
        key: p.id,
        label: p.name,
        sub: p.mien,
        href: `/partner/${encodeURIComponent(p.id)}`,
      })),
    [visiblePartners]
  );
  const getPartnerValue = useCallback(
    (id: string, metric: string, month: string) => index.get(id)?.get(metric)?.get(month),
    [index]
  );

  // Bảng theo Miền: gộp các hãng đang hiển thị (dùng chung bộ lọc).
  // Các hãng đang lọc, gom theo miền (thứ tự MIEN_ORDER).
  const { byMien, miens } = useMemo(() => {
    const byMien = new Map<string, string[]>();
    for (const p of visiblePartners) {
      const k = p.mien || "Chưa rõ miền";
      if (!byMien.has(k)) byMien.set(k, []);
      byMien.get(k)!.push(p.id);
    }
    const order = [...(MIEN_ORDER as readonly string[]), "Chưa rõ miền"];
    const miens = Array.from(byMien.keys()).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return { byMien, miens };
  }, [visiblePartners]);

  // Chart tổng quan: cộng dồn một chỉ số của các hãng trong miền (mọi tháng, không phụ thuộc lọc chỉ số).
  const sumByMien = useCallback(
    (mien: string, metric: string, month: string) =>
      aggregateMetric(metric, byMien.get(mien) ?? [], (id, mt) => index.get(id)?.get(mt)?.get(month)),
    [byMien, index]
  );

  const { mienRows, mienIndex } = useMemo(() => {
    const mienIndex: Index = new Map();
    for (const mien of miens) {
      const ids = byMien.get(mien)!;
      const byMetric = new Map<string, Map<string, number>>();
      for (const metric of visibleMetrics) {
        const byMonth = new Map<string, number>();
        for (const month of visibleMonths) {
          const v = aggregateMetric(metric, ids, (id, mt) => index.get(id)?.get(mt)?.get(month));
          if (v !== undefined) byMonth.set(month, v);
        }
        byMetric.set(metric, byMonth);
      }
      mienIndex.set(mien, byMetric);
    }
    const mienRows: PivotRow[] = miens.map((m) => ({
      key: m,
      label: m,
      sub: `${byMien.get(m)!.length} hãng`,
    }));
    return { mienRows, mienIndex };
  }, [byMien, miens, visibleMetrics, visibleMonths, index]);
  const getMienValue = useCallback(
    (mien: string, metric: string, month: string) => mienIndex.get(mien)?.get(metric)?.get(month),
    [mienIndex]
  );

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    setter(n);
  };

  // Columns for display (fallback to placeholder when empty).
  const monthCols = hasData ? displayMonths : PLACEHOLDER_MONTHS.slice().reverse();
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
            {hasData && formatImportTime(dataset?.uploadedAt) && (
              <p className="text-[11px] text-cyan-50/90 mt-0.5">
                🕒 Import lần cuối: {formatImportTime(dataset?.uploadedAt)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <AppNav active="/" />
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
            {
              label: `Tổng TX active ${summary.lastMonth ? "T" + parseInt(summary.lastMonth) : "tháng cuối"}`,
              value: hasData && summary.txActive !== undefined ? formatValue(summary.txActive, "int") : "--",
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

        {/* ── Tổng quan theo Miền (1 tháng) ─────────────────────────────────── */}
        {hasData && (
          <RegionOverview
            months={allMonths}
            multiYear={multiYear}
            miens={miens}
            sumFor={sumByMien}
          />
        )}

        {/* ── Pivot tables ──────────────────────────────────────────────────── */}
        <PivotTable
          title="Theo Miền"
          labelHeader="Miền"
          subHeader="Số hãng"
          rows={mienRows}
          metrics={hasData ? visibleMetrics : METRIC_ORDER}
          months={monthCols}
          multiYear={monthColsMultiYear}
          getValue={getMienValue}
          placeholder={!hasData}
          csvFileName="bao-cao-kpi-theo-mien.csv"
        />
        <PivotTable
          title="Theo hãng (bấm tên hãng để xem phân tích chi tiết)"
          labelHeader="Tên hãng"
          subHeader="Miền"
          rows={partnerRows}
          metrics={hasData ? visibleMetrics : METRIC_ORDER}
          months={monthCols}
          multiYear={monthColsMultiYear}
          getValue={getPartnerValue}
          placeholder={!hasData}
          csvFileName="bao-cao-kpi-theo-hang.csv"
        />

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
