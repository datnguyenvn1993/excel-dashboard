export interface ParsedData {
  headers: string[];
  rows: Record<string, unknown>[];
  fileName: string;
  sheetName: string;
  totalRows: number;
}
export type ColumnType = "number" | "string" | "date";
export interface ColumnInfo {
  name: string;
  type: ColumnType;
  uniqueCount: number;
  numericStats?: { min: number; max: number; avg: number; sum: number };
}
