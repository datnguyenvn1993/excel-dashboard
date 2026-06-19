import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";

interface ImportRow {
  order_id: string;
  status: string;
  depot: string;
  total_pay: number;
  pickup_city: string;
  create_date: string;
  create_hour: number;
  sap_profile_id: string;
  distance: string;
}

// 500 rows x 9 cols = 4500 params, dưới giới hạn 65535 của Postgres
const CHUNK = 500;

const VALID_STATUSES = ["Complete", "Cancel", "In Process"];

const VALID_DEPOTS = [
  "PFBLU", "1017", "1109", "PFBDI", "1107", "1019", "PFBTN", "2000",
  "PFCMU", "PFDLA", "PFĐắk Nông", "2010", "1108", "1022", "PFGLA",
  "PFHDU", "PFHNA", "1031", "1032", "PFHBI", "2012", "1015", "2011",
  "PFKGG", "PFLDG", "PFLSN", "PFLCI", "2013", "PFNBI", "PFNTN", "3002",
  "PFPYE", "PFQBI", "2014", "1041", "1016", "PFQTR", "PFSTG", "PFTNI",
  "PFTBI", "PFTNG", "1000", "1110", "PFTVH", "PFTQU", "PFVLG", "1018",
  "PLFYBI",
];

export async function POST(req: NextRequest) {
  try {
    await initDB();

    const body = await req.json() as { rows: ImportRow[]; isFirst: boolean; datesInFile?: string[] };
    const { rows, isFirst, datesInFile } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows" }, { status: 400 });
    }

    // Lọc bỏ các dòng không hợp lệ trước khi insert
    const filteredRows = rows.filter(
      (r) => VALID_STATUSES.includes(String(r.status)) && VALID_DEPOTS.includes(String(r.depot))
    );

    if (filteredRows.length === 0) {
      return NextResponse.json({ error: "No valid rows after filtering" }, { status: 400 });
    }

    const client = await db.connect();
    try {
      if (isFirst && datesInFile && datesInFile.length > 0) {
        // Xóa chỉ các ngày có trong file đang upload, giữ lại dữ liệu các ngày khác
        await client.query(
          "DELETE FROM orders WHERE create_date = ANY($1::date[])",
          [datesInFile]
        );
      } else if (isFirst) {
        await client.query("TRUNCATE TABLE orders RESTART IDENTITY");
      }

      for (let i = 0; i < filteredRows.length; i += CHUNK) {
        const batch = filteredRows.slice(i, i + CHUNK);
        const values: unknown[] = [];
        const placeholders = batch.map((_, j) => {
          const b = j * 9;
          const row = batch[j];
          values.push(
            row.order_id,
            row.status,
            row.depot,
            row.total_pay ?? 0,
            row.pickup_city,
            row.create_date || null,
            row.create_hour ?? 0,
            row.sap_profile_id,
            row.distance
          );
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`;
        }).join(",");

        await client.query(
          `INSERT INTO orders(order_id,status,depot,total_pay,pickup_city,create_date,create_hour,sap_profile_id,distance)
           VALUES ${placeholders}`,
          values
        );
      }

      // Lưu thời điểm import cuối cùng
      await client.query(
        `INSERT INTO metadata (key, value) VALUES ('last_import_at', NOW()::text)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
      );

      return NextResponse.json({ inserted: filteredRows.length, filtered: rows.length - filteredRows.length });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    console.error("Import error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
