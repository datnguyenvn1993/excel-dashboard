"use client";

import { useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ParsedData, DatasetMeta } from "@/types/data";
import { Clock, Trash2, Upload, Camera } from "lucide-react";

type Row = Record<string, unknown>;

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#84cc16",
  "#06b6d4",
];

interface DashboardProps {
  data: ParsedData;
  datasets: DatasetMeta[];
  onSelectDataset: (meta: DatasetMeta) => void;
  onDeleteDataset: (id: string) => void;
  onImportNew: () => void;
}

function daysLeft(exp: string) {
  return Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000);
}

function parseDate(val: unknown): Date | null {
  if (val === null || val === undefined || val === "") return null;
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? null : d;
}

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

function fmtNum(n: number) {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
}

function fmtGMV(n: number) {
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
    backgroundColor: "#0f172a",
  });
  await new Promise<void>((resolve) => {
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
}: {
  targetRef: { current: HTMLDivElement | null };
}) {
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

export default function Dashboard({
  data,
  datasets,
  onSelectDataset,
  onDeleteDataset,
  onImportNew,
}: DashboardProps) {
  const { rows, fileName, rowCount, expiresAt, id } = data;

  const A = useMemo(() => {
    const complete = (rows as Row[]).filter(
      (r) =>
        String(r["Status Order"] ?? "")
          .trim()
          .toLowerCase() === "complete"
    );

    const gmv = complete.reduce((s, r) => s + (Number(r["Total Pay"]) || 0), 0);
    const driverSet = new Set(
      complete.filter((r) => r["Sap ID"]).map((r) => r["Sap ID"])
    );
    const driverActive = driverSet.size;
    const totalTrip = complete.length;
    const tpd = driverActive > 0 ? totalTrip / driverActive : 0;

    // Find date range
    const allDates = (rows as Row[])
      .map((r) => parseDate(r["Create Date"]))
      .filter((d): d is Date => d !== null);
    const maxDate =
      allDates.length > 0
        ? new Date(Math.max(...allDates.map((d) => d.getTime())))
        : new Date();
    const wowDate = new Date(maxDate);
    wowDate.setDate(maxDate.getDate() - 7);
    const todayStr = toDateStr(maxDate);
    const wowStr = toDateStr(wowDate);

    const HOURS = Array.from({ length: 24 }, (_, h) => `${h}:00`);
    const todayGMV = new Array(24).fill(0);
    const wowGMV = new Array(24).fill(0);
    const todayDrv: Set<unknown>[] = Array.from({ length: 24 }, () => new Set());
    const wowDrv: Set<unknown>[] = Array.from({ length: 24 }, () => new Set());

    complete.forEach((r) => {
      const d = parseDate(r["Create Date"]);
      if (!d) return;
      const ds = toDateStr(d);
      const h = d.getHours();
      const pay = Number(r["Total Pay"]) || 0;
      if (ds === todayStr) {
        todayGMV[h] += pay;
        if (r["Sap ID"]) todayDrv[h].add(r["Sap ID"]);
      } else if (ds === wowStr) {
        wowGMV[h] += pay;
        if (r["Sap ID"]) wowDrv[h].add(r["Sap ID"]);
      }
    });

    const gmvChart = HOURS.map((hour, h) => ({
      hour,
      today: todayGMV[h],
      wow: wowGMV[h],
    }));
    const drvChart = HOURS.map((hour, h) => ({
      hour,
      today: todayDrv[h].size,
      wow: wowDrv[h].size,
    }));

    // Group chart: today only, by hour
    const groupHours: Record<string, number[]> = {};
    complete.forEach((r) => {
      const d = parseDate(r["Create Date"]);
      if (!d || toDateStr(d) !== todayStr) return;
      const g = String(r["Driver Group ID"] ?? "Unknown");
      if (!groupHours[g]) groupHours[g] = new Array(24).fill(0);
      groupHours[g][d.getHours()] += Number(r["Total Pay"]) || 0;
    });
    const groups = Object.keys(groupHours).sort();
    const groupChart = HOURS.map((hour, h) => {
      const pt: Record<string, unknown> = { hour };
      groups.forEach((g) => {
        pt[g] = groupHours[g]?.[h] || 0;
      });
      return pt;
    });

    // Group table: all complete data
    const groupSummary: Record<
      string,
      { gmv: number; drv: Set<unknown>; trips: number }
    > = {};
    complete.forEach((r) => {
      const g = String(r["Driver Group ID"] ?? "Unknown");
      if (!groupSummary[g])
        groupSummary[g] = { gmv: 0, drv: new Set(), trips: 0 };
      groupSummary[g].gmv += Number(r["Total Pay"]) || 0;
      if (r["Sap ID"]) groupSummary[g].drv.add(r["Sap ID"]);
      groupSummary[g].trips++;
    });
    const groupTable = Object.entries(groupSummary)
      .map(([g, s]) => ({
        g,
        gmv: s.gmv,
        drv: s.drv.size,
        trips: s.trips,
        tpd: s.drv.size > 0 ? s.trips / s.drv.size : 0,
      }))
      .sort((a, b) => b.gmv - a.gmv);

    return {
      gmv,
      driverActive,
      totalTrip,
      tpd,
      todayStr,
      wowStr,
      gmvChart,
      drvChart,
      groups,
      groupChart,
      groupTable,
    };
  }, [rows]);

  const kpiRef = useRef<HTMLDivElement>(null);
  const gmvChartRef = useRef<HTMLDivElement>(null);
  const drvChartRef = useRef<HTMLDivElement>(null);
  const grpChartRef = useRef<HTMLDivElement>(null);
  const grpTableRef = useRef<HTMLDivElement>(null);
  const dl = daysLeft(expiresAt);

  const ttStyle = {
    contentStyle: {
      background: "#1e293b",
      border: "1px solid #334155",
      borderRadius: 8,
    },
  };

  return (
    <div className="space-y-6">
      {/* Dataset list */}
      {datasets.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium text-sm">
              Danh sach file da import
            </h3>
            <button
              onClick={onImportNew}
              className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs"
            >
              <Upload className="w-3.5 h-3.5" /> Import moi
            </button>
          </div>
          <div className="space-y-2">
            {datasets.map((ds) => {
              const isActive = ds.id === id;
              const dl2 = daysLeft(ds.expiresAt);
              return (
                <div
                  key={ds.id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                    isActive
                      ? "bg-blue-600/20 border border-blue-500/40"
                      : "bg-slate-900/50 border border-slate-700 hover:border-slate-600"
                  }`}
                  onClick={() => onSelectDataset(ds)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {ds.fileName}
                    </p>
                    <p className="text-slate-400 text-xs">
                      {ds.rowCount.toLocaleString()} dong -{" "}
                      {new Date(ds.uploadedAt).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <span
                      className={`flex items-center gap-1 text-xs ${
                        dl2 <= 3 ? "text-red-400" : "text-slate-400"
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      {dl2 > 0 ? `${dl2}ngay` : "Het han"}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDataset(ds.id);
                      }}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                    >
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
        <div className="flex-1">
          <p className="text-white text-sm font-medium">{fileName}</p>
          <p className="text-slate-400 text-xs">
            {rowCount.toLocaleString()} dong - Het han:{" "}
            {new Date(expiresAt).toLocaleDateString("vi-VN")} ({dl} ngay) -
            Ngay moi nhat: <span className="text-blue-400">{A.todayStr}</span>{" "}
            - WoW: <span className="text-amber-400">{A.wowStr}</span>
          </p>
        </div>
      </div>

      {/* 1. KPI */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">
            Tong quan (Status = Complete)
          </h2>
          <ScreenshotBtn targetRef={kpiRef} />
        </div>
        <div
          ref={kpiRef}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-900/50 p-4 rounded-xl"
        >
          {[
            {
              label: "GMV",
              val: fmtGMV(A.gmv),
              sub: fmtNum(A.gmv),
              color: "text-blue-400",
            },
            {
              label: "Driver Active",
              val: fmtNum(A.driverActive),
              sub: "tai xe co trip",
              color: "text-green-400",
            },
            {
              label: "Total Trip",
              val: fmtNum(A.totalTrip),
              sub: "completed trips",
              color: "text-amber-400",
            },
            {
              label: "TpD",
              val: A.tpd.toFixed(2),
              sub: "trips / driver",
              color: "text-purple-400",
            },
          ].map((k) => (
            <div
              key={k.label}
              className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center"
            >
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">
                {k.label}
              </p>
              <p className={`text-2xl font-bold ${k.color}`}>{k.val}</p>
              <p className="text-slate-500 text-xs mt-1">{k.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 2. GMV by hour */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-white font-semibold">GMV theo gio</h2>
            <p className="text-slate-400 text-xs">Hom nay vs WoW tuan truoc</p>
          </div>
          <ScreenshotBtn targetRef={gmvChartRef} />
        </div>
        <div ref={gmvChartRef} className="bg-slate-900/50 p-4 rounded-xl">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={A.gmvChart}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="hour"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                interval={2}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickFormatter={fmtGMV}
              />
              <Tooltip
                {...ttStyle}
                formatter={(v: number, name: string) => [
                  fmtNum(v),
                  name === "today"
                    ? `Today (${A.todayStr})`
                    : `WoW (${A.wowStr})`,
                ]}
              />
              <Legend
                formatter={(v) =>
                  v === "today"
                    ? `Today (${A.todayStr})`
                    : `WoW (${A.wowStr})`
                }
              />
              <Line
                type="monotone"
                dataKey="today"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="today"
              />
              <Line
                type="monotone"
                dataKey="wow"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 5"
                name="wow"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Driver Active by hour */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-white font-semibold">Driver Active theo gio</h2>
            <p className="text-slate-400 text-xs">
              So tai xe co trip theo gio, so sanh WoW
            </p>
          </div>
          <ScreenshotBtn targetRef={drvChartRef} />
        </div>
        <div ref={drvChartRef} className="bg-slate-900/50 p-4 rounded-xl">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={A.drvChart}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="hour"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                interval={2}
              />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip
                {...ttStyle}
                formatter={(v: number, name: string) => [
                  fmtNum(v),
                  name === "today"
                    ? `Today (${A.todayStr})`
                    : `WoW (${A.wowStr})`,
                ]}
              />
              <Legend
                formatter={(v) =>
                  v === "today"
                    ? `Today (${A.todayStr})`
                    : `WoW (${A.wowStr})`
                }
              />
              <Line
                type="monotone"
                dataKey="today"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                name="today"
              />
              <Line
                type="monotone"
                dataKey="wow"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 5"
                name="wow"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. GMV by Driver Group */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-white font-semibold">
              GMV theo Driver Group - hom nay
            </h2>
            <p className="text-slate-400 text-xs">
              GMV theo gio, phan tach theo nhom tai xe
            </p>
          </div>
          <ScreenshotBtn targetRef={grpChartRef} />
        </div>
        <div ref={grpChartRef} className="bg-slate-900/50 p-4 rounded-xl">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={A.groupChart}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="hour"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                interval={2}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickFormatter={fmtGMV}
              />
              <Tooltip {...ttStyle} formatter={(v: number) => fmtNum(v)} />
              <Legend wrapperStyle={{ paddingTop: 12, fontSize: 12 }} />
              {A.groups.map((g, i) => (
                <Line
                  key={g}
                  type="monotone"
                  dataKey={g}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 5. Driver Group table */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-semibold">
              Chi tiet theo Driver Group
            </h2>
            <p className="text-slate-400 text-xs">
              Tong hop toan bo du lieu (Status = Complete)
            </p>
          </div>
          <ScreenshotBtn targetRef={grpTableRef} />
        </div>
        <div ref={grpTableRef} className="overflow-x-auto bg-slate-900/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900/60">
                {["Driver Group", "GMV", "Driver Active", "Total Trip", "TpD"].map(
                  (h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-slate-400 font-medium text-xs uppercase tracking-wider ${
                        h === "Driver Group" ? "text-left" : "text-right"
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {A.groupTable.map((r, i) => (
                <tr
                  key={r.g}
                  className={`border-t border-slate-700/50 ${
                    i % 2 === 0 ? "bg-slate-900/20" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-white font-medium">{r.g}</td>
                  <td className="px-4 py-3 text-right text-blue-400">
                    {fmtNum(r.gmv)}
                  </td>
                  <td className="px-4 py-3 text-right text-green-400">
                    {fmtNum(r.drv)}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-400">
                    {fmtNum(r.trips)}
                  </td>
                  <td className="px-4 py-3 text-right text-purple-400">
                    {r.tpd.toFixed(2)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-600 bg-slate-900/50 font-semibold">
                <td className="px-4 py-3 text-white">TOTAL</td>
                <td className="px-4 py-3 text-right text-blue-300">
                  {fmtNum(A.gmv)}
                </td>
                <td className="px-4 py-3 text-right text-green-300">
                  {fmtNum(A.driverActive)}
                </td>
                <td className="px-4 py-3 text-right text-amber-300">
                  {fmtNum(A.totalTrip)}
                </td>
                <td className="px-4 py-3 text-right text-purple-300">
                  {A.tpd.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
