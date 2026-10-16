export interface ParsedData {
  id: string;
  headers: string[];
  rows: Record<string, unknown>[];
  fileName: string;
  uploadedAt: string;
  expiresAt: string;
  rowCount: number;
}

export interface DatasetMeta {
  id: string;
  headers: string[];
  fileName: string;
  uploadedAt: string;
  expiresAt: string;
  rowCount: number;
  blobUrl: string;
}

export interface ColumnConfig {
  columns: string[];
  createDateColumn: string;
}

export type ColumnType = "number" | "string" | "date";

export interface ColumnInfo {
  name: string;
  type: ColumnType;
  uniqueCount: number;
  numericStats?: { min: number; max: number; avg: number; sum: number };
}

// ─── New KPI (flat/long) data model ─────────────────────────────────────────
// Source file shape: partner_id, Tháng (MM/YYYY), Chỉ số, Giá trị.

export interface KpiRow {
  partnerId: string;
  month: string; // "MM/YYYY"
  metric: string; // "Chỉ số"
  value: number; // "Giá trị"
}

export interface KpiDataset {
  rows: KpiRow[];
  months: string[]; // sorted unique "MM/YYYY"
  partnerIds: string[]; // unique partner ids present
  fileName: string;
  uploadedAt: string; // ISO
  rowCount: number;
}
