"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ParsedData, DatasetMeta, ColumnInfo, ColumnType } from "@/types/data";
import { Clock, Trash2, Upload } from "lucide-react";

interface DashboardProps {
  data: ParsedData;
  datasets: DatasetMeta[];
  onSelectDataset: (meta: DatasetMeta) => void;
  onDeleteDataset: (id: string) => void;
  onImportNew: () => void;
}

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];

function detectType(values: unknown[]): ColumnType {
  const nonEmpty = values.filter((v) => v !== "" && v !== null && v !== undefined);
  const numCount = nonEmpty.filter((v) => !isNaN(Number(v)) && v !== "").length;
  return numCount / nonEmpty.length > 0.8 ? "number" : "string";
}

function analyzeColumns(headers: string[], rows: Record<string, unknown>[]): ColumnInfo[] {
  return headers.map((h) => {
    const values = rows.map((r) => r[h]);
    const type = detectType(values);
    const uniqueCount = new Set(values.map(String)).size;
    let numericStats;
    if (type === "number") {
      const nums = values.map(Number).filter((n) => !isNaN(n));
      numericStats = { min: Math.min(...nums), max: Math.max(...nums), avg: nums.reduce((a,b)=>a+b,0)/nums.length, sum: nums.reduce((a,b)=>a+b,0) };
    }
    return { name: h, type, uniqueCount, numericStats };
  });
}

function daysLeft(expiresAt: string) {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

export default function Dashboard({ data, datasets, onSelectDataset, onDeleteDataset, onImportNew }: DashboardProps) {
  const { headers, rows, fileName, rowCount, expiresAt } = data;
  const columns = useMemo(() => analyzeColumns(headers, rows), [headers, rows]);
  const numericCols = columns.filter((c) => c.type === "number");
  const stringCols = columns.filter((c) => c.type === "string");

  const [xAxis, setXAxis] = useState(stringCols[0]?.name || headers[0]);
  const [yAxis, setYAxis] = useState(numericCols[0]?.name || headers[1]);
  const [chartType, setChartType] = useState<"bar"|"line"|"pie">("bar");
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const chartData = useMemo(() => {
    const grouped: Record<string, number> = {};
    rows.forEach((row) => {
      const key = String(row[xAxis] || "Unknown");
      grouped[key] = (grouped[key] || 0) + (Number(row[yAxis]) || 0);
    });
    return Object.entries(grouped).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value).slice(0,20);
  }, [rows, xAxis, yAxis]);

  const stats = columns.find((c) => c.name === yAxis)?.numericStats;
  const pagedRows = rows.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(rows.length / pageSize);
  const dl = daysLeft(expiresAt);

  const renderChart = () => {
    const props = { data: chartData, margin: { top: 5, right: 20, left: 0, bottom: 60 } };
    if (chartType === "pie") return (
      <ResponsiveContainer width="100%" height={320}><PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110}
          label={({ name, percent }: { name: string; percent: number }) => name + " " + (percent*100).toFixed(0) + "%"}>
          {chartData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => v.toLocaleString()} />
      </PieChart></ResponsiveContainer>
    );
    if (chartType === "line") return (
      <ResponsiveContainer width="100%" height={320}><LineChart {...props}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="name" tick={{ fill:"#94a3b8",fontSize:11 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis tick={{ fill:"#94a3b8",fontSize:11 }} tickFormatter={(v)=>v.toLocaleString()} />
        <Tooltip contentStyle={{ background:"#1e293b",border:"1px solid #334155",borderRadius:8 }} formatter={(v: number)=>v.toLocaleString()} />
        <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ fill:"#3b82f6" }} name={yAxis} />
      </LineChart></ResponsiveContainer>
    );
    return (
      <ResponsiveContainer width="100%" height={320}><BarChart {...props}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="name" tick={{ fill:"#94a3b8",fontSize:11 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis tick={{ fill:"#94a3b8",fontSize:11 }} tickFormatter={(v)=>v.toLocaleString()} />
        <Tooltip contentStyle={{ background:"#1e293b",border:"1px solid #334155",borderRadius:8 }} formatter={(v: number)=>v.toLocaleString()} />
        <Bar dataKey="value" name={yAxis} radius={[4,4,0,0]}>
          {chartData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
        </Bar>
      </BarChart></ResponsiveContainer>
    );
  };

  return (
    <div className="space-y-6">
      {/* Dataset list */}
      {datasets.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium text-sm">Danh sách file đã import</h3>
            <button onClick={onImportNew} className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs">
              <Upload className="w-3.5 h-3.5" /> Import mới
            </button>
          </div>
          <div className="space-y-2">
            {datasets.map((ds) => {
              const isActive = ds.id === data.id;
              const dl2 = daysLeft(ds.expiresAt);
              return (
                <div key={ds.id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 cursor-pointer transition-colors
                    ${isActive ? "bg-blue-600/20 border border-blue-500/40" : "bg-slate-900/50 border border-slate-700 hover:border-slate-600"}`}
                  onClick={() => onSelectDataset(ds)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{ds.fileName}</p>
                    <p className="text-slate-400 text-xs">{ds.rowCount.toLocaleString()} dòng · {new Date(ds.uploadedAt).toLocaleDateString("vi-VN")}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <span className={`flex items-center gap-1 text-xs ${dl2 <= 3 ? "text-red-400" : "text-slate-400"}`}>
                      <Clock className="w-3.5 h-3.5" />{dl2 > 0 ? dl2 + "ngày" : "Hết hạn"}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); onDeleteDataset(ds.id); }}
                      className="text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* File info */}
      <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
        <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-white text-sm font-medium">{fileName}</p>
          <p className="text-slate-400 text-xs">{rowCount.toLocaleString()} dòng · {headers.length} cột · Hết hạn: {new Date(expiresAt).toLocaleDateString("vi-VN")} ({dl} ngày)</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Tổng " + yAxis, value: stats.sum.toLocaleString(undefined,{maximumFractionDigits:2}) },
            { label: "Trung bình", value: stats.avg.toLocaleString(undefined,{maximumFractionDigits:2}) },
            { label: "Lớn nhất", value: stats.max.toLocaleString(undefined,{maximumFractionDigits:2}) },
            { label: "Nhỏ nhất", value: stats.min.toLocaleString(undefined,{maximumFractionDigits:2}) },
          ].map((s) => (
            <div key={s.label} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">{s.label}</p>
              <p className="text-white text-xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex flex-wrap gap-3 mb-6">
          <div>
            <label className="text-slate-400 text-xs block mb-1">Trục X (Nhóm theo)</label>
            <select value={xAxis} onChange={(e) => setXAxis(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
              {headers.map((h) => <option key={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="text-slate-400 text-xs block mb-1">Trục Y (Giá trị)</label>
            <select value={yAxis} onChange={(e) => setYAxis(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
              {numericCols.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-slate-400 text-xs block mb-1">Loại biểu đồ</label>
            <div className="flex gap-1">
              {(["bar","line","pie"] as const).map((t) => (
                <button key={t} onClick={() => setChartType(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${chartType===t?"bg-blue-500 text-white":"bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        {renderChart()}
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-white font-medium">Dữ liệu thô</h3>
          <span className="text-slate-400 text-sm">{rowCount.toLocaleString()} dòng</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-900/50">
              {headers.map((h) => (
                <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pagedRows.map((row, i) => (
                <tr key={i} className="border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                  {headers.map((h) => (
                    <td key={h} className="px-4 py-3 text-slate-300 whitespace-nowrap max-w-[200px] truncate">{String(row[h] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between">
            <button onClick={() => setPage(Math.max(0, page-1))} disabled={page===0}
              className="text-sm text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed">← Trước</button>
            <span className="text-slate-400 text-sm">Trang {page+1} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages-1, page+1))} disabled={page===totalPages-1}
              className="text-sm text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed">Tiếp →</button>
          </div>
        )}
      </div>
    </div>
  );
}
