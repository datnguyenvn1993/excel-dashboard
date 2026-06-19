"use client";

import { useCallback, useRef, useState } from "react";

// Tăng batch size để upload nhanh hơn với file lớn
const BATCH_SIZE = 5000;
const CONCURRENCY = 5;

// Column aliases (case-insensitive match)
const COL_ALIASES: Record<string, string[]> = {
  order_id: ["order id", "order_id", "orderid"],
  status: ["status order", "status", "order status", "trang thai"],
  depot: ["city depot", "depot", "city_depot", "kho"],
  total_pay: ["total fee", "total fee display", "total_fee", "totalfee", "total pay", "total pay display", "total_pay", "totalpay", "payment", "tong tien"],
  pickup_city: ["driver group id", "driver group", "driver_group_id", "pickup city", "pickup_city"],
  create_time: ["create date", "create time", "create_date", "create_time", "created at", "ngay tao", "thoi gian tao"],
  sap_profile_id: ["sap id", "sap profile id", "sap_id", "sap_profile_id", "sap profile", "sapid"],
  distance: ["distance", "khoang cach"],
  cancel_by: ["cancel by", "cancel_by", "cancelled by", "nguoi huy", "người hủy", "huy_boi", "hủy bởi"],
};

interface ImportRow {
  order_id: string;
  status: string;
  depot: string;
  total_pay: number;
  pickup_city: string;
  create_date: string;
  create_hour: number;
  sap_profile_id: string;
  distance: string;
  cancel_by: string;
}

interface FileUploadProps {
  onUploadSuccess: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseExcelDate(val: unknown, XLSX: any): { date: string; hour: number } {
  if (typeof val === "number") {
    try {
      const info = XLSX.SSF.parse_date_code(val);
      if (info) {
        const month = String(info.m).padStart(2, "0");
        const day = String(info.d).padStart(2, "0");
        return { date: `${info.y}-${month}-${day}`, hour: info.H || 0 };
      }
    } catch { /* fallthrough */ }
  }
  if (typeof val === "string" && val.trim()) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return { date: `${d.getFullYear()}-${month}-${day}`, hour: d.getHours() };
    }
  }
  return { date: "", hour: 0 };
}

export default function FileUpload({ onUploadSuccess }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number; phase: string } | null>(null);
  const abortRef = useRef(false);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        setError("Please upload an Excel (.xlsx, .xls) or CSV file.");
        return;
      }
      setIsUploading(true);
      setError(null);
      setProgress({ sent: 0, total: 0, phase: "Đang đọc file..." });
      abortRef.current = false;

      try {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();

        setProgress({ sent: 0, total: 0, phase: "Đang phân tích dữ liệu..." });
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          raw: true,
          defval: "",
        });

        if (rawRows.length === 0) {
          setError("File không có dữ liệu.");
          return;
        }

        // Build case-insensitive column map
        const fileKeys = Object.keys(rawRows[0]);
        const colMap: Record<string, string> = {};
        for (const [field, aliases] of Object.entries(COL_ALIASES)) {
          const match = fileKeys.find((k) =>
            aliases.includes(k.trim().toLowerCase())
          );
          if (match) colMap[field] = match;
        }

        // Pre-process all rows
        setProgress({ sent: 0, total: rawRows.length, phase: "Đang xử lý rows..." });

        const processed: ImportRow[] = rawRows.map((raw) => {
          const timeVal = colMap.create_time ? raw[colMap.create_time] : undefined;
          const { date, hour } = parseExcelDate(timeVal, XLSX);
          return {
            order_id: String(colMap.order_id ? (raw[colMap.order_id] ?? "") : ""),
            status: String(colMap.status ? (raw[colMap.status] ?? "") : ""),
            depot: String(colMap.depot ? (raw[colMap.depot] ?? "") : ""),
            total_pay: parseFloat(String(colMap.total_pay ? (raw[colMap.total_pay] ?? "0") : "0")) || 0,
            pickup_city: String(colMap.pickup_city ? (raw[colMap.pickup_city] ?? "") : ""),
            create_date: date,
            create_hour: hour,
            sap_profile_id: String(colMap.sap_profile_id ? (raw[colMap.sap_profile_id] ?? "") : ""),
            distance: String(colMap.distance ? (raw[colMap.distance] ?? "") : ""),
            cancel_by: String(colMap.cancel_by ? (raw[colMap.cancel_by] ?? "") : ""),
          };
        });

        // Collect unique dates from this file (for targeted DELETE)
        const datesInFile = [...new Set(processed.map(r => r.create_date).filter(Boolean))];

        // Split into batches
        const totalRows = processed.length;
        const batches: ImportRow[][] = [];
        for (let i = 0; i < totalRows; i += BATCH_SIZE) {
          batches.push(processed.slice(i, i + BATCH_SIZE));
        }

        let sentRows = 0;

        async function runBatch(batch: ImportRow[], isFirst: boolean, dates?: string[]) {
          const res = await fetch("/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rows: batch,
              isFirst,
              ...(isFirst && dates ? { datesInFile: dates } : {}),
            }),
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `HTTP ${res.status}`);
          }
          sentRows += batch.length;
          setProgress({ sent: sentRows, total: totalRows, phase: "Đang upload lên server..." });
        }

        setProgress({ sent: 0, total: totalRows, phase: "Đang upload lên server..." });

        // Send first batch alone (it DELETEs by date + inserts) to avoid race condition
        await runBatch(batches[0], true, datesInFile);

        // Send remaining batches with concurrency
        let idx = 1;
        while (idx < batches.length && !abortRef.current) {
          const chunk = batches.slice(idx, idx + CONCURRENCY);
          await Promise.all(chunk.map((batch) => runBatch(batch, false)));
          idx += CONCURRENCY;
        }

        if (!abortRef.current) {
          setProgress({ sent: totalRows, total: totalRows, phase: "Hoàn thành!" });
          await new Promise((r) => setTimeout(r, 700));
          onUploadSuccess();
        }
      } catch (err: unknown) {
        console.error("Upload error:", err);
        setError(err instanceof Error ? err.message : "Lỗi không xác định khi upload.");
      } finally {
        setIsUploading(false);
        if (!abortRef.current) setProgress(null);
      }
    },
    [onUploadSuccess]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const pct = progress && progress.total > 0
    ? Math.round((progress.sent / progress.total) * 100)
    : null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-2">Upload dữ liệu</h2>
        <p className="text-slate-400">
          Import file Excel (.xlsx/.xls) — dữ liệu lưu trên server, nhiều người dùng cùng xem
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer
          ${isDragging
            ? "border-blue-400 bg-blue-500/10"
            : "border-slate-600 hover:border-slate-400 bg-slate-800/50 hover:bg-slate-800"
          }`}
        onClick={() => !isUploading && document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
        />

        {isUploading && progress ? (
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-300 font-medium">{progress.phase}</p>

            {progress.total > 0 && (
              <>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-blue-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-slate-400 text-sm">
                  {progress.sent.toLocaleString()} / {progress.total.toLocaleString()} rows
                  {pct !== null && ` (${pct}%)`}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-700 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-white font-medium mb-1">Thả file vào đây</p>
            <p className="text-slate-400 text-sm">hoặc click để chọn file</p>
            <p className="text-slate-500 text-xs mt-3">Hỗ trợ .xlsx, .xls — tối đa 150MB</p>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm max-w-lg w-full">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}
