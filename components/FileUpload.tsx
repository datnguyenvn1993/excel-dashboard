"use client";

import { useCallback, useState } from "react";
import { KpiDataset, KpiRow } from "@/types/data";
import { saveData, sortMonths } from "@/lib/storage";

// Target columns (case-insensitive match against the file's header row).
const COL_PARTNER = "partner_id";
const COL_MONTH = "Tháng";
const COL_METRIC = "Chỉ số";
const COL_VALUE = "Giá trị";

interface FileUploadProps {
  onUploaded: (data: KpiDataset) => void;
  onClose?: () => void;
}

function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/[^0-9.\-]/g, "");
    if (!cleaned) return null;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const MM = (n: number, y: number | string): string => `${String(n).padStart(2, "0")}/${y}`;

// Normalise many "month" representations to "MM/YYYY".
// Handles: "MM/YYYY", "M/D/YYYY" / "D/M/YYYY" (day is always 1 in this data),
// "YYYY-MM[-DD]", Excel serial numbers, and Date objects.
function normMonth(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return MM(v.getMonth() + 1, v.getFullYear());
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial date (days since 1899-12-30).
    if (v > 1000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      if (!Number.isNaN(d.getTime())) return MM(d.getUTCMonth() + 1, d.getUTCFullYear());
    }
    return null;
  }
  const s = String(v ?? "").trim();
  if (!s) return null;

  // "MM/YYYY" or "M/YYYY" (month + year only).
  let m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return MM(parseInt(m[1], 10), m[2]);

  // "M/D/YYYY" or "D/M/YYYY" (three parts). Decide which part is the month:
  // if a part is > 12 it must be the day; otherwise assume month-first (US).
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const month = a > 12 ? b : b > 12 ? a : a; // ambiguous → month-first
    if (month >= 1 && month <= 12) return MM(month, m[3]);
    return null;
  }

  // "YYYY-MM" or "YYYY-MM-DD".
  m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return MM(parseInt(m[2], 10), m[1]);

  return null;
}

export default function FileUpload({ onUploaded, onClose }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        setError("Vui lòng chọn file Excel (.xlsx, .xls) hoặc CSV.");
        return;
      }
      setIsBusy(true);
      setError(null);
      const mb = (file.size / 1048576).toFixed(1);
      setStatus(`Đang đọc file ${mb} MB...`);

      // Yield to the browser so the spinner/text paints before heavy parsing.
      await new Promise((r) => setTimeout(r, 30));

      try {
        const XLSX = await import("xlsx");
        setStatus(`Đang xử lý ${mb} MB...`);
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          raw: true,
          defval: "",
        });

        if (rawRows.length === 0) {
          setError("File không có dữ liệu.");
          setIsBusy(false);
          return;
        }

        // Case-insensitive header mapping.
        const fileKeys = Object.keys(rawRows[0]);
        const findKey = (target: string) =>
          fileKeys.find((k) => k.trim().toLowerCase() === target.trim().toLowerCase());
        const kPartner = findKey(COL_PARTNER);
        const kMonth = findKey(COL_MONTH);
        const kMetric = findKey(COL_METRIC);
        const kValue = findKey(COL_VALUE);

        if (!kPartner || !kMonth || !kMetric || !kValue) {
          setError(
            `File thiếu cột. Cần: ${COL_PARTNER}, ${COL_MONTH}, ${COL_METRIC}, ${COL_VALUE}.`
          );
          setIsBusy(false);
          return;
        }

        const rows: KpiRow[] = [];
        const monthSet = new Set<string>();
        const partnerSet = new Set<string>();

        for (const raw of rawRows) {
          const partnerId = String(raw[kPartner] ?? "").trim();
          const month = normMonth(raw[kMonth]);
          const metric = String(raw[kMetric] ?? "").trim();
          const value = parseNumber(raw[kValue]);
          if (!partnerId || !month || !metric || value === null) continue;
          rows.push({ partnerId, month, metric, value });
          monthSet.add(month);
          partnerSet.add(partnerId);
        }

        console.log(`Giữ lại ${rows.length}/${rawRows.length} rows sau khi lọc`);

        if (rows.length === 0) {
          setError("Không có dòng hợp lệ nào sau khi lọc. Kiểm tra lại định dạng file.");
          setIsBusy(false);
          return;
        }

        const dataset: KpiDataset = {
          rows,
          months: sortMonths(Array.from(monthSet)),
          partnerIds: Array.from(partnerSet),
          fileName: file.name,
          uploadedAt: new Date().toISOString(),
          rowCount: rows.length,
        };

        setStatus("Đang lưu vào trình duyệt...");
        await saveData(dataset);

        setStatus("");
        onUploaded(dataset);
      } catch (err) {
        console.error("Parse error:", err);
        setError("Không thể đọc file. Vui lòng kiểm tra lại định dạng.");
        setIsBusy(false);
      }
    },
    [onUploaded]
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
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Import dữ liệu KPI</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            File dạng: partner_id · Tháng · Chỉ số · Giá trị
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-2"
            aria-label="Đóng"
          >
            ×
          </button>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isBusy && document.getElementById("kpi-file-input")?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer
          ${
            isDragging
              ? "border-emerald-400 bg-emerald-50"
              : "border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100"
          } ${isBusy ? "pointer-events-none opacity-80" : ""}`}
      >
        <input
          id="kpi-file-input"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) processFile(f);
            e.target.value = "";
          }}
        />

        {isBusy ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-9 h-9 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 text-sm">{status || "Đang xử lý..."}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-2xl">
              📊
            </div>
            <p className="text-gray-700 font-medium">Thả file vào đây hoặc bấm để chọn</p>
            <p className="text-gray-400 text-xs">Hỗ trợ .xlsx, .xls, .csv (10–100MB)</p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
