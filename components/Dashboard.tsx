"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
interface KPIResult {
  total: number; gmv: number; complete: number; cancel: number; processing: number; txActive: number;
  d7Total?: number; d7Gmv?: number; d7TxActive?: number;
}
interface KPIData {
  national: KPIResult & { maxDate: string | null; minDate: string | null };
  regions: Array<{ region: string } & KPIResult>;
  availableDates: string[];
  lastImportAt: string | null;
  d7Date: string | null;
  importHour: number | null;
}
interface TeamRow {
  doi: string;
  gmv: number; gmv_prev: number | null;
  driver_active: number; driver_active_prev: number | null;
  trip_complete: number; trip_complete_prev: number | null;
}
interface ChartData {
  todayDate: string | null; d7Date: string | null;
  hourly: { hour: string; today: number; d7: number }[];
  daily: { date: string; complete: number; processing: number; cancel: number }[];
}
interface TableRow {
  id: number; order_id: string; status: string; depot: string;
  total_pay: number; pickup_city: string; create_date: string;
  create_hour: number; sap_profile_id: string; distance: string;
}
interface TableData { rows: TableRow[]; total: number; page: number; limit: number; }
type ConfirmState = { type: "reset" } | { type: "deleteRows"; count: number } | null;

const ALL_REGIONS = ["Hồ Chí Minh", "Hà Nội", "Miền Nam", "Miền Bắc"] as const;
const REGION_ORDER = ["Hồ Chí Minh", "Hà Nội", "Miền Nam", "Miền Bắc"];
const REGION_EMOJIS: Record<string, string> = {
  "Hồ Chí Minh": "🏙️", "Hà Nội": "🏛️", "Miền Nam": "🌴", "Miền Bắc": "⛰️",
};
const REGION_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

interface DashboardProps {
  onImportNew?: () => void;
  refreshKey?: number;
  currentUser?: { username: string, role: string, display_name: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatGMV(v: number) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + " Tỉ";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + " Tr";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + " K";
  return v.toFixed(0);
}
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
function formatImportTime(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return hh + ":" + mm + " " + dd + "/" + mo + "/" + yy;
}
function getRelativeStr(ts: string | null, now: number): string {
  if (!ts) return "";
  const diff = Math.floor((now - new Date(ts).getTime()) / 60000);
  if (diff < 1) return "(vừa xong)";
  if (diff < 60) return "(" + diff + " phút trước)";
  const h = Math.floor(diff / 60), m = diff % 60;
  return "(" + h + " giờ" + (m > 0 ? " " + m + " phút" : "") + " trước)";
}
function isImportStale(ts: string | null, now: number): boolean {
  if (!ts) return false;
  return (now - new Date(ts).getTime()) > 3600000;
}
function wowPct(curr: number, prev: number | null): number | null {
  if (!prev || prev === 0) return null;
  return (curr - prev) / prev * 100;
}
function deltaPct(curr: number, prev: number | undefined): number | undefined {
  if (!prev || prev === 0) return undefined;
  return (curr - prev) / prev * 100;
}
function getStatusGroup(s: string) {
  const l = s.toLowerCase();
  if (l.startsWith("complete")) return "complete";
  if (l.startsWith("cancel")) return "cancel";
  if (l.startsWith("process") || l === "in progress") return "processing";
  return "other";
}
async function captureToClipboard(el: HTMLElement, isDark: boolean, o?: { watermarkText?: string }) {
  const w = window as unknown as Record<string, unknown>;
  if (!w.html2canvas) {
    await new Promise<void>((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      s.onload = () => res(); s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  type H2C = (el: HTMLElement, o: object) => Promise<HTMLCanvasElement>;
  const canvas = await (w.html2canvas as H2C)(el, { scale: 2, useCORS: true, backgroundColor: isDark ? "#111827" : "#f9fafb" });
  if (o?.watermarkText) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      const fontSize = Math.max(40, Math.round(canvas.width / 10));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = isDark ? "#93c5fd" : "#dc2626";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 6);
      ctx.fillText(o.watermarkText, 0, 0);
      ctx.restore();
    }
  }
  return new Promise<void>(res => {
    canvas.toBlob(async blob => {
      if (!blob) { res(); return; }
      try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); }
      catch { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = "chart.png"; a.click(); URL.revokeObjectURL(u); }
      res();
    }, "image/png");
  });
}
async function downloadPng(el: HTMLElement, isDark: boolean, filename: string) {
  const w = window as unknown as Record<string, unknown>;
  if (!w.html2canvas) {
    await new Promise<void>((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      s.onload = () => res(); s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  type H2C = (el: HTMLElement, o: object) => Promise<HTMLCanvasElement>;
  const canvas = await (w.html2canvas as H2C)(el, { scale: 2, useCORS: true, backgroundColor: isDark ? "#111827" : "#f9fafb" });
  canvas.toBlob(blob => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u; a.download = filename; a.click();
    URL.revokeObjectURL(u);
  }, "image/png");
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ScreenshotBtn({ targetRef, isDark, watermarkText }: { targetRef: React.RefObject<HTMLDivElement | null>; isDark: boolean; watermarkText?: string }) {
  const [st, setSt] = useState<"idle" | "busy" | "done">("idle");
  return (
    <button data-html2canvas-ignore="true" onClick={async () => {
      if (!targetRef.current || st === "busy") return;
      setSt("busy"); await captureToClipboard(targetRef.current, isDark, { watermarkText }); setSt("done"); setTimeout(() => setSt("idle"), 2000);
    }} className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${isDark ? "border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 bg-gray-900" : "border-gray-300 text-gray-500 hover:text-gray-700 bg-white"}`}>
      {st === "busy" ? "⏳" : st === "done" ? "✅" : "📷"} {st === "busy" ? "Xử lý..." : st === "done" ? "Đã copy!" : "Chụp hình"}
    </button>
  );
}

function ConfirmDialog({ title, message, isDark, onConfirm, onCancel }: { title: string; message: string; isDark: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`rounded-xl w-full max-w-sm shadow-2xl border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
        <div className={`px-6 pt-5 pb-2 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
          <h3 className={`font-semibold text-sm ${isDark ? "text-gray-100" : "text-gray-800"}`}>⚠️ {title}</h3>
        </div>
        <div className="px-6 py-4"><p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>{message}</p></div>
        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onCancel} className={`px-4 py-2 text-sm rounded-lg border ${isDark ? "border-gray-600 text-gray-300 hover:bg-gray-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>Hủy</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium">Xác nhận xóa</button>
        </div>
      </div>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | undefined }) {
  if (delta === undefined) return null;
  const up = delta >= 0;
  return (
    <div className={`text-[10px] mt-0.5 font-semibold ${up ? "text-green-500" : "text-red-500"}`}>
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs D-7
    </div>
  );
}

function KPICard({ label, value, color = "blue", isDark, delta }: { label: string; value: string; color?: string; isDark: boolean; delta?: number }) {
  const colors: Record<string, [string, string]> = {
    blue: ["text-blue-600", "border-l-blue-500"],
    green: ["text-green-600", "border-l-green-500"],
    red: ["text-red-500", "border-l-red-400"],
    orange: ["text-orange-500", "border-l-orange-400"],
    purple: ["text-purple-600", "border-l-purple-500"],
    gray: ["text-gray-700", "border-l-gray-400"],
  };
  const dk: Record<string, [string, string]> = {
    blue: ["text-blue-400", "border-l-blue-500"],
    green: ["text-green-400", "border-l-green-400"],
    red: ["text-red-400", "border-l-red-400"],
    orange: ["text-orange-400", "border-l-orange-400"],
    purple: ["text-purple-400", "border-l-purple-400"],
    gray: ["text-gray-300", "border-l-gray-500"],
  };
  const [tc, bc] = (isDark ? dk : colors)[color] ?? (isDark ? dk : colors).blue;
  return (
    <div className={`rounded-lg border-l-4 ${bc} p-3 shadow-sm min-w-0 ${isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-100"}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 truncate ${isDark ? "text-gray-500" : "text-gray-400"}`}>{label}</div>
      <div className={`text-base font-bold ${tc} truncate`}>{value}</div>
      <DeltaBadge delta={delta} />
    </div>
  );
}

function KPIRow({ kpi, isDark }: { kpi: KPIResult; isDark: boolean }) {
  const t = kpi.total, tx = kpi.txActive;
  const pctC = t ? (kpi.complete / t) * 100 : 0;
  const pctX = t ? (kpi.cancel / t) * 100 : 0;
  const aov = t ? kpi.gmv / t : 0;
  const gmvTx = tx ? kpi.gmv / tx : 0;
  const tpd = tx ? t / tx : 0;
  const d7GmvTx = (kpi.d7TxActive ?? 0) ? (kpi.d7Gmv ?? 0) / (kpi.d7TxActive!) : 0;
  const d7Tpd = (kpi.d7TxActive ?? 0) ? (kpi.d7Total ?? 0) / (kpi.d7TxActive!) : 0;
  const cards = [
    { label: "GMV", value: formatGMV(kpi.gmv), color: "blue", delta: deltaPct(kpi.gmv, kpi.d7Gmv) },
    { label: "Tổng đơn", value: fmt(t), color: "gray", delta: deltaPct(t, kpi.d7Total) },
    { label: "% Hoàn thành", value: pctC.toFixed(1) + "%", color: "green" },
    { label: "AOV", value: fmt(aov), color: "purple" },
    { label: "Đơn hủy", value: fmt(kpi.cancel), color: "red" },
    { label: "% Hủy", value: pctX.toFixed(1) + "%", color: "orange" },
    { label: "Processing", value: fmt(kpi.processing), color: "blue" },
    { label: "TX Active", value: fmt(tx), color: "green", delta: deltaPct(tx, kpi.d7TxActive) },
    { label: "GMV/TX", value: formatGMV(gmvTx), color: "blue", delta: (kpi.d7TxActive ?? 0) ? deltaPct(gmvTx, d7GmvTx) : undefined },
    { label: "TpD", value: tpd.toFixed(1), color: "purple", delta: (kpi.d7TxActive ?? 0) ? deltaPct(tpd, d7Tpd) : undefined },
  ];
  return (
    <div className="grid grid-cols-5 gap-2">
      {cards.map(c => <KPICard key={c.label} {...c} isDark={isDark} />)}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Dashboard({ onImportNew, refreshKey = 0, currentUser }: DashboardProps) {
  const [isDark, setIsDark] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [tablePage, setTablePage] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const [kpiData, setKpiData] = useState<KPIData | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [teamReport, setTeamReport] = useState<TeamRow[]>([]);
  const [teamSortCol, setTeamSortCol] = useState<string>("gmv");
  const [teamSortDir, setTeamSortDir] = useState<"asc" | "desc">("desc");
  const [importingDrivers, setImportingDrivers] = useState(false);
  const [txHourly, setTxHourly] = useState<{ hour: string; today: number; d7: number }[]>([]);
  const [txByTeam, setTxByTeam] = useState<Record<string, { hour: string; count: number }[]>>({});
  const [txByTeamD7, setTxByTeamD7] = useState<Record<string, { hour: string; count: number }[]>>({});
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [showTeamLines, setShowTeamLines] = useState(false);
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const [driverInfo, setDriverInfo] = useState<{ total: number; lastImport: string | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const watermarkText = currentUser ? (currentUser.display_name || currentUser.username) : undefined;

  // Ref so fetchTable stays stable (not recreated when hour changes)
  const selectedHourRef = useRef<number | null>(null);

  const nationalRef = useRef<HTMLDivElement>(null);
  const regionsRef = useRef<HTMLDivElement>(null);
  const hourlyRef = useRef<HTMLDivElement>(null);
  const dailyRef = useRef<HTMLDivElement>(null);
  const teamReportRef = useRef<HTMLDivElement>(null);
  const driverChartRef = useRef<HTMLDivElement>(null);
  const driverFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const fetchAll = useCallback(async (date: string, regions: string[], hour: number | null) => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const dateStr = date ? `date=${date}` : "";
      const regionsStr = regions.length > 0 ? `regions=${encodeURIComponent(regions.join(","))}` : "";
      const hourStr = hour !== null ? `hour=${hour}` : "";
      const parts = [dateStr, regionsStr, hourStr].filter(Boolean);
      const qs = parts.length ? "?" + parts.join("&") : "";
      const chartParts = [dateStr, regionsStr].filter(Boolean);
      const chartQs = chartParts.length ? "?" + chartParts.join("&") : "";
      const [k, c] = await Promise.all([
        fetch(`/api/kpis${qs}`).then(r => r.json()),
        fetch(`/api/chart${chartQs}`).then(r => r.json()),
      ]);
      setKpiData(k);
      setChartData(c);
      if (!date && k.availableDates?.length) {
        setSelectedDate(k.availableDates[0]);
      }
    } finally { setLoading(false); }
  }, []);

  // fetchTable uses ref so it stays stable and doesn't trigger the reset useEffect
  const fetchTable = useCallback(async (page: number) => {
    setTableLoading(true);
    setSelectedIds(new Set());
    try {
      const h = selectedHourRef.current;
      const hourStr = h !== null ? `&hour=${h}` : "";
      const t = await fetch(`/api/rows?page=${page}&limit=100${hourStr}`).then(r => r.json());
      setTableData(t);
    } finally { setTableLoading(false); }
  }, []); // stable — no selectedHour dep

  const fetchTeamReport = useCallback(async () => {
    const p = new URLSearchParams();
    if (selectedDate) p.set("date", selectedDate);
    if (selectedHourRef.current !== null) p.set("hour", String(selectedHourRef.current));
    try {
      const r = await fetch("/api/team-report?" + p.toString());
      const d = await r.json();
      if (!d.error) setTeamReport(d.teams || []);
    } catch { }
  }, [selectedDate]);

  const fetchDriverInfo = useCallback(async () => {
    try {
      const r = await fetch("/api/drivers");
      const d = await r.json();
      if (!d.error) setDriverInfo({ total: d.total, lastImport: d.lastImport });
    } catch { }
  }, []);

  const fetchTxHourly = useCallback(async () => {
    const p = new URLSearchParams();
    if (selectedDate) p.set("date", selectedDate);
    try {
      const r = await fetch("/api/driver-hourly?" + p.toString());
      if (!r.ok) return;
      const data = await r.json();
      setTxHourly(data.hourly || []);
      setTxByTeam(data.byTeam || {});
      setTxByTeamD7(data.byTeamD7 || {});
      setTeamNames(data.teams || []);
    } catch { }
  }, [selectedDate]);

  useEffect(() => {
    selectedHourRef.current = null;
    setSelectedDate(""); setSelectedRegions([]); setSelectedHour(null);
    fetchAll("", [], null); fetchTable(0); setTablePage(0);
  }, [refreshKey, fetchAll, fetchTable]); // fetchTable is now stable — won't re-fire on hour change
  useEffect(() => { fetchTable(tablePage); }, [tablePage, fetchTable]);
  useEffect(() => { fetchTeamReport(); }, [fetchTeamReport]);
  useEffect(() => { fetchTxHourly(); }, [fetchTxHourly]);
  useEffect(() => { fetchDriverInfo(); }, [fetchDriverInfo]);

  function toggleRegion(region: string) {
    const next = selectedRegions.includes(region)
      ? selectedRegions.filter(r => r !== region)
      : [...selectedRegions, region];
    setSelectedRegions(next);
    fetchAll(selectedDate, next, selectedHour);
  }
  function handleDateChange(date: string) {
    setSelectedDate(date);
    fetchAll(date, selectedRegions, selectedHour);
  }
  function handleHourChange(h: number | null) {
    selectedHourRef.current = h; // update ref synchronously BEFORE any fetch
    setSelectedHour(h);
    fetchAll(selectedDate, selectedRegions, h);
    fetchTable(0); // re-fetch table with new hour (ref already updated)
    fetchTeamReport(); // re-fetch team report with new hour
    setTablePage(0);
  }
  function toggleHiddenLine(key: string) {
    setHiddenLines(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  async function handleResetConfirmed() {
    await fetch("/api/rows", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    setConfirm(null);
    selectedHourRef.current = null;
    setSelectedDate(""); setSelectedRegions([]); setSelectedHour(null);
    fetchAll("", [], null); fetchTable(0); setTablePage(0);
  }
  async function handleDeleteRowsConfirmed() {
    await fetch("/api/rows", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...selectedIds] }) });
    setConfirm(null);
    fetchAll(selectedDate, selectedRegions, selectedHour); fetchTable(tablePage);
  }
  const handleDriverFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingDrivers(true);
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
      const headers = raw[0].map(h => String(h || "").trim());
      const iSap = headers.indexOf("Mã SAP");
      const iTT = headers.indexOf("Trạng thái");
      const iTTTK = headers.indexOf("Trạng thái tài khoản");
      const iDepot = headers.indexOf("Depot");
      const iDoi = headers.indexOf("Đội");
      if ([iSap, iTT, iTTTK, iDepot, iDoi].some(i => i === -1)) {
        alert("Không tìm thấy đủ cột: Mã SAP, Trạng thái, Trạng thái tài khoản, Depot, Đội");
        return;
      }
      const rows = raw.slice(1)
        .filter(r => r[iSap] &&
          String(r[iTT] || "").trim() === "Active" &&
          String(r[iTTTK] || "").trim() === "Unlock" &&
          String(r[iDepot] || "").trim() === "1032")
        .map(r => ({ sap_id: String(r[iSap]).trim(), doi: String(r[iDoi] || "").trim() }));
      const res = await fetch("/api/drivers", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (json.error) { alert("Lỗi: " + json.error); return; }
      await fetchDriverInfo(); await fetchTeamReport();
    } catch (err) {
      alert("Lỗi đọc file: " + String(err));
    } finally { setImportingDrivers(false); e.target.value = ""; }
  }, [fetchDriverInfo, fetchTeamReport]);

  const bg = isDark ? "bg-gray-900" : "bg-gray-50";
  const cardCls = isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200";
  const textPri = isDark ? "text-gray-100" : "text-gray-800";
  const textSec = isDark ? "text-gray-400" : "text-gray-500";
  const grid = isDark ? "#374151" : "#f0f0f0";
  const tick = isDark ? "#9ca3af" : "#6b7280";
  const tt = isDark ? { contentStyle: { background: "#1f2937", border: "1px solid #374151", fontSize: 12, color: "#f3f4f6" } } : { contentStyle: { fontSize: 12 } };

  const natKPI = kpiData?.national;
  const isEmpty = !natKPI || natKPI.total === 0;
  const availDates = kpiData?.availableDates ?? [];
  const displayDate = selectedDate || natKPI?.maxDate || "";
  const todayLabel = displayDate ? new Date(displayDate + "T00:00:00").toLocaleDateString("vi-VN") : "";
  const importTimeStr = formatImportTime(kpiData?.lastImportAt ?? null);
  const importRelStr = getRelativeStr(kpiData?.lastImportAt ?? null, now);
  const importIsStale = isImportStale(kpiData?.lastImportAt ?? null, now);
  const todayShort = chartData?.todayDate?.slice(5).replace("-", "/") ?? "—";
  const d7Short = chartData?.d7Date?.slice(5).replace("-", "/") ?? "—";
  const visibleRows = tableData?.rows ?? [];
  const allSelected = visibleRows.length > 0 && visibleRows.every(r => selectedIds.has(r.id));
  const totalPages = tableData ? Math.ceil(tableData.total / tableData.limit) : 0;

  const sortedTeamReport = useMemo(() => {
    return [...teamReport].map(t => {
      const tpd = t.driver_active > 0 ? t.trip_complete / t.driver_active : 0;
      const tpdPrev = t.driver_active_prev && t.driver_active_prev > 0 ? (t.trip_complete_prev ?? 0) / t.driver_active_prev : null;
      return {
        ...t, tpd,
        wGmv: wowPct(t.gmv, t.gmv_prev),
        wDa: wowPct(t.driver_active, t.driver_active_prev),
        wTc: wowPct(t.trip_complete, t.trip_complete_prev),
        wTpd: wowPct(tpd, tpdPrev)
      };
    }).sort((a, b) => {
      let v1: any = a[teamSortCol as keyof typeof a];
      let v2: any = b[teamSortCol as keyof typeof b];
      if (typeof v1 === "string") return teamSortDir === "asc" ? v1.localeCompare(v2) : v2.localeCompare(v1);
      v1 = v1 ?? -Infinity; v2 = v2 ?? -Infinity;
      return teamSortDir === "asc" ? v1 - v2 : v2 - v1;
    });
  }, [teamReport, teamSortCol, teamSortDir]);

  // Driver Active chart data
  const TEAM_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#06b6d4", "#d946ef", "#0ea5e9", "#a855f7", "#22c55e", "#e11d48", "#facc15", "#2dd4bf", "#fb923c", "#818cf8"];
  const driverChartData = txHourly.map(h => {
    const row: Record<string, string | number> = { hour: h.hour, today: h.today, d7: h.d7 };
    if (showTeamLines) {
      teamNames.forEach(team => {
        const entry = (txByTeam[team] ?? []).find(x => x.hour === h.hour);
        row[team] = entry?.count ?? 0;

        const entryD7 = (txByTeamD7[team] ?? []).find(x => x.hour === h.hour);
        row[team + "_d7"] = entryD7?.count ?? 0;
      });
    }
    return row;
  });
  const hasD7Data = txHourly.some(h => h.d7 > 0);

  return (
    <div className={`min-h-screen ${bg}`}>
      {confirm?.type === "reset" && (
        <ConfirmDialog title="Xóa toàn bộ data" isDark={isDark}
          message="Bạn có chắc muốn xóa toàn bộ dữ liệu? Hành động này không thể hoàn tác."
          onConfirm={handleResetConfirmed} onCancel={() => setConfirm(null)} />
      )}
      {confirm?.type === "deleteRows" && (
        <ConfirmDialog title="Xóa các dòng đã chọn" isDark={isDark}
          message={`Bạn có chắc muốn xóa ${confirm.count.toLocaleString()} dòng đã chọn?`}
          onConfirm={handleDeleteRowsConfirmed} onCancel={() => setConfirm(null)} />
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={`sticky top-0 z-20 border-b px-6 py-3 shadow-sm`} style={{ background: isDark ? "#1a8a8b" : "#27BDBE", borderColor: isDark ? "#178384" : "#22a7a8" }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className={`text-sm font-bold uppercase tracking-wide ${textPri}`}>📊 BÁO CÁO VẬN HÀNH PLATFORM</h1>
            <p className={`text-xs mt-0.5 ${textSec}`}>
              {loading ? "Đang tải..." : isEmpty ? "Chưa có dữ liệu" : `${(natKPI?.total ?? 0).toLocaleString()} đơn · ${todayLabel}${selectedHour !== null ? ` · 00:00–${String(selectedHour).padStart(2, "0")}:00` : (kpiData?.importHour != null ? ` · 00:00–${String(kpiData.importHour).padStart(2, "0")}:00` : "")}`}
            </p>
            {importTimeStr && (
              <p className={`text-xs ${importIsStale ? "text-red-500" : (isDark ? "text-gray-500" : "text-gray-400")}`}>
                Cập nhật lúc: {importTimeStr} {importRelStr}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date */}
            {availDates.length > 0 && (
              <select value={selectedDate} onChange={e => handleDateChange(e.target.value)}
                className={`text-xs px-2 py-1.5 rounded-lg border ${isDark ? "bg-gray-700 border-gray-600 text-gray-200" : "bg-white border-gray-300 text-gray-700"}`}>
                {availDates.map(d => (
                  <option key={d} value={d}>{new Date(d + "T00:00:00").toLocaleDateString("vi-VN")}</option>
                ))}
              </select>
            )}
            {/* Hour */}
            <select value={selectedHour ?? ""} onChange={e => handleHourChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
              className={`text-xs px-2 py-1.5 rounded-lg border ${isDark ? "bg-gray-700 border-gray-600 text-gray-200" : "bg-white border-gray-300 text-gray-700"}`}>
              <option value="">Cả ngày</option>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
              ))}
            </select>
            {/* Region */}
            <div className={`flex items-center gap-1 text-xs ${textSec}`}>
              <span>Khu vực:</span>
              <button onClick={() => { setSelectedRegions([]); fetchAll(selectedDate, [], selectedHour); }}
                className={`px-2 py-1 rounded border ${selectedRegions.length === 0 ? "bg-blue-600 border-blue-600 text-white" : (isDark ? "border-gray-600 text-gray-400 hover:border-gray-400" : "border-gray-300 text-gray-500 hover:border-gray-400")}`}>
                Tất cả
              </button>
              {ALL_REGIONS.map(r => (
                <button key={r} onClick={() => toggleRegion(r)}
                  className={`px-2 py-1 rounded border ${selectedRegions.includes(r) ? "bg-blue-600 border-blue-600 text-white" : (isDark ? "border-gray-600 text-gray-400 hover:border-gray-400" : "border-gray-300 text-gray-500 hover:border-gray-400")}`}>
                  {REGION_EMOJIS[r]} {r}
                </button>
              ))}
            </div>
            <button onClick={() => setIsDark(v => !v)}
              className={`px-3 py-1.5 text-sm rounded-lg border ${isDark ? "border-gray-600 text-yellow-400 hover:bg-gray-700" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}>
              {isDark ? "☀️" : "🌙"}
            </button>
            <button onClick={onImportNew}
              className={`px-3 py-1.5 text-sm rounded-lg border ${isDark ? "border-gray-600 text-gray-300 hover:bg-gray-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
              📤 Import
            </button>
            <button onClick={() => setConfirm({ type: "reset" })}
              className={`px-3 py-1.5 text-sm rounded-lg border ${isDark ? "border-red-800 text-red-400 hover:bg-red-900/30" : "border-red-200 text-red-600 hover:bg-red-50"}`}>
              🗑 Reset
            </button>
            <div className="flex items-center gap-1">
              <input ref={driverFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleDriverFile} />
              <button onClick={() => driverFileRef.current?.click()} disabled={importingDrivers}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                {importingDrivers ? "Đang import..." : "Cập nhật ds tx"}
              </button>
              {driverInfo && <span className={"text-xs " + (isDark ? "text-gray-400" : "text-gray-500")}>({driverInfo.total} tx)</span>}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : isEmpty ? (
        <div className={`flex flex-col items-center justify-center h-64 gap-4 ${textSec}`}>
          <p>Chưa có dữ liệu. Vui lòng upload file Excel.</p>
          <button onClick={onImportNew} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Upload File</button>
        </div>
      ) : (
        <div className="p-6 space-y-6 w-[90%] mx-auto">

          {/* ── National KPI ─────────────────────────────────────────────── */}
          <div ref={nationalRef} className={`rounded-xl border p-5 shadow-sm ${cardCls}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🌐</span>
                <h2 className={`font-bold text-sm uppercase tracking-wide ${textPri}`}>Toàn Quốc</h2>
                <span className={`text-xs ${textSec}`}>({(natKPI?.total ?? 0).toLocaleString()} đơn)</span>
              </div>
              <ScreenshotBtn targetRef={nationalRef} isDark={isDark} watermarkText={watermarkText} />
            </div>
            {natKPI && <KPIRow kpi={natKPI} isDark={isDark} />}
          </div>

          {/* ── Regions ──────────────────────────────────────────────────── */}
          {(kpiData?.regions.length ?? 0) > 0 && (
            <div ref={regionsRef} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className={`font-bold text-sm uppercase tracking-wide ${textSec}`}>Theo Khu Vực</h2>
                <ScreenshotBtn targetRef={regionsRef} isDark={isDark} watermarkText={watermarkText} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {kpiData!.regions.map(r => (
                  <div key={r.region} className={`rounded-xl border p-4 shadow-sm ${cardCls}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span>{REGION_EMOJIS[r.region] ?? "📍"}</span>
                      <h3 className={`font-bold text-xs uppercase tracking-wide ${textPri}`}>{r.region}</h3>
                      <span className={`text-xs ${textSec}`}>({r.total.toLocaleString()} đơn)</span>
                    </div>
                    <KPIRow kpi={r} isDark={isDark} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── GMV Hourly chart ─────────────────────────────────────────── */}
          {chartData && (
            <div ref={hourlyRef} className={`rounded-xl border p-5 shadow-sm ${cardCls}`}>
              <div className="flex items-center justify-between mb-1">
                <h3 className={`font-semibold text-sm ${textPri}`}>
                  📈 GMV theo giờ — <span className="text-blue-500">{selectedDate ? "Ngày lọc" : "Hôm nay"} ({todayShort})</span> vs <span className={textSec}>D-7 ({d7Short})</span>
                </h3>
                <ScreenshotBtn targetRef={hourlyRef} isDark={isDark} watermarkText={watermarkText} />
              </div>
              <p className={`text-xs mb-4 ${textSec}`}>Đơn vị: Triệu VNĐ</p>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData.hourly} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: tick }} />
                  <YAxis tick={{ fontSize: 11, fill: tick }} width={50} />
                  <Tooltip {...tt} formatter={(v: number, n: string) => [`${v} Tr`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="today" name={`Hôm nay (${todayShort})`} stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }}>
                    <LabelList dataKey="today" position="top" style={{ fontSize: 9, fill: isDark ? "#9ca3af" : "#374151" }} formatter={(v: number) => v > 0 ? v.toFixed(1) + "Tr" : ""} />
                  </Line>
                  <Line type="monotone" dataKey="d7" name={`D-7 (${d7Short})`} stroke="#9ca3af" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2 }} activeDot={{ r: 4 }}>
                    <LabelList dataKey="d7" position="bottom" style={{ fontSize: 9, fill: isDark ? "#9ca3af" : "#374151" }} formatter={(v: number) => v > 0 ? v.toFixed(1) + "Tr" : ""} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Team Report ──────────────────────────────────────────────── */}
          <div className="mt-6">
            <div ref={teamReportRef} className={"rounded-xl overflow-hidden border " + (isDark ? "border-gray-700" : "border-gray-200")}>
              <div className={"flex items-center justify-between px-4 py-3 " + (isDark ? "bg-gray-800" : "bg-gray-50")}>
                <h3 className={"text-sm font-semibold " + (isDark ? "text-white" : "text-gray-800")}>Báo cáo theo đội</h3>
                <ScreenshotBtn targetRef={teamReportRef} isDark={isDark} watermarkText={watermarkText} />
              </div>
              <div className="overflow-x-auto">
                <table className={"w-full text-xs " + (isDark ? "bg-gray-900 text-gray-200" : "bg-white text-gray-700")}>
                  <thead>
                    <tr className={isDark ? "bg-gray-800 text-gray-400" : "bg-gray-50 text-gray-500"}>
                      {(() => {
                        const th = (key: string, label: string, align: string) => {
                          const dir = teamSortCol === key ? teamSortDir : null;
                          return (
                            <th key={key} className={`px-3 py-2 text-${align} cursor-pointer select-none hover:${isDark ? "bg-gray-700 text-gray-200" : "bg-gray-200 text-gray-800"}`}
                              onClick={() => {
                                if (teamSortCol === key) setTeamSortDir(d => d === "asc" ? "desc" : "asc");
                                else { setTeamSortCol(key); setTeamSortDir("desc"); }
                              }}>
                              {label} {dir === "asc" ? "↑" : dir === "desc" ? "↓" : <span className="opacity-0">↕</span>}
                            </th>
                          );
                        };
                        return (
                          <>
                            {th("doi", "Đội", "left")}
                            {th("gmv", "GMV", "right")} {th("wGmv", "WoW%", "right")}
                            {th("driver_active", "Driver Act", "right")} {th("wDa", "WoW%", "right")}
                            {th("trip_complete", "Trip Cpl", "right")} {th("wTc", "WoW%", "right")}
                            {th("tpd", "TpD", "right")} {th("wTpd", "WoW%", "right")}
                          </>
                        );
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTeamReport.map((t: any) => {
                      const { wGmv, wDa, wTc, wTpd, tpd } = t;
                      const wFmt = (v: number | null) => v === null ? "-" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
                      const wCls = (v: number | null) => v === null ? "" : v >= 0 ? "text-green-500" : "text-red-500";
                      return (
                        <tr key={t.doi} className={isDark ? "border-t border-gray-800 hover:bg-gray-800" : "border-t border-gray-100 hover:bg-gray-50"}>
                          <td className="px-3 py-2 font-medium">{t.doi}</td>
                          <td className="px-3 py-2 text-right">{(t.gmv / 1e6).toFixed(1)}M</td>
                          <td className={"px-3 py-2 text-right font-medium " + wCls(wGmv)}>{wFmt(wGmv)}</td>
                          <td className="px-3 py-2 text-right">{t.driver_active}</td>
                          <td className={"px-3 py-2 text-right font-medium " + wCls(wDa)}>{wFmt(wDa)}</td>
                          <td className="px-3 py-2 text-right">{t.trip_complete}</td>
                          <td className={"px-3 py-2 text-right font-medium " + wCls(wTc)}>{wFmt(wTc)}</td>
                          <td className="px-3 py-2 text-right">{tpd.toFixed(2)}</td>
                          <td className={"px-3 py-2 text-right font-medium " + wCls(wTpd)}>{wFmt(wTpd)}</td>
                        </tr>
                      );
                    })}
                    {(() => {
                      const targets = teamReport.filter((t: any) => t.doi && t.doi.startsWith("PLF.HCM.DOIXE"));
                      if (targets.length === 0) return null;
                      let gmv = 0, gmv_prev = 0, driver_active = 0, driver_active_prev = 0, trip_complete = 0, trip_complete_prev = 0;
                      for (const t of targets) {
                        gmv += t.gmv || 0; gmv_prev += t.gmv_prev || 0;
                        driver_active += t.driver_active || 0; driver_active_prev += t.driver_active_prev || 0;
                        trip_complete += t.trip_complete || 0; trip_complete_prev += t.trip_complete_prev || 0;
                      }
                      const tpd = driver_active > 0 ? trip_complete / driver_active : 0;
                      const tpdPrev = driver_active_prev > 0 ? trip_complete_prev / driver_active_prev : null;
                      const wGmv = wowPct(gmv, gmv_prev); const wDa = wowPct(driver_active, driver_active_prev);
                      const wTc = wowPct(trip_complete, trip_complete_prev); const wTpd = wowPct(tpd, tpdPrev);
                      const wFmt = (v: number | null) => v === null ? "-" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
                      const wCls = (v: number | null) => v === null ? "" : v >= 0 ? "text-green-500" : "text-red-500";
                      return (
                        <tr className={"border-t-2 border-dashed " + (isDark ? "border-gray-500 bg-gray-800" : "border-gray-300 bg-gray-50")}>
                          <td className={"px-3 py-2 font-bold " + (isDark ? "text-blue-400" : "text-blue-600")}>Platform HCM</td>
                          <td className="px-3 py-2 text-right font-bold">{(gmv / 1e6).toFixed(1)}M</td>
                          <td className={"px-3 py-2 text-right font-bold " + wCls(wGmv)}>{wFmt(wGmv)}</td>
                          <td className="px-3 py-2 text-right font-bold">{driver_active}</td>
                          <td className={"px-3 py-2 text-right font-bold " + wCls(wDa)}>{wFmt(wDa)}</td>
                          <td className="px-3 py-2 text-right font-bold">{trip_complete}</td>
                          <td className={"px-3 py-2 text-right font-bold " + wCls(wTc)}>{wFmt(wTc)}</td>
                          <td className="px-3 py-2 text-right font-bold">{tpd.toFixed(2)}</td>
                          <td className={"px-3 py-2 text-right font-bold " + wCls(wTpd)}>{wFmt(wTpd)}</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── Driver Active by Hour ─────────────────────────────────────── */}
          {txHourly.length > 0 && (
            <div ref={driverChartRef} className={`rounded-xl border overflow-hidden ${cardCls}`}>
              <div className={`flex items-center justify-between px-4 py-3 ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
                <h3 className={`text-sm font-semibold ${textPri}`}>🚗 Driver Active theo giờ</h3>
                <div className="flex items-center gap-3">
                  <div className={`flex rounded-lg border overflow-hidden text-xs ${isDark ? "border-gray-600" : "border-gray-300"}`}>
                    <button onClick={() => { setShowTeamLines(false); setHiddenLines(new Set()); }}
                      className={`px-3 py-1.5 ${!showTeamLines ? "bg-blue-600 text-white" : (isDark ? "text-gray-300 hover:bg-gray-700" : "text-gray-600 hover:bg-gray-100")}`}>
                      Tổng
                    </button>
                    <button onClick={() => { setShowTeamLines(true); setHiddenLines(new Set()); }}
                      className={`px-3 py-1.5 border-l ${isDark ? "border-gray-600" : "border-gray-300"} ${showTeamLines ? "bg-blue-600 text-white" : (isDark ? "text-gray-300 hover:bg-gray-700" : "text-gray-600 hover:bg-gray-100")}`}>
                      Theo đội
                    </button>
                  </div>
                  <ScreenshotBtn targetRef={driverChartRef} isDark={isDark} watermarkText={watermarkText} />
                </div>
              </div>
              <div className={`p-4 ${isDark ? "bg-gray-900" : "bg-white"}`}>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={driverChartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                    <XAxis dataKey="hour" tick={{ fill: tick, fontSize: 11 }} tickFormatter={h => h + "h"} />
                    <YAxis tick={{ fill: tick, fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: isDark ? "#1f2937" : "#fff", border: "1px solid " + (isDark ? "#374151" : "#e5e7eb"), borderRadius: 8, fontSize: 12 }}
                      labelFormatter={h => "Giờ " + h} />
                    <Legend wrapperStyle={{ fontSize: 12, cursor: showTeamLines ? "pointer" : "default" }}
                      onClick={showTeamLines ? (data: any) => { if (data.dataKey) toggleHiddenLine(String(data.dataKey)); } : undefined} />
                    {/* FIX: no fragment wrapper — Recharts needs Line as direct child, not inside React fragment */}
                    {!showTeamLines && (
                      <Line type="monotone" dataKey="today" name="H\u00f4m nay" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }}>
                        <LabelList dataKey="today" position="top" style={{ fontSize: 9, fill: tick }} formatter={(v: number) => v > 0 ? String(v) : ""} />
                      </Line>
                    )}
                    {!showTeamLines && hasD7Data && (
                      <Line type="monotone" dataKey="d7" name="D-7" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2 }} activeDot={{ r: 4 }}>
                        <LabelList dataKey="d7" position="bottom" style={{ fontSize: 9, fill: tick }} formatter={(v: number) => v > 0 ? String(v) : ""} />
                      </Line>
                    )}
                    {showTeamLines && teamNames.map((team, i) => (
                      <Line key={team} type="monotone" dataKey={team} name={team}
                        stroke={TEAM_COLORS[i % TEAM_COLORS.length]} strokeWidth={2.5}
                        dot={{ r: 3 }} activeDot={{ r: 5 }}
                        hide={hiddenLines.has(team)}
                        strokeOpacity={hiddenLines.has(team) ? 0.2 : 1}>
                        {!hiddenLines.has(team) && <LabelList dataKey={team} position="top" style={{ fontSize: 8, fill: TEAM_COLORS[i % TEAM_COLORS.length] }} formatter={(v: number) => v > 0 ? String(v) : ""} />}
                      </Line>
                    ))}
                    {showTeamLines && teamNames.map((team, i) => (
                      <Line key={team + "_d7"} type="monotone" dataKey={team + "_d7"} name={team + " (D-7)"} legendType="none"
                        stroke={TEAM_COLORS[i % TEAM_COLORS.length]} strokeWidth={2} strokeDasharray="4 2"
                        dot={{ r: 2 }} activeDot={{ r: 4 }}
                        hide={hiddenLines.has(team)}
                        strokeOpacity={hiddenLines.has(team) ? 0.2 : 0.6}>
                        {!hiddenLines.has(team) && <LabelList dataKey={team + "_d7"} position="bottom" style={{ fontSize: 8, fill: TEAM_COLORS[i % TEAM_COLORS.length] }} formatter={(v: number) => v > 0 ? String(v) : ""} />}
                      </Line>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                {showTeamLines && (
                  <p className={`text-xs mt-1 text-center ${textSec}`}>Click tên trên legend để bật/tắt đường</p>
                )}
              </div>
            </div>
          )}

          {/* ── Daily chart ──────────────────────────────────────────────── */}
          {chartData && (
            <div ref={dailyRef} className={`rounded-xl border p-5 shadow-sm ${cardCls}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-semibold text-sm ${textPri}`}>📅 Số đơn theo ngày (10 ngày gần nhất)</h3>
                <ScreenshotBtn targetRef={dailyRef} isDark={isDark} watermarkText={watermarkText} />
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData.daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: tick }} />
                  <YAxis tick={{ fontSize: 11, fill: tick }} width={50} />
                  <Tooltip {...tt} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="complete" name="Hoàn thành" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }}>
                    <LabelList dataKey="complete" position="top" style={{ fontSize: 9, fill: tick }} formatter={(v: number) => String(v)} />
                  </Line>
                  <Line type="monotone" dataKey="processing" name="Processing" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }}>
                    <LabelList dataKey="processing" position="top" style={{ fontSize: 9, fill: tick }} formatter={(v: number) => String(v)} />
                  </Line>
                  <Line type="monotone" dataKey="cancel" name="Hủy" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }}>
                    <LabelList dataKey="cancel" position="top" style={{ fontSize: 9, fill: tick }} formatter={(v: number) => String(v)} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Table ────────────────────────────────────────────────────── */}
          <div className={`rounded-xl border shadow-sm overflow-hidden ${cardCls}`}>
            <div className={`px-4 py-2 border-b flex items-center justify-between gap-3 flex-wrap ${isDark ? "bg-gray-900 border-gray-700" : "bg-gray-50 border-gray-100"}`}>
              <span className={`text-xs ${textSec}`}>
                {tableLoading ? "Đang tải..." : `${(tableData?.total ?? 0).toLocaleString()} dòng · trang ${tablePage + 1}/${totalPages || 1}`}
              </span>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <button onClick={() => setConfirm({ type: "deleteRows", count: selectedIds.size })}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium">
                    🗑 Xóa {selectedIds.size.toLocaleString()} dòng
                  </button>
                )}
                <button onClick={() => setTablePage(p => Math.max(0, p - 1))} disabled={tablePage === 0 || tableLoading}
                  className={`text-xs px-2.5 py-1.5 rounded border disabled:opacity-40 ${isDark ? "border-gray-600 text-gray-300" : "border-gray-300 text-gray-600"}`}>← Trước</button>
                <button onClick={() => setTablePage(p => Math.min(totalPages - 1, p + 1))} disabled={tablePage >= totalPages - 1 || tableLoading}
                  className={`text-xs px-2.5 py-1.5 rounded border disabled:opacity-40 ${isDark ? "border-gray-600 text-gray-300" : "border-gray-300 text-gray-600"}`}>Sau →</button>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${isDark ? "bg-gray-900 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                    <th className="px-3 py-2 w-8">
                      <input type="checkbox" checked={allSelected}
                        onChange={e => setSelectedIds(e.target.checked ? new Set(visibleRows.map(r => r.id)) : new Set())}
                        className="w-3.5 h-3.5 cursor-pointer accent-blue-500" />
                    </th>
                    {["Order ID", "Create Date", "Status", "Depot", "Total Pay", "Pickup City", "Sap ID", "Distance"].map(h => (
                      <th key={h} className={`px-3 py-2 text-left font-semibold text-xs whitespace-nowrap ${isDark ? "text-gray-400" : "text-gray-600"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, i) => {
                    const sg = getStatusGroup(row.status);
                    const stClr: Record<string, string> = {
                      complete: isDark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-50 text-emerald-700",
                      processing: isDark ? "bg-blue-900/40 text-blue-400" : "bg-blue-50 text-blue-700",
                      cancel: isDark ? "bg-red-900/40 text-red-400" : "bg-red-50 text-red-600",
                      other: isDark ? "bg-gray-700 text-gray-400" : "bg-gray-50 text-gray-600",
                    };
                    const sel = selectedIds.has(row.id);
                    const rowBg = sel ? (isDark ? "bg-blue-900/30" : "bg-blue-50")
                      : i % 2 === 0 ? (isDark ? "bg-gray-800" : "bg-white") : (isDark ? "bg-gray-800/60" : "bg-gray-50/40");
                    return (
                      <tr key={row.id} className={`${rowBg} transition-colors`}>
                        <td className="px-3 py-1.5 w-8">
                          <input type="checkbox" checked={sel}
                            onChange={e => setSelectedIds(prev => { const n = new Set(prev); e.target.checked ? n.add(row.id) : n.delete(row.id); return n; })}
                            className="w-3.5 h-3.5 cursor-pointer accent-blue-500" />
                        </td>
                        <td className={`px-3 py-1.5 font-mono text-xs ${textSec}`}>{row.order_id}</td>
                        <td className={`px-3 py-1.5 text-xs whitespace-nowrap ${textSec}`}>{row.create_date} {row.create_hour != null ? String(row.create_hour).padStart(2, "0") + "h" : ""}</td>
                        <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stClr[sg]}`}>{row.status}</span></td>
                        <td className={`px-3 py-1.5 text-xs ${isDark ? "text-gray-300" : "text-gray-700"}`}>{row.depot}</td>
                        <td className={`px-3 py-1.5 text-xs font-medium text-right ${isDark ? "text-gray-300" : "text-gray-700"}`}>{row.total_pay.toLocaleString("vi-VN")}</td>
                        <td className={`px-3 py-1.5 text-xs ${textSec}`}>{row.pickup_city}</td>
                        <td className={`px-3 py-1.5 font-mono text-xs ${textSec}`}>{row.sap_profile_id}</td>
                        <td className={`px-3 py-1.5 text-xs text-right ${isDark ? "text-gray-400" : "text-gray-600"}`}>{row.distance}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
