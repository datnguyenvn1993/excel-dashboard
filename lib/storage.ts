import { KpiDataset, KpiRow } from "@/types/data";

// IndexedDB-backed storage for the (potentially large) parsed KPI dataset.
// localStorage caps out around 5–10 MB; IndexedDB handles far more.

const DB_NAME = "excel-dashboard";
const DB_VERSION = 1;
const STORE_NAME = "datasets";
const DATA_KEY = "current-kpi";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveData(data: KpiDataset): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(data, DATA_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadData(): Promise<KpiDataset | null> {
  const db = await openDB();
  try {
    return await new Promise<KpiDataset | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(DATA_KEY);
      req.onsuccess = () => resolve((req.result as KpiDataset) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function clearData(): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(DATA_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// ─── Server (Postgres) storage ──────────────────────────────────────────────

type CompactRow = [string, string, string, number];
const UPLOAD_CHUNK = 5000;

function buildDataset(
  rows: KpiRow[],
  fileName: string,
  uploadedAt: string
): KpiDataset {
  const monthSet = new Set<string>();
  const partnerSet = new Set<string>();
  for (const r of rows) {
    monthSet.add(r.month);
    partnerSet.add(r.partnerId);
  }
  return {
    rows,
    months: sortMonths(Array.from(monthSet)),
    partnerIds: Array.from(partnerSet),
    fileName,
    uploadedAt,
    rowCount: rows.length,
  };
}

/** Tải toàn bộ dữ liệu KPI đã lưu trên server. */
export async function fetchServerData(partnerId?: string): Promise<KpiDataset | null> {
  const url = partnerId
    ? `/api/kpi-data?partner=${encodeURIComponent(partnerId)}`
    : "/api/kpi-data";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    rows: CompactRow[];
    fileName: string;
    uploadedAt: string;
  };
  if (!json.rows || json.rows.length === 0) return null;
  const rows: KpiRow[] = json.rows.map(([partnerId, month, metric, value]) => ({
    partnerId,
    month,
    metric,
    value,
  }));
  return buildDataset(rows, json.fileName, json.uploadedAt);
}

/**
 * Đẩy rows lên server theo từng lô. Trùng (partner, tháng, chỉ số) sẽ ghi đè.
 * Trả về số dòng thêm mới / ghi đè.
 */
export async function uploadToServer(
  rows: KpiRow[],
  fileName: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += UPLOAD_CHUNK) {
    const chunk = rows.slice(i, i + UPLOAD_CHUNK);
    const isLast = i + UPLOAD_CHUNK >= rows.length;
    const res = await fetch("/api/kpi-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: chunk.map((r) => [r.partnerId, r.month, r.metric, r.value]),
        // Chỉ ghi tên file khi lô cuối thành công.
        fileName: isLast ? fileName : undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const json = await res.json();
    inserted += json.inserted ?? 0;
    updated += json.updated ?? 0;
    onProgress?.(Math.min(i + UPLOAD_CHUNK, rows.length), rows.length);
  }
  return { inserted, updated };
}

// ─── Month helpers ("MM/YYYY") ──────────────────────────────────────────────

/** Sort key for a "MM/YYYY" month string (YYYYMM). */
export function monthKey(m: string): number {
  const [mm, yyyy] = m.split("/");
  return parseInt(yyyy, 10) * 100 + parseInt(mm, 10);
}

export function sortMonths(months: string[]): string[] {
  return [...months].sort((a, b) => monthKey(a) - monthKey(b));
}

/**
 * Short column label for a month. "T{m}" when all months share one year,
 * otherwise "T{m}/{yy}".
 */
export function monthLabel(m: string, multiYear: boolean): string {
  const [mm, yyyy] = m.split("/");
  const mo = parseInt(mm, 10);
  return multiYear ? `T${mo}/${yyyy.slice(2)}` : `T${mo}`;
}

/** "16/10/2026 10:55" theo giờ Việt Nam; rỗng nếu không hợp lệ. */
export function formatImportTime(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
