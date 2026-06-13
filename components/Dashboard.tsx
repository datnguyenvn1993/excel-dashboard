"use client";
import { useState, useMemo, useRef } from "react";
import { ParsedData } from "@/types/data";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DashboardProps {
  data: ParsedData | null;
  onImportNew: () => void;
  onClearData: () => void;
}

type Row = Record<string, unknown>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(val: unknown): string | null {
  const s = String(val ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const d2 = new Date(
      `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
    );
    if (!isNaN(d2.getTime())) return d2.toISOString().slice(0, 10);
  }
  return null;
}

function parseHour(val: unknown): number | null {
  const s = String(val ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getHours();
  const m = s.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\s+(\d{1,2}):\d{2}/);
  if (m) return parseInt(m[1]);
  return null;
}

function getStatusGroup(
  raw: string
): "complete" | "processing" | "cancel" | "other" {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("complete")) return "complete";
  if (s.startsWith("process") || s === "in progress" || s === "inprogress")
    return "processing";
  if (s.startsWith("cancel")) return "cancel";
  return "other";
}

function formatGMV(val: number): string {
  if (val >= 1_000_000_000) return (val / 1_000_000_000).toFixed(2) + " Tỉ";
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + " Tr";
  if (val >= 1_000) return (val / 1_000).toFixed(1) + " K";
  return val.toFixed(0);
}

function fmt(n: number): string {
  return n.toLocaleString("vi-VN");
}

type KPIResult = {
  gmv: number;
  total: number;
  complete: number;
  cancel: number;
  processing: number;
  pctComplete: number;
  pctCancel: number;
  aov: number;
  txActive: number;
  gmvPerTx: number;
  tpd: number;
};

function computeKPIs(rows: Row[]): KPIResult {
  let gmv = 0,
    complete = 0,
    cancel = 0,
    processing = 0;
  const txSet = new Set<string>();
  for (const r of rows) {
    const payStr = String(r["Total Pay Display"] ?? "").replace(/[^0-9.]/g, "");
    const pay = parseFloat(payStr);
    if (!isNaN(pay)) gmv += pay;
    const sg = getStatusGroup(String(r["Status"] ?? ""));
    if (sg === "complete") complete++;
    else if (sg === "cancel") cancel++;
    else if (sg === "processing") processing++;
    const sapId = String(r["Sap Profile Id"] ?? "").trim();
    if (sapId) txSet.add(sapId);
  }
  const total = rows.length;
  const txActive = txSet.size;
  return {
    gmv,
    total,
    complete,
    cancel,
    processing,
    pctComplete: total ? (complete / total) * 100 : 0,
    pctCancel: total ? (cancel / total) * 100 : 0,
    aov: total ? gmv / total : 0,
    txActive,
    gmvPerTx: txActive ? gmv / txActive : 0,
    tpd: txActive ? total / txActive : 0,
  };
}

// ── Screenshot ────────────────────────────────────────────────────────────────

async function captureToClipboard(
  el: HTMLElement,
  isDark: boolean
): Promise<void> {
  const w = window as unknown as Record<string, unknown>;
  if (!w.html2canvas) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src =
        "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  type H2C = (el: HTMLElement, opts: object) => Promise<HTMLCanvasElement>;
  const h2c = w.html2canvas as H2C;
  const canvas = await h2c(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: isDark ? "#111827" : "#f9fafb",
  });
  return new Promise<void>((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve();
        return;
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
      } catch {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "chart.png";
        a.click();
        URL.revokeObjectURL(url);
      }
      resolve();
    }, "image/png");
  });
}

function ScreenshotBtn({
  targetRef,
  isDark,
}: {
  targetRef: { current: HTMLDivElement | null };
  isDark: boolean;
}) {
  const [st, setSt] = useState<"idle" | "busy" | "done">("idle");
  return (
    <button
      onClick={async () => {
        if (!targetRef.current || st === "busy") return;
        setSt("busy");
        await captureToClipboard(targetRef.current, isDark);
        setSt("done");
        setTimeout(() => setSt("idle"), 2000);
      }}
      title="Chụp hình & copy vào clipboard"
      className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
        isDark
          ? "border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 bg-gray-900"
          : "border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 bg-white"
      }`}
    >
      {st === "busy" ? "⏳" : st === "done" ? "✅" : "📷"}{" "}
      {st === "busy" ? "Xử lý..." : st === "done" ? "Đã copy!" : "Chụp hình"}
    </button>
  );
}

// ── KPI Components ────────────────────────────────────────────────────────────

type CE = { text: string; border: string };
const COLOR_MAP: Record<string, { l: CE; d: CE }> = {
  blue:   { l: { text: "text-blue-600",   border: "border-l-blue-500"   }, d: { text: "text-blue-400",   border: "border-l-blue-500"   } },
  green:  { l: { text: "text-green-600",  border: "border-l-green-500"  }, d: { text: "text-green-400",  border: "border-l-green-400"  } },
  red:    { l: { text: "text-red-500",    border: "border-l-red-400"    }, d: { text: "text-red-400",    border: "border-l-red-400"    } },
  orange: { l: { text: "text-orange-500", border: "border-l-orange-400" }, d: { text: "text-orange-400", border: "border-l-orange-400" } },
  purple: { l: { text: "text-purple-600", border: "border-l-purple-500" }, d: { text: "text-purple-400", border: "border-l-purple-400" } },
  gray:   { l: { text: "text-gray-700",   border: "border-l-gray-400"   }, d: { text: "text-gray-300",   border: "border-l-gray-500"   } },
};

function KPICard({
  label,
  value,
  color = "blue",
  isDark,
}: {
  label: string;
  value: string;
  color?: string;
  isDark: boolean;
}) {
  const c = (COLOR_MAP[color] ?? COLOR_MAP.blue)[isDark ? "d" : "l"];
  return (
    <div
      className={`rounded-lg border-l-4 ${c.border} p-3 shadow-sm min-w-0 ${
        isDark
          ? "bg-gray-800 border border-gray-700"
          : "bg-white border border-gray-100"
      }`}
    >
      <div
        className={`text-[10px] font-semibold uppercase tracking-wider mb-1 truncate ${
          isDark ? "text-gray-500" : "text-gray-400"
        }`}
      >
        {label}
      </div>
      <div className={`text-base font-bold ${c.text} truncate`}>{value}</div>
    </div>
  );
}

function KPIRow({ kpi, isDark }: { kpi: KPIResult; isDark: boolean }) {
  const orderCards = [
    { label: "GMV",           value: formatGMV(kpi.gmv),              color: "blue"   },
    { label: "Tổng đơn",     value: fmt(kpi.total),                   color: "gray"   },
    { label: "% Hoàn thành", value: kpi.pctComplete.toFixed(1) + "%", color: "green"  },
    { label: "AOV",           value: fmt(Math.round(kpi.aov)),         color: "purple" },
    { label: "Đơn hủy",      value: fmt(kpi.cancel),                  color: "red"    },
    { label: "% Hủy",        value: kpi.pctCancel.toFixed(1) + "%",   color: "orange" },
    { label: "Processing",   value: fmt(kpi.processing),              color: "blue"   },
  ];
  const txCards = [
    { label: "TX Active",    value: fmt(kpi.txActive),                color: "green"  },
    { label: "GMV/TX",       value: formatGMV(kpi.gmvPerTx),          color: "blue"   },
    { label: "TpD",          value: kpi.tpd.toFixed(1),               color: "purple" },
  ];
  const divider = isDark ? "border-gray-700" : "border-gray-100";
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-2">
        {orderCards.map((c) => (
          <KPICard key={c.label} label={c.label} value={c.value} color={c.color} isDark={isDark} />
        ))}
      </div>
      <div className={`border-t pt-2 ${divider}`}>
        <div className="grid grid-cols-3 gap-2 max-w-sm">
          {txCards.map((c) => (
            <KPICard key={c.label} label={c.label} value={c.value} color={c.color} isDark={isDark} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Dashboard({
  data,
  onImportNew,
  onClearData,
}: DashboardProps) {
  const [isDark, setIsDark] = useState(false);

  const nationalRef = useRef<HTMLDivElement>(null);
  const depotsRef   = useRef<HTMLDivElement>(null);
  const hourlyRef   = useRef<HTMLDivElement>(null);
  const dailyRef    = useRef<HTMLDivElement>(null);

  const computed = useMemo(() => {
    const empty = {
      filteredRows: [] as Row[],
      depots: [] as string[],
      depotRows: {} as Record<string, Row[]>,
      nationalKPI: computeKPIs([]),
      depotKPIs: {} as Record<string, KPIResult>,
      todayDate: "",
      d7Date: "",
      hourlyData: [] as { hour: string; today: number; d7: number }[],
      dailyData: [] as {
        date: string;
        complete: number;
        processing: number;
        cancel: number;
      }[],
    };

    if (!data?.rows.length) return empty;
    const rows = data.rows;

    const dates = rows
      .map((r) => parseDate(r["Create Time"]))
      .filter(Boolean) as string[];

    let filteredRows = rows;
    let maxDate = "";
    let d7Date = "";

    if (dates.length) {
      dates.sort();
      maxDate = dates[dates.length - 1];
      const maxObj = new Date(maxDate + "T00:00:00");

      const d10 = new Date(maxObj);
      d10.setDate(d10.getDate() - 10);
      const d10Str = d10.toISOString().slice(0, 10);
      filteredRows = rows.filter((r) => {
        const d = parseDate(r["Create Time"]);
        return d && d >= d10Str;
      });

      const d7 = new Date(maxObj);
      d7.setDate(d7.getDate() - 7);
      d7Date = d7.toISOString().slice(0, 10);
    }

    const depotSet = new Set<string>();
    for (const r of filteredRows) {
      const depot = String(r["Depot"] ?? "").trim();
      if (depot) depotSet.add(depot);
    }
    const depots = [...depotSet].sort();

    const depotRows: Record<string, Row[]> = {};
    for (const depot of depots) {
      depotRows[depot] = filteredRows.filter(
        (r) => String(r["Depot"] ?? "").trim() === depot
      );
    }

    const nationalKPI = computeKPIs(filteredRows);
    const depotKPIs: Record<string, KPIResult> = {};
    for (const depot of depots) {
      depotKPIs[depot] = computeKPIs(depotRows[depot]);
    }

    // Hourly GMV: today vs D-7
    const todayH: number[] = new Array(24).fill(0);
    const d7H: number[]    = new Array(24).fill(0);
    for (const r of filteredRows) {
      const d = parseDate(r["Create Time"]);
      const h = parseHour(r["Create Time"]);
      if (h === null || h < 0 || h > 23) continue;
      const pay =
        parseFloat(
          String(r["Total Pay Display"] ?? "").replace(/[^0-9.]/g, "")
        ) || 0;
      if (d === maxDate) todayH[h] += pay;
      if (d === d7Date)  d7H[h]   += pay;
    }
    const hourlyData = Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, "0")}h`,
      today: Math.round(todayH[h] / 1_000_000),
      d7:    Math.round(d7H[h]   / 1_000_000),
    }));

    // Daily counts
    const dailyMap: Record<
      string,
      { complete: number; processing: number; cancel: number }
    > = {};
    for (const r of filteredRows) {
      const d = parseDate(r["Create Time"]);
      if (!d) continue;
      if (!dailyMap[d])
        dailyMap[d] = { complete: 0, processing: 0, cancel: 0 };
      const sg = getStatusGroup(String(r["Status"] ?? ""));
      if (sg === "complete")   dailyMap[d].complete++;
      else if (sg === "processing") dailyMap[d].processing++;
      else if (sg === "cancel")     dailyMap[d].cancel++;
    }
    const dailyData = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date: date.slice(5), ...counts }));

    return {
      filteredRows,
      depots,
      depotRows,
      nationalKPI,
      depotKPIs,
      todayDate: maxDate,
      d7Date,
      hourlyData,
      dailyData,
    };
  }, [data]);

  const {
    filteredRows,
    depots,
    depotRows,
    nationalKPI,
    depotKPIs,
    todayDate,
    d7Date,
    hourlyData,
    dailyData,
  } = computed;

  // Theme helpers
  const bg         = isDark ? "bg-gray-900"              : "bg-gray-50";
  const headerBg   = isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200";
  const cardCls    = isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200";
  const textPri    = isDark ? "text-gray-100"            : "text-gray-800";
  const textSec    = isDark ? "text-gray-400"            : "text-gray-500";
  const gridStroke = isDark ? "#374151"                  : "#f0f0f0";
  const tickFill   = isDark ? "#9ca3af"                  : "#6b7280";
  const ttStyle    = isDark
    ? { contentStyle: { background: "#1f2937", border: "1px solid #374151", fontSize: 12, color: "#f3f4f6" } }
    : { contentStyle: { fontSize: 12 } };

  const todayLabel = todayDate
    ? new Date(todayDate + "T00:00:00").toLocaleDateString("vi-VN")
    : "";
  const todayShort = todayDate ? todayDate.slice(5).replace("-", "/") : "—";
  const d7Short    = d7Date    ? d7Date.slice(5).replace("-", "/")    : "—";

  if (!data) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-64 gap-4 ${bg} ${textSec}`}
      >
        <p>Chưa có dữ liệu. Vui lòng upload file Excel.</p>
        <button
          onClick={onImportNew}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          Upload File
        </button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bg}`}>
      {/* ── Sticky Header ── */}
      <div
        className={`sticky top-0 z-20 border-b ${headerBg} px-6 py-3 shadow-sm`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1
              className={`text-sm font-bold uppercase tracking-wide flex items-center gap-2 flex-wrap ${textPri}`}
            >
              📊 BÁO CÁO VẬN HÀNH PLATFORM
              {todayDate && (
                <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded text-xs font-semibold normal-case">
                  Đến ngày {todayLabel}
                </span>
              )}
            </h1>
            <p className={`text-xs mt-0.5 ${textSec}`}>
              {filteredRows.length.toLocaleString()} đơn (10 ngày gần nhất) ·{" "}
              {data.fileName}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setIsDark((v) => !v)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                isDark
                  ? "border-gray-600 text-yellow-400 hover:bg-gray-700"
                  : "border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {isDark ? "☀️ Light" : "🌙 Dark"}
            </button>
            <button
              onClick={onImportNew}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                isDark
                  ? "border-gray-600 text-gray-300 hover:bg-gray-700"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              📤 Import mới
            </button>
            <button
              onClick={onClearData}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                isDark
                  ? "border-red-800 text-red-400 hover:bg-red-900/30"
                  : "border-red-200 text-red-600 hover:bg-red-50"
              }`}
            >
              🗑 Xóa data
            </button>
          </div>
        </div>
      </div>

      {/* ── Scrollable Content ── */}
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">

        {/* 1 · KPI Toàn Quốc */}
        <div
          ref={nationalRef}
          className={`rounded-xl border p-5 shadow-sm ${cardCls}`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🌐</span>
              <h2 className={`font-bold text-sm uppercase tracking-wide ${textPri}`}>
                Toàn Quốc
              </h2>
              <span className={`text-xs ${textSec}`}>
                ({filteredRows.length.toLocaleString()} đơn)
              </span>
            </div>
            <ScreenshotBtn targetRef={nationalRef} isDark={isDark} />
          </div>
          <KPIRow kpi={nationalKPI} isDark={isDark} />
        </div>

        {/* 2 · KPI per Depot */}
        {depots.length > 0 && (
          <div ref={depotsRef} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className={`font-bold text-sm uppercase tracking-wide ${textSec}`}>
                Theo Depot
              </h2>
              <ScreenshotBtn targetRef={depotsRef} isDark={isDark} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {depots.map((depot) => (
                <div
                  key={depot}
                  className={`rounded-xl border p-4 shadow-sm ${cardCls}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">🏢</span>
                    <h3
                      className={`font-bold text-xs uppercase tracking-wide ${textPri}`}
                    >
                      {depot}
                    </h3>
                    <span className={`text-xs ${textSec}`}>
                      ({depotKPIs[depot].total.toLocaleString()} đơn)
                    </span>
                  </div>
                  <KPIRow kpi={depotKPIs[depot]} isDark={isDark} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3 · Hourly GMV chart */}
        <div
          ref={hourlyRef}
          className={`rounded-xl border p-5 shadow-sm ${cardCls}`}
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className={`font-semibold text-sm ${textPri}`}>
              📈 GMV theo giờ —{" "}
              <span className="text-blue-500">Hôm nay ({todayShort})</span> vs{" "}
              <span className={textSec}>D-7 ({d7Short})</span>
            </h3>
            <ScreenshotBtn targetRef={hourlyRef} isDark={isDark} />
          </div>
          <p className={`text-xs mb-4 ${textSec}`}>Đơn vị: Triệu VNĐ</p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={hourlyData}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 11, fill: tickFill }}
              />
              <YAxis tick={{ fontSize: 11, fill: tickFill }} width={50} />
              <Tooltip
                {...ttStyle}
                formatter={(v: number, name: string) => [
                  `${v} Tr`,
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="today"
                name={`Hôm nay (${todayShort})`}
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#3b82f6" }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="d7"
                name={`D-7 (${d7Short})`}
                stroke="#9ca3af"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={{ r: 2, fill: "#9ca3af" }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 4 · Daily order trend */}
        <div
          ref={dailyRef}
          className={`rounded-xl border p-5 shadow-sm ${cardCls}`}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className={`font-semibold text-sm ${textPri}`}>
              📅 Số đơn theo ngày (10 ngày gần nhất)
            </h3>
            <ScreenshotBtn targetRef={dailyRef} isDark={isDark} />
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={dailyData}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: tickFill }} />
              <YAxis tick={{ fontSize: 11, fill: tickFill }} width={50} />
              <Tooltip {...ttStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="complete"
                name="Hoàn thành"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="processing"
                name="Processing"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="cancel"
                name="Hủy"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 5 · Data table */}
        <div
          className={`rounded-xl border shadow-sm overflow-hidden ${cardCls}`}
        >
          <div
            className={`px-4 py-2 border-b text-xs ${
              isDark
                ? "bg-gray-900 border-gray-700 text-gray-500"
                : "bg-gray-50 border-gray-100 text-gray-500"
            }`}
          >
            Hiển thị {Math.min(500, filteredRows.length).toLocaleString()}/
            {filteredRows.length.toLocaleString()} dòng
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className={`border-b ${
                    isDark
                      ? "bg-gray-900 border-gray-700"
                      : "bg-gray-50 border-gray-200"
                  }`}
                >
                  {[
                    "Order ID",
                    "Create Time",
                    "Status",
                    "Depot",
                    "Total Pay Display",
                    "Pickup City",
                    "Sap Profile Id",
                    "Distance",
                  ].map((h) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-left font-semibold text-xs whitespace-nowrap ${
                        isDark ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 500).map((row, i) => {
                  const sg = getStatusGroup(String(row["Status"] ?? ""));
                  const stClr: Record<string, string> = {
                    complete:
                      isDark
                        ? "bg-emerald-900/40 text-emerald-400"
                        : "bg-emerald-50 text-emerald-700",
                    processing:
                      isDark
                        ? "bg-blue-900/40 text-blue-400"
                        : "bg-blue-50 text-blue-700",
                    cancel:
                      isDark
                        ? "bg-red-900/40 text-red-400"
                        : "bg-red-50 text-red-600",
                    other:
                      isDark
                        ? "bg-gray-700 text-gray-400"
                        : "bg-gray-50 text-gray-600",
                  };
                  const rowBg =
                    i % 2 === 0
                      ? isDark
                        ? "bg-gray-800"
                        : "bg-white"
                      : isDark
                      ? "bg-gray-800/60"
                      : "bg-gray-50/40";
                  return (
                    <tr key={i} className={rowBg}>
                      <td
                        className={`px-3 py-1.5 font-mono text-xs ${
                          isDark ? "text-gray-500" : "text-gray-500"
                        }`}
                      >
                        {String(row["Order ID"] ?? "")}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-xs whitespace-nowrap ${
                          isDark ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        {String(row["Create Time"] ?? "")}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${stClr[sg]}`}
                        >
                          {String(row["Status"] ?? "")}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-1.5 text-xs ${
                          isDark ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        {String(row["Depot"] ?? "")}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-xs font-medium text-right ${
                          isDark ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        {String(row["Total Pay Display"] ?? "")}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-xs ${
                          isDark ? "text-gray-500" : "text-gray-500"
                        }`}
                      >
                        {String(row["Pickup City"] ?? "")}
                      </td>
                      <td
                        className={`px-3 py-1.5 font-mono text-xs ${
                          isDark ? "text-gray-500" : "text-gray-500"
                        }`}
                      >
                        {String(row["Sap Profile Id"] ?? "")}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-xs text-right ${
                          isDark ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {String(row["Distance"] ?? "")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
