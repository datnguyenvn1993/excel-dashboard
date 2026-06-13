"use client";

import { useCallback, useState } from "react";
import { ParsedData } from "@/types/data";

const COLUMNS = [
  "Order ID",
  "Sap ID",
  "Create Date",
  "Vehicle id",
  "Total Pay",
  "Status Order",
  "City Depot",
  "Driver Group ID",
  "Distance",
];
const DATE_COL = "Create Date";

interface FileUploadProps {
  onUploadSuccess: (data: ParsedData) => void;
}

export default function FileUpload({ onUploadSuccess }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        setError("Please upload an Excel (.xlsx, .xls) or CSV file.");
        return;
      }
      setIsUploading(true);
      setError(null);
      setSuccess(null);

      try {
        // Dynamic import — loads only when needed, works fully in browser
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          sheet,
          { raw: true, defval: "" }
        );

        if (rawRows.length === 0) {
          setError("File không có dữ liệu.");
          return;
        }

        // Case-insensitive column mapping (position-independent)
        const fileKeys = Object.keys(rawRows[0]);
        const colMap: Record<string, string> = {};
        for (const col of COLUMNS) {
          const match = fileKeys.find(
            (k) => k.trim().toLowerCase() === col.trim().toLowerCase()
          );
          if (match) colMap[col] = match;
        }

        // Transform rows: keep only mapped columns, convert Create Date to ISO
        const rows = rawRows.map((raw) => {
          const row: Record<string, unknown> = {};
          for (const [ourCol, fileCol] of Object.entries(colMap)) {
            let val: unknown = raw[fileCol];
            if (ourCol === DATE_COL) {
              if (typeof val === "number") {
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const info = (XLSX as any).SSF.parse_date_code(val);
                  if (info) {
                    const d = new Date(
                      info.y,
                      info.m - 1,
                      info.d,
                      info.H || 0,
                      info.M || 0,
                      Math.floor(info.S || 0)
                    );
                    if (!isNaN(d.getTime())) val = d.toISOString();
                  }
                } catch {
                  /* keep original value */
                }
              } else if (typeof val === "string" && val.trim()) {
                const d = new Date(val);
                if (!isNaN(d.getTime())) val = d.toISOString();
              }
            }
            row[ourCol] = val;
          }
          return row;
        });

        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const now = new Date();
        const parsed: ParsedData = {
          id,
          headers: Object.keys(colMap),
          rows,
          fileName: file.name,
          uploadedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 10 * 86400000).toISOString(),
          rowCount: rows.length,
        };

        // Save to localStorage so data survives page refresh
        try {
          localStorage.setItem("excel-dashboard-data", JSON.stringify(parsed));
        } catch {
          console.warn("localStorage quota exceeded — data not persisted across refresh");
        }

        setSuccess(
          `✓ Imported ${rows.length.toLocaleString()} rows from "${file.name}"` 
        );
        setTimeout(() => onUploadSuccess(parsed), 800);
      } catch (err) {
        console.error("Parse error:", err);
        setError("Không thể đọc file. Vui lòng kiểm tra lại file Excel.");
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
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-2">Upload dữ liệu</h2>
        <p className="text-slate-400">
          Import file Excel hoặc CSV — dữ liệu tự động lưu trên trình duyệt
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer
          ${
            isDragging
              ? "border-blue-400 bg-blue-500/10"
              : "border-slate-600 hover:border-slate-400 bg-slate-800/50 hover:bg-slate-800"
          }`}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) processFile(f);
          }}
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-300">Đang xử lý file...</p>
          </div>
        ) : success ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-green-400 font-medium">{success}</p>
            <p className="text-slate-400 text-sm">Đang chuyển đến dashboard...</p>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-700 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-white font-medium mb-1">Thả file vào đây</p>
            <p className="text-slate-400 text-sm">hoặc click để chọn file</p>
            <p className="text-slate-500 text-xs mt-3">Hỗ trợ .xlsx, .xls, .csv</p>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm max-w-lg w-full">
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}
