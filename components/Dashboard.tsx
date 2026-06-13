"use client";
import { useState, useMemo } from "react";
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
};

function computeKPIs(rows: Row[]): KPIResult {
  let gmv = 0,
    complete = 0,
    cancel = 0,
    processing = 0;
  for (const r of rows) {
    const payStr = String(r["Total Pay Display"] ?? "").replace(/[^0-9.]/g, "");
    const pay = parseFloat(payStr);
    if (!isNaN(pay)) gmv += pay;
    const sg = getStatusGroup(String(r["Status"] ?? ""));
    if (sg === "complete") complete++;
    else if (sg === "cancel") cancel++;
    else if (sg === "processing") processing++;
  }
  const total = rows.length;
  const pctComplete = total ? (complete / total) * 100 : 0;
  const pctCancel = total ? (cancel / total) * 100 : 0;
  const aov = total ? gmv / total : 0;
  return {
    gmv,
    total,
    complete,
    cancel,
    processing,
    pctComplete,
    pctCancel,
    aov,
  };
}

const COLOR_MAP: Record<string, { text: string; border: string }> = {
  blue: { text: "text-blue-600", border: "border-l-blue-500" },
  green: { text: "text-green-600", border: "border-l-green-500" },
  red: { text: "text-red-500", border: "border-l-red-400" },
  orange: { text: "text-orange-500", border: "border-l-orange-400" },
  purple: { text: "text-purple-600", border: "border-l-purple-500" },
  gray: { text: "text-gray-700", border: "border-l-gray-400" },
};

function KPICard({
  label,
  value,
  color = "blue",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.blue;
  return (
    <div
      className={`bg-white rounded-lg border border-gray-100 border-l-4 ${c.border} p-3 shadow-sm min-w-0`}
    >
      <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1 truncate">
        {label}
      </div>
      <div className={`text-base font-bold ${c.text} truncate`}>{value}</div>
    </div>
  );
}

function KPIRow({ kpi }: { kpi: KPIResult }) {
  const cards = [
    { label: "GMV", value: formatGMV(kpi.gmv), color: "blue" },
    { label: "Tổng đơn", value: fmt(kpi.total), color: "gray" },
    { label: "% Hoàn thành", value: kpi.pctComplete.toFixed(1) + "%", color: "green" },
    { label: "AOV", value: fmt(Math.round(kpi.aov)), color: "purple" },
    { label: "Đơn hủy", value: fmt(kpi.cancel), color: "red" },
    { label: "% Hủy", value: kpi.pctCancel.toFixed(1) + "%", color: "orange" },
    { label: "Processing", value: fmt(kpi.processing), color: "blue" },
  ];
  return (
    <div className="grid grid-cols-7 gap-2">
      {cards.map((c) => (
        <KPICard key={c.label} label={c.label} value={c.value} color={c.color} />
      ))}
    </div>
  );
}

export default function Dashboard({
  data,
  onImportNew,
  onClearData,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<"kpi" | "charts" | "table">("kpi");

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
      const maxDateObj = new Date(maxDate + "T00:00:00");

      const d10 = new Date(maxDateObj);
      d10.setDate(d10.getDate() - 10);
      const d10Str = d10.toISOString().slice(0, 10);
      filteredRows = rows.filter((r) => {
        const d = parseDate(r["Create Time"]);
        return d && d >= d10Str;
      });

      const d7 = new Date(maxDateObj);
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

    const todayHourlyGMV: number[] = new Array(24).fill(0);
    const d7HourlyGMV: number[] = new Array(24).fill(0);

    for (const r of filteredRows) {
      const d = parseDate(r["Create Time"]);
      const h = parseHour(r["Create Time"]);
      if (h === null || h < 0 || h > 23) continue;
      const payStr = String(r["Total Pay Display"] ?? "").replace(/[^0-9.]/g, "");
      const pay = parseFloat(payStr) || 0;
      if (d === maxDate) todayHourlyGMV[h] += pay;
      if (d === d7Date) d7HourlyGMV[h] += pay;
    }

    const hourlyData = Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, "0")}h`,
      today: Math.round(todayHourlyGMV[h] / 1_000_000),
      d7: Math.round(d7HourlyGMV[h] / 1_000_000),
    }));

    const dailyMap: Record<
      string,
      { complete: number; processing: number; cancel: number }
    > = {};
    for (const r of filteredRows) {
      const d = parseDate(r["Create Time"]);
      if (!d) continue;
      if (!dailyMap[d]) dailyMap[d] = { complete: 0, processing: 0, cancel: 0 };
      const sg = getStatusGroup(String(r["Status"] ?? ""));
      if (sg === "complete") dailyMap[d].complete++;
      else if (sg === "processing") dailyMap[d].processing++;
      else if (sg === "cancel") dailyMap[d].cancel++;
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

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-500">
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

  const todayLabel = todayDate
    ? new Date(todayDate + "T00:00:00").toLocaleDateString("vi-VN")
    : "";
  const todayShort = todayDate ? todayDate.slice(5).replace("-", "/") : "—";
  const d7Short = d7Date ? d7Date.slice(5).replace("-", "/") : "—";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold uppercase text-gray-800 tracking-wide flex items-center gap-2 flex-wrap">
              📊 BÁO CÁO VẬN HÀNH PLATFORM
              {todayDate && (
                <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded text-sm font-semibold normal-case">
                  Đến ngày {todayLabel}
                </span>
              )}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {filteredRows.length.toLocaleString()} đơn (10 ngày gần nhất) ·{" "}
              {data.fileName}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onImportNew}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            >
              📤 Import mới
            </button>
            <button
              onClick={onClearData}
              className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
            >
              🗑 Xóa data
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex">
          {(
            [
              ["kpi", "📋 KPI Overview"],
              ["charts", "📈 Charts"],
              ["table", "📄 Dữ liệu"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === "kpi" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🌐</span>
                <h2 className="font-bold text-sm uppercase text-gray-700 tracking-wide">
                  Toàn Quốc
                </h2>
                <span className="text-xs text-gray-400">
                  ({filteredRows.length.toLocaleString()} đơn)
                </span>
              </div>
              <KPIRow kpi={nationalKPI} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {depots.map((depot) => (
                <div
                  key={depot}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">🏢</span>
                    <h3 className="font-bold text-xs uppercase text-gray-600 tracking-wide">
                      {depot}
                    </h3>
                    <span className="text-xs text-gray-400">
                      ({depotKPIs[depot].total.toLocaleString()} đơn)
                    </span>
                  </div>
                  <KPIRow kpi={depotKPIs[depot]} />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "charts" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="font-semibold text-sm text-gray-700 mb-1">
                📈 GMV theo giờ —{" "}
                <span className="text-blue-600">Hôm nay ({todayShort})</span>{" "}
                vs{" "}
                <span className="text-gray-400">D-7 ({d7Short})</span>
              </h3>
              <p className="text-xs text-gray-400 mb-4">Đơn vị: Triệu VNĐ</p>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={hourlyData}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={50} />
                  <Tooltip
                    formatter={(v: number, name: string) => [`${v} Tr`, name]}
                    contentStyle={{ fontSize: 12 }}
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

            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="font-semibold text-sm text-gray-700 mb-4">
                📅 Số đơn theo ngày (10 ngày gần nhất)
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart
                  data={dailyData}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={50} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="complete" name="Hoàn thành" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="processing" name="Processing" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="cancel" name="Hủy" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === "table" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
              Hiển thị {Math.min(500, filteredRows.length).toLocaleString()}/
              {filteredRows.length.toLocaleString()} dòng
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["Order ID", "Create Time", "Status", "Depot", "Total Pay Display", "Pickup City"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-xs text-gray-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.slice(0, 500).map((row, i) => {
                    const sg = getStatusGroup(String(row["Status"] ?? ""));
                    const statusColors: Record<string, string> = {
                      complete: "bg-emerald-50 text-emerald-700",
                      processing: "bg-blue-50 text-blue-700",
                      cancel: "bg-red-50 text-red-600",
                      other: "bg-gray-50 text-gray-600",
                    };
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                        <td className="px-3 py-1.5 font-mono text-xs text-gray-500">{String(row["Order ID"] ?? "")}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-400 whitespace-nowrap">{String(row["Create Time"] ?? "")}</td>
                        <td className="px-3 py-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[sg]}`}>{String(row["Status"] ?? "")}</span>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-gray-700">{String(row["Depot"] ?? "")}</td>
                        <td className="px-3 py-1.5 text-xs font-medium text-right text-gray-700">{String(row["Total Pay Display"] ?? "")}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-500">{String(row["Pickup City"] ?? "")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
