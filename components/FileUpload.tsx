"use client";

import { useCallback, useState } from "react";
import { ParsedData } from "@/types/data";
import { saveData } from "@/lib/storage";

const COLUMNS = ["Order ID", "Status", "Depot", "Total Pay Display", "Pickup City"];
const VALID_STATUSES = new Set(["cancel", "complete", "processing"]);

interface FileUploadProps {
  onUploadSuccess: (data: ParsedData) => void;
}

export default function FileUpload({ onUploadSuccess }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        setError("Vui lòng upload file Excel (.xlsx, .xls) hoặc CSV.");
        return;
      }
      setIsUploading(true);
      setError(null);
      setSuccess(null);

      try {
        const sizeMB = (file.size / 1024 / 1024).toFixed(1);
        setProgress(`Đang đọc file ${sizeMB} MB...`);

        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();

        setProgress("Đang parse Excel...");
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          sheet,
          { raw: false, defval: "" }
        );

        if (rawRows.length === 0) {
          setError("File không có dữ liệu.");
          setProgress(null);
          return;
        }

        setProgress(`Đang lọc ${rawRows.length.toLocaleString()} rows...`);

        // Case-insensitive column mapping
        const fileKeys = Object.keys(rawRows[0]);
        const colMap: Record<string, string> = {};
        for (const col of COLUMNS) {
          const match = fileKeys.find(
            (k) => k.trim().toLowerCase() === col.trim().toLowerCase()
          );
          if (match) colMap[col] = match;
        }

        const statusKey = colMap["Status"];
        if (!statusKey) {
          setError(`Không tìm thấy cột "Status" trong file. Các cột hiện có: ${fileKeys.slice(0, 5).join(", ")}...`);
          setProgress(null);
          return;
        }

        // Filter & transform: chỉ giữ Cancel/Complete/Processing, chỉ 5 cột
        const rows: Record<string, unknown>[] = [];
        for (const raw of rawRows) {
          const statusVal = String(raw[statusKey] ?? "").trim().toLowerCase();
          if (!VALID_STATUSES.has(statusVal)) continue;
          const row: Record<string, unknown> = {};
          for (const [ourCol, fileCol] of Object.entries(colMap)) {
            row[ourCol] = raw[fileCol];
          }
          rows.push(row);
        }

        console.log(`Giữ lại ${rows.length}/${rawRows.length} rows sau khi lọc Status`);

        if (rows.length === 0) {
          setError(
            `Không có row nào có Status = Complete / Processing / Cancel. ` +
            `Kiểm tra lại giá trị cột "Status" trong file.`
          );
          setProgress(null);
          return;
        }

        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const now = new Date();
        const parsed: ParsedData = {
          id,
          headers: Object.keys(colMap),
          rows,
          fileName: file.name,
          uploadedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 30 * 86400000).toISOString(),
          rowCount: rows.length,
        };

        setProgress("Đang lưu dữ liệu...");
        await saveData(parsed);

        setSuccess(`✓ Imported ${rows.length.toLocaleString()} rows từ "${file.name}"`);
        setProgress(null);
        setTimeout(() => onUploadSuccess(parsed), 800);
      } catch (err) {
        console.error("Parse error:", err);
        setError("Không thể đọc file. Vui lòng kiểm tra lại file Excel.");
        setProgress(null);
      } finally {
        setIsUploading(false);
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

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-1">Import dữ liệu mới</h2>
        <p className="text-slate-400 text-sm">
          Hỗ trợ .xlsx/.xls/.csv · Chỉ giữ: Order ID, Status, Depot, Total Pay Display, Pickup City
        </p>
        <p className="text-slate-500 text-xs mt-1">
          Chỉ lưu Status = Complete / Processing / Cancel
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer
          ${isDragging
            ? "border-blue-400 bg-blue-500/10"
            : "border-slate-600 hover:border-slate-400 bg-slate-800/50 hover:bg-slate-800"
          }`}
        onClick={() => document.getElementById("file-input-upload")?.click()}
      >
        <input
          id="file-input-upload"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-300 text-sm">{progress ?? "Đang xử lý..."}</p>
          </div>
        ) : success ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-400 font-medium text-sm">{success}</p>
            <p className="text-slate-400 text-xs">Đang cập nhật dashboard...</p>
          </div>
        ) : (
          <>
            <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-slate-700 flex items-center justify-center">
              <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-white font-medium mb-1">Thả file vào đây</p>
            <p className="text-slate-400 text-sm">hoặc click để chọn file</p>
            <p className="text-slate-500 text-xs mt-2">Hỗ trợ .xlsx, .xls, .csv · Tối đa 100MB</p>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm max-w-lg w-full">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
