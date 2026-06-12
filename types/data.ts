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
