"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
interface KPIResult {
total: number; gmv: number; complete: number; cancel: number; processing: number; txActive: number;
}
interface KPIData {
national: KPIResult & { maxDate: string | null; minDate: string | null };
regions: Array<{ region: string } & KPIResult>;
availableDates: string[];
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

// ─── Props ────────────────────────────────────────────────────────────────────
interface DashboardProps {
onImportNew: () => void;
refreshKey: number;
}

const ALL_REGIONS = ["Hồ Chí Minh", "Hà Nội", "Miền Nam", "Miền Bắc"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatGMV(v: number) {
if (v >= 1e9) return (v/1e9).toFixed(2) + " Tỉ";
if (v >= 1e6) return (v/1e6).toFixed(1) + " Tr";
if (v >= 1e3) return (v/1e3).toFixed(1) + " K";
return v.toFixed(0);
}
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
function fmtDateVN(dateStr: string) {
const d = new Date(dateStr + "T00:00:00");
return d.toLocaleDateString("vi-VN");
}
function getStatusGroup(s: string) {
const l = s.toLowerCase();
if (l.startsWith("complete")) return "complete";
if (l.startsWith("cancel")) return "cancel";
if (l.startsWith("process") || l === "in progress") return "processing";
return "other";
}

// ─── Sub-components ───────────────────────────────────────────────────────────
async function captureToClipboard(el: HTMLElement, isDark: boolean) {
const w = window as unknown as Record<string,unknown>;
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
return new Promise<void>(res => {
canvas.toBlob(async blob => {
if (!blob) { res(); return; }
try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); }
catch { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = "chart.png"; a.click(); URL.revokeObjectURL(u); }
res();
}, "image/png");
});
}

function ScreenshotBtn({ targetRef, isDark }: { targetRef: React.RefObject<HTMLDivElement | null>; isDark: boolean }) {
const [st, setSt] = useState<"idle"|"busy"|"done">("idle");
return (
<button onClick={async () => {
if (!targetRef.current || st === "busy") return;
setSt("busy"); await captureToClipboard(targetRef.current, isDark); setSt("done"); setTimeout(() => setSt("idle"), 2000);
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

function KPICard({ label, value, color = "blue", isDark }: { label: string; value: string; color?: string; isDark: boolean }) {
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
</div>
);
}

function KPIRow({ kpi, isDark }: { kpi: KPIResult; isDark: boolean }) {
const t = kpi.total, tx = kpi.txActive;
const pctC = (kpi.complete + kpi.cancel) > 0 ? (kpi.complete/(kpi.complete+kpi.cancel))*100 : 0;
const pctX = t ? (kpi.cancel/t)*100 : 0;
const aov = t ? kpi.gmv/t : 0;
const gmvTx = tx ? kpi.gmv/tx : 0;
const tpd = tx ? t/tx : 0;
const order = [
{ label:"GMV", value:formatGMV(kpi.gmv), color:"blue" },
{ label:"Tổng đơn", value:fmt(t), color:"gray" },
{ label:"% Hoàn thành", value:pctC.toFixed(1)+"%", color:"green" },
{ label:"AOV", value:fmt(aov), color:"purple" },
{ label:"Đơn hủy", value:fmt(kpi.cancel), color:"red" },
{ label:"% Hủy", value:pctX.toFixed(1)+"%", color:"orange" },
];
const tx2 = [
{ label:"TX Active", value:fmt(tx), color:"green" },
{ label:"GMV/TX", value:formatGMV(gmvTx), color:"blue" },
{ label:"TpD", value:tpd.toFixed(1), color:"purple" },
];
return (
<div className="space-y-2">
<div className="grid grid-cols-6 gap-2">{order.map(c => <KPICard key={c.label} {...c} isDark={isDark} />)}</div>
<div className={`border-t pt-2 ${isDark ? "border-gray-700" : "border-gray-100"}`}>
<div className="grid grid-cols-3 gap-2 max-w-sm">{tx2.map(c => <KPICard key={c.label} {...c} isDark={isDark} />)}</div>
</div>
</div>
);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Dashboard({ onImportNew, refreshKey }: DashboardProps) {
const [isDark, setIsDark] = useState(false);
const [confirm, setConfirm] = useState<ConfirmState>(null);
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
const [tablePage, setTablePage] = useState(0);

const [kpiData, setKpiData] = useState<KPIData | null>(null);
const [chartData, setChartData] = useState<ChartData | null>(null);
const [tableData, setTableData] = useState<TableData | null>(null);
const [loading, setLoading] = useState(true);
const [tableLoading, setTableLoading] = useState(false);

const [selectedDate, setSelectedDate] = useState<string>("");
const [availableDates, setAvailableDates] = useState<string[]>([]);
const [selectedRegions, setSelectedRegions] = useState<string[]>([]);

const nationalRef = useRef<HTMLDivElement>(null);
const regionsRef = useRef<HTMLDivElement>(null);
const hourlyRef = useRef<HTMLDivElement>(null);
const dailyRef = useRef<HTMLDivElement>(null);

const fetchAll = useCallback(async (date: string, regions: string[]) => {
setLoading(true);
setSelectedIds(new Set());
try {
const regionsParam = regions.length > 0 ? `regions=${encodeURIComponent(regions.join(","))}` : "";
const dateStr = date ? `date=${date}` : "";
const sep = dateStr && regionsParam ? "&" : "";
const kpisUrl = `/api/kpis?${dateStr}${sep}${regionsParam}`;
const chartUrl = `/api/chart?${regionsParam}`;
const [k, c] = await Promise.all([
fetch(kpisUrl).then(r => r.json()),
fetch(chartUrl).then(r => r.json()),
]);
setKpiData(k);
setChartData(c);
if (Array.isArray(k.availableDates)) setAvailableDates(k.availableDates);
} finally { setLoading(false); }
}, []);

const fetchTable = useCallback(async (page: number) => {
setTableLoading(true);
setSelectedIds(new Set());
try {
const t = await fetch(`/api/rows?page=${page}&limit=100`).then(r => r.json());
setTableData(t);
} finally { setTableLoading(false); }
}, []);

useEffect(() => {
setSelectedDate("");
setSelectedRegions([]);
fetchAll("", []);
fetchTable(0);
setTablePage(0);
}, [refreshKey, fetchAll, fetchTable]);

useEffect(() => { fetchTable(tablePage); }, [tablePage, fetchTable]);

function handleDateChange(date: string) {
setSelectedDate(date);
fetchAll(date, selectedRegions);
}

function toggleRegion(region: string) {
setSelectedRegions(prev => {
const next = prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region];
fetchAll(selectedDate, next);
return next;
});
}

function clearRegions() {
setSelectedRegions([]);
fetchAll(selectedDate, []);
}

async function handleResetConfirmed() {
await fetch("/api/rows", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
setConfirm(null); setSelectedDate(""); setAvailableDates([]); setSelectedRegions([]);
fetchAll("", []); fetchTable(0); setTablePage(0);
}

async function handleDeleteRowsConfirmed() {
await fetch("/api/rows", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...selectedIds] }) });
setConfirm(null);
fetchAll(selectedDate, selectedRegions); fetchTable(tablePage);
}

const bg = isDark ? "bg-gray-900" : "bg-gray-50";
const cardCls = isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200";
const textPri = isDark ? "text-gray-100" : "text-gray-800";
const textSec = isDark ? "text-gray-400" : "text-gray-500";
const grid = isDark ? "#374151" : "#f0f0f0";
const tick = isDark ? "#9ca3af" : "#6b7280";
const tt = isDark ? { contentStyle: { background:"#1f2937", border:"1px solid #374151", fontSize:12, color:"#f3f4f6" } } : { contentStyle: { fontSize:12 } };

const natKPI = kpiData?.national;
const isEmpty = !natKPI || natKPI.total === 0;
const minLabel = natKPI?.minDate ? fmtDateVN(natKPI.minDate) : "";
const maxLabel = natKPI?.maxDate ? fmtDateVN(natKPI.maxDate) : "";
const todayShort = chartData?.todayDate?.slice(5).replace("-","/") ?? "—";
const d7Short = chartData?.d7Date?.slice(5).replace("-","/") ?? "—";
const visibleRows = tableData?.rows ?? [];
const allSelected = visibleRows.length > 0 && visibleRows.every(r => selectedIds.has(r.id));
const totalPages = tableData ? Math.ceil(tableData.total / tableData.limit) : 0;
const regionEmojis: Record<string, string> = { "Hồ Chí Minh":"🏙️","Hà Nội":"🏛️","Miền Nam":"🌴","Miền Bắc":"⛰️" };

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

<div className={`sticky top-0 z-20 border-b ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} px-6 py-3 shadow-sm`}>
<div className="flex items-center justify-between gap-4 flex-wrap">
<div className="min-w-0">
<h1 className={`text-sm font-bold uppercase tracking-wide flex items-center gap-2 flex-wrap ${textPri}`}>
📊 BÁO CÁO VẬN HÀNH PLATFORM
{minLabel && maxLabel && (
<span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded text-xs font-semibold normal-case">
Data: {minLabel} → {maxLabel}
</span>
)}
</h1>
<p className={`text-xs mt-0.5 ${textSec}`}>
{loading ? "Đang tải..." : isEmpty ? "Chưa có dữ liệu" : `${(natKPI?.total ?? 0).toLocaleString()} đơn · ngày ${maxLabel}`}
</p>
</div>
<div className="flex gap-2 items-center shrink-0 flex-wrap">
<div className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${isDark ? "border-gray-600 bg-gray-700/50" : "border-gray-200 bg-gray-50"}`}>
<span className={`text-xs font-medium mr-1 ${textSec}`}>Khu vực:</span>
<button onClick={clearRegions} className={`text-xs px-2 py-0.5 rounded transition-colors ${selectedRegions.length === 0 ? "bg-blue-600 text-white" : isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700"}`}>Tất cả</button>
{ALL_REGIONS.map(region => {
const active = selectedRegions.includes(region);
return (
<button key={region} onClick={() => toggleRegion(region)}
className={`text-xs px-2 py-0.5 rounded transition-colors ${active ? "bg-blue-600 text-white" : isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
{region}
</button>
);
})}
</div>
{availableDates.length > 0 && (
<select value={selectedDate} onChange={e => handleDateChange(e.target.value)}
className={`text-xs px-2.5 py-1.5 rounded-lg border ${isDark ? "bg-gray-700 border-gray-600 text-gray-200" : "bg-white border-gray-300 text-gray-700"}`}>
<option value="">Mới nhất</option>
{availableDates.map(d => <option key={d} value={d}>{fmtDateVN(d)}</option>)}
</select>
)}
<button onClick={() => setIsDark(v => !v)}
className={`px-3 py-1.5 text-sm rounded-lg border ${isDark ? "border-gray-600 text-yellow-400 hover:bg-gray-700" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}>
{isDark ? "☀️ Light" : "🌙 Dark"}
</button>
<button onClick={onImportNew}
className={`px-3 py-1.5 text-sm rounded-lg border ${isDark ? "border-gray-600 text-gray-300 hover:bg-gray-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
📤 Import mới
</button>
<button onClick={() => setConfirm({ type:"reset" })}
className={`px-3 py-1.5 text-sm rounded-lg border ${isDark ? "border-red-800 text-red-400 hover:bg-red-900/30" : "border-red-200 text-red-600 hover:bg-red-50"}`}>
🗑 Reset All
</button>
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
<div className="p-6 space-y-6 max-w-[1600px] mx-auto">

<div ref={nationalRef} className={`rounded-xl border p-5 shadow-sm ${cardCls}`}>
<div className="flex items-center justify-between mb-3">
<div className="flex items-center gap-2 flex-wrap">
<span className="text-lg">🌐</span>
<h2 className={`font-bold text-sm uppercase tracking-wide ${textPri}`}>Toàn Quốc</h2>
<span className={`text-xs ${textSec}`}>({(natKPI?.total ?? 0).toLocaleString()} đơn)</span>
{selectedRegions.length > 0 && (
<span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full border border-blue-200">
{selectedRegions.join(", ")}
</span>
)}
</div>
</div>
{natKPI && <KPIRow kpi={natKPI} isDark={isDark} />}
</div>

{(kpiData?.regions.length ?? 0) > 0 && (
<div ref={regionsRef} className="space-y-4">
<div className="flex items-center justify-between">
<h2 className={`font-bold text-sm uppercase tracking-wide ${textSec}`}>Theo Khu Vực</h2>
<ScreenshotBtn targetRef={regionsRef} isDark={isDark} />
</div>
<div className="grid grid-cols-2 gap-4">
{kpiData!.regions.map(r => (
<div key={r.region} className={`rounded-xl border p-4 shadow-sm ${cardCls}`}>
<div className="flex items-center gap-2 mb-3">
<span>{regionEmojis[r.region] ?? "📍"}</span>
<h3 className={`font-bold text-xs uppercase tracking-wide ${textPri}`}>{r.region}</h3>
<span className={`text-xs ${textSec}`}>({r.total.toLocaleString()} đơn)</span>
</div>
<KPIRow kpi={r} isDark={isDark} />
</div>
))}
</div>
</div>
)}

{chartData && (
<div ref={hourlyRef} className={`rounded-xl border p-5 shadow-sm ${cardCls}`}>
<div className="flex items-center justify-between mb-1">
<h3 className={`font-semibold text-sm ${textPri}`}>
📈 GMV theo giờ — <span className="text-blue-500">Hôm nay ({todayShort})</span> vs <span className={textSec}>D-7 ({d7Short})</span>
{selectedRegions.length > 0 && <span className={`ml-2 text-xs font-normal ${textSec}`}>· {selectedRegions.join(", ")}</span>}
</h3>
<ScreenshotBtn targetRef={hourlyRef} isDark={isDark} />
</div>
<p className={`text-xs mb-4 ${textSec}`}>Đơn vị: Triệu VNĐ</p>
<ResponsiveContainer width="100%" height={300}>
<LineChart data={chartData.hourly} margin={{ top:5, right:20, left:0, bottom:5 }}>
<CartesianGrid strokeDasharray="3 3" stroke={grid} />
<XAxis dataKey="hour" tick={{ fontSize:11, fill:tick }} />
<YAxis tick={{ fontSize:11, fill:tick }} width={50} />
<Tooltip {...tt} formatter={(v: number, n: string) => [`${v} Tr`, n]} />
<Legend wrapperStyle={{ fontSize:12 }} />
<Line type="monotone" dataKey="today" name={`Hôm nay (${todayShort})`} stroke="#3b82f6" strokeWidth={2.5} dot={{ r:3 }} activeDot={{ r:5 }} />
<Line type="monotone" dataKey="d7" name={`D-7 (${d7Short})`} stroke="#9ca3af" strokeWidth={2} strokeDasharray="6 3" dot={{ r:2 }} activeDot={{ r:4 }} />
</LineChart>
</ResponsiveContainer>
</div>
)}

{chartData && (
<div ref={dailyRef} className={`rounded-xl border p-5 shadow-sm ${cardCls}`}>
<div className="flex items-center justify-between mb-4">
<h3 className={`font-semibold text-sm ${textPri}`}>📅 Số đơn theo ngày (10 ngày gần nhất)</h3>
<ScreenshotBtn targetRef={dailyRef} isDark={isDark} />
</div>
<ResponsiveContainer width="100%" height={280}>
<LineChart data={chartData.daily} margin={{ top:5, right:20, left:0, bottom:5 }}>
<CartesianGrid strokeDasharray="3 3" stroke={grid} />
<XAxis dataKey="date" tick={{ fontSize:11, fill:tick }} />
<YAxis tick={{ fontSize:11, fill:tick }} width={50} />
<Tooltip {...tt} />
<Legend wrapperStyle={{ fontSize:12 }} />
<Line type="monotone" dataKey="complete" name="Hoàn thành" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r:4 }} />
<Line type="monotone" dataKey="processing" name="Processing" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r:4 }} />
<Line type="monotone" dataKey="cancel" name="Hủy" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r:4 }} />
</LineChart>
</ResponsiveContainer>
</div>
)}

<div className={`rounded-xl border shadow-sm overflow-hidden ${cardCls}`}>
<div className={`px-4 py-2 border-b flex items-center justify-between gap-3 flex-wrap ${isDark ? "bg-gray-900 border-gray-700" : "bg-gray-50 border-gray-100"}`}>
<span className={`text-xs ${textSec}`}>
{tableLoading ? "Đang tải..." : `${(tableData?.total ?? 0).toLocaleString()} dòng · trang ${tablePage+1}/${totalPages || 1}`}
</span>
<div className="flex items-center gap-2">
{selectedIds.size > 0 && (
<button onClick={() => setConfirm({ type:"deleteRows", count:selectedIds.size })}
className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium">
🗑 Xóa {selectedIds.size.toLocaleString()} dòng
</button>
)}
<button onClick={() => setTablePage(p => Math.max(0, p-1))} disabled={tablePage === 0 || tableLoading}
className={`text-xs px-2.5 py-1.5 rounded border disabled:opacity-40 ${isDark ? "border-gray-600 text-gray-300" : "border-gray-300 text-gray-600"}`}>← Trước</button>
<button onClick={() => setTablePage(p => Math.min(totalPages-1, p+1))} disabled={tablePage >= totalPages-1 || tableLoading}
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
{["Order ID","Create Date","Status","Depot","Total Pay","Pickup City","Sap ID","Distance"].map(h => (
<th key={h} className={`px-3 py-2 text-left font-semibold text-xs whitespace-nowrap ${isDark ? "text-gray-400" : "text-gray-600"}`}>{h}</th>
))}
</tr>
</thead>
<tbody>
{visibleRows.map((row, i) => {
const sg = getStatusGroup(row.status);
const stClr: Record<string,string> = {
complete: isDark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-50 text-emerald-700",
processing: isDark ? "bg-blue-900/40 text-blue-400" : "bg-blue-50 text-blue-700",
cancel: isDark ? "bg-red-900/40 text-red-400" : "bg-red-50 text-red-600",
other: isDark ? "bg-gray-700 text-gray-400" : "bg-gray-50 text-gray-600",
};
const sel = selectedIds.has(row.id);
const rowBg = sel ? (isDark ? "bg-blue-900/30" : "bg-blue-50") : i%2===0 ? (isDark ? "bg-gray-800" : "bg-white") : (isDark ? "bg-gray-800/60" : "bg-gray-50/40");
return (
<tr key={row.id} className={`${rowBg} transition-colors`}>
<td className="px-3 py-1.5 w-8">
<input type="checkbox" checked={sel}
onChange={e => setSelectedIds(prev => { const n = new Set(prev); e.target.checked ? n.add(row.id) : n.delete(row.id); return n; })}
className="w-3.5 h-3.5 cursor-pointer accent-blue-500" />
</td>
<td className={`px-3 py-1.5 font-mono text-xs ${textSec}`}>{row.order_id}</td>
<td className={`px-3 py-1.5 text-xs whitespace-nowrap ${textSec}`}>{row.create_date} {row.create_hour != null ? String(row.create_hour).padStart(2,"0")+"h" : ""}</td>
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
