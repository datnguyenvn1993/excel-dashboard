import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import * as XLSX from "xlsx";

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

function toISO(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") {
    try {
      const info = XLSX.SSF.parse_date_code(val);
      if (!info) return null;
      const d = new Date(info.y, info.m - 1, info.d, info.H || 0, info.M || 0, Math.floor(info.S || 0));
      return isNaN(d.getTime()) ? null : d.toISOString();
    } catch {
      return null;
    }
  }
  if (typeof val === "string" && val.trim()) {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: "" });

    if (rawRows.length === 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });

    // Build case-insensitive column mapping (position-independent)
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
          const iso = toISO(val);
          if (iso !== null) val = iso;
        }
        row[ourCol] = val;
      }
      return row;
    });

    const headers = Object.keys(colMap);

    // Compute TTL from max Create Date
    let maxDate: Date | null = null;
    for (const row of rows) {
      const v = row[DATE_COL];
      if (v) {
        const d = new Date(v as string);
        if (!isNaN(d.getTime()) && (!maxDate || d > maxDate)) maxDate = d;
      }
    }

    const now = new Date();
    const uploadedAt = now.toISOString();
    const expiresAt = new Date(
      (maxDate ?? now).getTime() + 10 * 86400000
    ).toISOString();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const dataset = {
      id,
      headers,
      rows,
      fileName: file.name,
      uploadedAt,
      expiresAt,
      rowCount: rows.length,
    };

    const blob = await put(
      `excel-dashboard-data-${id}.json`,
      JSON.stringify(dataset),
      { access: "public", contentType: "application/json" }
    );

    return NextResponse.json({
      success: true,
      data: {
        id,
        headers,
        fileName: file.name,
        uploadedAt,
        expiresAt,
        rowCount: rows.length,
        blobUrl: blob.url,
      },
    });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: "Failed to process file" },
      { status: 500 }
    );
  }
}
