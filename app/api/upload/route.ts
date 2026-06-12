import { NextRequest, NextResponse } from "next/server";
import { put, list } from "@vercel/blob";
import * as XLSX from "xlsx";

const DATA_PREFIX = "excel-dashboard-data";
const CONFIG_PREFIX = "excel-dashboard-config";

function parseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  const num = Number(val);
  if (!isNaN(num) && num > 1000) {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(num);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  const str = String(val).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  // DD/MM/YYYY
  const parts = str.split(/[/\-\.]/);
  if (parts.length === 3) {
    const d2 = new Date(parts[2] + "-" + parts[1] + "-" + parts[0]);
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

export const config = { api: { bodyParser: false } };

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    // Load column config
    let selectedColumns: string[] = [];
    let createDateColumn = "Create Date";
    const { blobs: configBlobs } = await list({ prefix: CONFIG_PREFIX });
    if (configBlobs.length > 0) {
      const cfg = await fetch(configBlobs[0].url).then((r) => r.json());
      selectedColumns = cfg.columns || [];
      createDateColumn = cfg.createDateColumn || "Create Date";
    }

    // Parse Excel
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
    if (rawData.length === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });

    const allHeaders = Object.keys(rawData[0]);

    // Filter columns by config (case-insensitive name match)
    const headers =
      selectedColumns.length > 0
        ? allHeaders.filter((h) =>
            selectedColumns.some((c) => c.trim().toLowerCase() === h.trim().toLowerCase())
          )
        : allHeaders;

    // Keep only selected columns per row
    const rows = rawData.map((row) => {
      const out: Record<string, unknown> = {};
      headers.forEach((h) => { out[h] = row[h]; });
      return out;
    });

    // Find max Create Date for TTL
    const createDateCol = headers.find(
      (h) => h.trim().toLowerCase() === createDateColumn.trim().toLowerCase()
    );
    let maxDate: Date | null = null;
    if (createDateCol) {
      rows.forEach((row) => {
        const d = parseDate(row[createDateCol]);
        if (d && (!maxDate || d > maxDate)) maxDate = d;
      });
    }
    const baseDate = maxDate || new Date();
    const expiresAt = new Date(baseDate);
    expiresAt.setDate(expiresAt.getDate() + 10);

    // Store in Vercel Blob
    const id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    const payload = { id, headers, rows, fileName: file.name, uploadedAt: new Date().toISOString(), expiresAt: expiresAt.toISOString(), rowCount: rows.length };
    await put(DATA_PREFIX + "-" + id + ".json", JSON.stringify(payload), { access: "public", addRandomSuffix: false });

    return NextResponse.json({ success: true, data: payload });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to process file" }, { status: 500 });
  }
}
