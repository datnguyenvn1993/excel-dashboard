"use client";
import { useCallback, useState } from "react";

const COLUMNS = ["Order ID","Status","Depot","Total Pay Display","Pickup City","Create Time","Sap Profile Id","Distance"];
const BATCH_SIZE = 1000;
const CONCURRENCY = 3;

function parseDate(val: unknown): string | null {
  const s = String(val ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const d2 = new Date(`${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`);
    if (!isNaN(d2.getTime())) return d2.toISOString().slice(0, 10);
  }
  return null;
}

function parseHour(val: unknown): number | null {
  const s = String(val ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getHours();
  const m = s.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\s+(\d{1,2}):/);
  if (m) return parseInt(m[1]);
  return null;
}

function isValidStatus(v: string) {
  const s = v.trim().toLowerCase();
  return s.startsWith("cancel") || s.startsWith("complete") || s.startsWith("process") || s === "in progress";
}

interface FileUploadProps { onUploadSuccess: () => void; }

export default function FileUpload({ onUploadSuccess }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) { setError("Vui lòng upload file Excel (.xlsx, .xls) hoặc CSV."); return; }
    setIsUploading(true); setError(null); setSuccess(null);
    try {
      setProgress(`Đang đọc file ${(file.size/1024/1024).toFixed(1)} MB...`);
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet, { raw: false, defval: "" });
      if (!rawRows.length) { setError("File không có dữ liệu."); return; }

      setProgress(`Đang xử lý ${rawRows.length.toLocaleString()} rows...`);
      const fileKeys = Object.keys(rawRows[0]);
      const colMap: Record<string,string> = {};
      for (const col of COLUMNS) {
        const match = fileKeys.find(k => k.trim().toLowerCase() === col.toLowerCase());
        if (match) colMap[col] = match;
      }
      if (!colMap["Status"]) { setError(`Không tìm thấy cột "Status". Cột hiện có: ${fileKeys.slice(0,8).join(", ")}`); return; }

      const rows = rawRows
        .filter(r => isValidStatus(String(r[colMap["Status"]] ?? "")))
        .map(r => ({
          order_id:       String(r[colMap["Order ID"]] ?? ""),
          status:         String(r[colMap["Status"]] ?? ""),
          depot:          String(r[colMap["Depot"]] ?? ""),
          total_pay:      parseFloat(String(r[colMap["Total Pay Display"]] ?? "").replace(/[^0-9.]/g,"")) || 0,
          pickup_city:    String(r[colMap["Pickup City"]] ?? ""),
          create_date:    parseDate(r[colMap["Create Time"]]),
          create_hour:    parseHour(r[colMap["Create Time"]]),
          sap_profile_id: String(r[colMap["Sap Profile Id"]] ?? ""),
          distance:       String(r[colMap["Distance"]] ?? ""),
        }));

      if (!rows.length) { setError("Không có dòng nào hợp lệ sau khi lọc Status."); return; }

      const batches: typeof rows[] = [];
      for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE));

      setProgress(`Đang upload 0/${batches.length} batches...`);

      // First batch: truncate + insert
      const send = async (batch: typeof rows, isFirst: boolean) => {
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch, isFirst }),
        });
        if (!res.ok) throw new Error(await res.text());
      };

      await send(batches[0], true);
      let done = 1;
      for (let i = 1; i < batches.length; i += CONCURRENCY) {
        await Promise.all(batches.slice(i, i + CONCURRENCY).map(b => send(b, false)));
        done = Math.min(i + CONCURRENCY, batches.length);
        setProgress(`Đang upload ${done}/${batches.length} batches...`);
      }

      setSuccess(`✓ Imported ${rows.length.toLocaleString()} rows từ "${file.name}"`);
      setTimeout(() => { onUploadSuccess(); }, 800);
    } catch (err) {
      console.error(err);
      setError("Lỗi: " + String(err));
    } finally {
      setIsUploading(false); setProgress(null);
    }
  }, [onUploadSuccess]);

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-1">Import dữ liệu mới</h2>
        <p className="text-slate-400 text-sm">Hỗ trợ .xlsx/.xls/.csv · 8 cột: Order ID, Status, Depot, Total Pay Display, Pickup City, Create Time, Sap Profile Id, Distance</p>
        <p className="text-slate-500 text-xs mt-1">Data được lưu trên server — dùng được trên mọi thiết bị</p>
      </div>
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
        onClick={() => document.getElementById("file-input-upload")?.click()}
        className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${isDragging ? "border-blue-400 bg-blue-500/10" : "border-slate-600 hover:border-slate-400 bg-slate-800/50 hover:bg-slate-800"}`}
      >
        <input id="file-input-upload" type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-300 text-sm">{progress ?? "Đang xử lý..."}</p>
          </div>
        ) : success ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <p className="text-green-400 font-medium text-sm">{success}</p>
            <p className="text-slate-400 text-xs">Đang cập nhật dashboard...</p>
          </div>
        ) : (
          <>
            <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-slate-700 flex items-center justify-center">
              <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <p className="text-white font-medium mb-1">Thả file vào đây</p>
            <p className="text-slate-400 text-sm">hoặc click để chọn file</p>
            <p className="text-slate-500 text-xs mt-2">Hỗ trợ .xlsx, .xls, .csv · Tối đa 100MB</p>
          </>
        )}
      </div>
      {error && (
        <div className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm max-w-lg w-full">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span style={{whiteSpace:"pre-line"}}>{error}</span>
        </div>
      )}
    </div>
  );
}
