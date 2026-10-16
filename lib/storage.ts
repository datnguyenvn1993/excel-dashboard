import { KpiDataset } from "@/types/data";

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
