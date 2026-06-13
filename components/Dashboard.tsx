"use client";

import { useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ParsedData } from "@/types/data";
import { Upload, Camera, Trash2 } from "lucide-react";

type Row = Record<string, unknown>;

function parseRevenue(val: unknown): number {
  if (typeof val === "number") return val;
  const s = String(val ?? "").replace(/[^\d.]/g, "");
  return parseFloat(s) || 0;
}

function fmtNum(n: number) {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
}

function fmtRevenue(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
}

async function captureToClipboard(el: HTMLElement): Promise<void> {
  const w = window as unknown as Record<string, unknown>;
  if (!w.html2canvas) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  type H2C = (el: HTMLElement, opts: object) => Promise<HTMLCanvasElement>;
  const h2c = w.html2canvas as H2C;
  const canvas = await h2c(el, { scale: 2, useCORS: true, backgroundColor: "#0f172a" });
  await new Promise<void>((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { resolve(); return; }
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      } catch {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "chart.png"; a.click();
        URL.revokeObjectURL(url);
      }
      resolve();
    }, "image/png");
  });
}

function ScreenshotBtn({ targetRef }: { targetRef: { current: HTMLDivElement | null } }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        if (!targetRef.current) return;
        await captureToClipboard(targetRef.current);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      title="Chup hinh & copy vao clipboard"
      className="flex items-center gap-1 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-2 py-1 rounded transition-colors"
    >
      <Camera className="w-3.5 h-3.5" />
      {copied ? "Da copy!" : "Chup hinh"}
    </button>
  );
}

const STATUS_COLORS: Record<string, string> = {
  complete: "#10b981",
  processing: "#3b82f6",
  cancel: "#ef4444",
};

const BAR_COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16","#06b6d4","#ef4444"];

interface DashboardProps {
  data: ParsedData | null;
  onImportNew: () => void;
  onClearData: () => void;
}

export default function Dashboard({ data, onImportNew, onClearData }: DashboardProps) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const kpiRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const depotRef = useRef<HTMLDivElement>(null);
  const cityRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const A = useMemo(() => {
    if (!data || data.rowCount === 0) return null;
    const rows = data.rows as Row[];
    let complete = 0, processing = 0, cancel = 0, revenue = 0;
    const depotCount: Record<string, number> = {};
    const depotRevenue: Record<string, number> = {};
    const cityCount: Record<string, number> = {};

    for (const r of rows) {
      const s = String(r["Status"] ?? "").trim().toLowerCase();
      if (s === "complete") complete++;
      else if (s === "processing") processing++;
      else if (s === "cancel") cancel++;

      const rev = parseRevenue(r["Total Pay Display"]);
      revenue += rev;

      const depot = String(r["Depot"] ?? "").trim() || "Unknown";
      depotCount[depot] = (depotCount[depot] || 0) + 1;
      depotRevenue[depot] = (depotRevenue[depot] || 0) + rev;

      const city = String(r["Pickup City"] ?? "").trim() || "Unknown";
      cityCount[city] = (cityCount[city] || 0) + 1;
    }

    const statusChart = [
      { name: "Complete", value: complete, pct: rows.length > 0 ? ((complete / rows.length) * 100).toFixed(1) : "0" },
      { name: "Processing", value: processing, pct: rows.length > 0 ? ((processing / rows.length) * 100).toFixed(1) : "0" },
      { name: "Cancel", value: cancel, pct: rows.length > 0 ? ((cancel / rows.length) * 100).toFixed(1) : "0" },
    ];

    const topDepotCount = Object.entries(depotCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, value]) => ({ name, value }));

    const topCityCount = Object.entries(cityCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, value]) => ({ name, value }));

    const topDepotRevenue = Object.entries(depotRevenue)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, value]) => ({ name, value }));

    return { total: rows.length, complete, processing, cancel, revenue, statusChart, topDepotCount, topCityCount, topDepotRevenue };
  }, [data]);

  const rows = (data?.rows as Row[]) ?? [];
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);

  const ttStyle = { contentStyle: { background: "#1e293b", border: "1px solid #334155", borderRadius: 8 } };

  // Empty state
  if (!data || !A) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {["Total Orders","Complete","Processing","Cancel","Total Revenue"].map((label) => (
            <div key={label} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">{label}</p>
              <p className="text-2xl font-bold text-slate-600">--</p>
            </div>
          ))}
        </div>
        <div className="bg-slate-800/30 border border-dashed border-slate-700 rounded-2xl p-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800 flex items-center justify-center">
            <Upload className="w-8 h-8 text-slate-600" />
          </div>
          <p className="text-slate-400 text-lg font-medium mb-2">Chưa có dữ liệu</p>
          <p className="text-slate-500 text-sm mb-6">Import file Excel để xem dashboard</p>
          <button
            onClick={onImportNew}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Import file ngay
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* File info bar */}
      <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{data.fileName}</p>
          <p className="text-slate-400 text-xs">
            {data.rowCount.toLocaleString()} rows · Upload: {new Date(data.uploadedAt).toLocaleString("vi-VN")}
          </p>
        </div>
        <button
          onClick={onClearData}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/40 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Xóa data
        </button>
      </div>

      {/* KPI Cards */}
      <div ref={kpiRef} className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: "Total Orders", val: fmtNum(A.total), color: "text-white" },
          { label: "Complete", val: fmtNum(A.complete), color: "text-green-400" },
          { label: "Processing", val: fmtNum(A.processing), color: "text-blue-400" },
          { label: "Cancel", val: fmtNum(A.cancel), color: "text-red-400" },
          { label: "Total Revenue", val: fmtRevenue(A.revenue), color: "text-amber-400" },
        ].map((k) => (
          <div key={k.label} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Status Distribution */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">Phân bổ Status</h2>
          <ScreenshotBtn targetRef={statusRef} />
        </div>
        <div ref={statusRef} className="bg-slate-900/50 p-4 rounded-xl">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={A.statusChart} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={fmtNum} />
              <Tooltip {...ttStyle} formatter={(v: number) => [fmtNum(v), "Orders"]} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {A.statusChart.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name.toLowerCase()] ?? "#94a3b8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-2">
            {A.statusChart.map((s) => (
              <span key={s.name} className="text-slate-400 text-xs">
                <span style={{ color: STATUS_COLORS[s.name.toLowerCase()] }}>■</span> {s.name}: {s.pct}%
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Top Depot by Orders */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">Top 10 Depot theo Orders</h2>
          <ScreenshotBtn targetRef={depotRef} />
        </div>
        <div ref={depotRef} className="bg-slate-900/50 p-4 rounded-xl">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={A.topDepotCount} layout="vertical" margin={{ top: 5, right: 40, left: 80, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={fmtNum} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} width={75} />
              <Tooltip {...ttStyle} formatter={(v: number) => [fmtNum(v), "Orders"]} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {A.topDepotCount.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Pickup City */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">Top 10 Pickup City theo Orders</h2>
          <ScreenshotBtn targetRef={cityRef} />
        </div>
        <div ref={cityRef} className="bg-slate-900/50 p-4 rounded-xl">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={A.topCityCount} layout="vertical" margin={{ top: 5, right: 40, left: 80, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={fmtNum} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} width={75} />
              <Tooltip {...ttStyle} formatter={(v: number) => [fmtNum(v), "Orders"]} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {A.topCityCount.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-semibold">Chi tiết đơn hàng</h2>
            <p className="text-slate-400 text-xs">
              Hiển thị {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} / {fmtNum(rows.length)} rows
            </p>
          </div>
          <ScreenshotBtn targetRef={tableRef} />
        </div>
        <div ref={tableRef} className="overflow-x-auto bg-slate-900/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900/60">
                {["Order ID","Status","Depot","Total Pay Display","Pickup City"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-slate-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => {
                const s = String(r["Status"] ?? "").trim().toLowerCase();
                const statusColor = s === "complete" ? "text-green-400" : s === "processing" ? "text-blue-400" : "text-red-400";
                return (
                  <tr key={i} className={`border-t border-slate-700/50 ${i % 2 === 0 ? "bg-slate-900/20" : ""}`}>
                    <td className="px-4 py-2.5 text-slate-300 font-mono text-xs">{String(r["Order ID"] ?? "")}</td>
                    <td className={`px-4 py-2.5 font-medium text-xs ${statusColor}`}>{String(r["Status"] ?? "")}</td>
                    <td className="px-4 py-2.5 text-slate-300 text-xs">{String(r["Depot"] ?? "")}</td>
                    <td className="px-4 py-2.5 text-amber-400 text-xs text-right">{String(r["Total Pay Display"] ?? "")}</td>
                    <td className="px-4 py-2.5 text-slate-300 text-xs">{String(r["Pickup City"] ?? "")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded border border-slate-700 hover:border-slate-500 transition-colors"
            >
              ← Trước
            </button>
            <span className="text-slate-400 text-sm">Trang {page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded border border-slate-700 hover:border-slate-500 transition-colors"
            >
              Sau →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
