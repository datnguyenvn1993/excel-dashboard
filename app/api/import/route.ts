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

export async function POST(req: NextRequest) {
  try {
    await initDB();

    const body = await req.json() as { rows: ImportRow[]; isFirst: boolean };
    const { rows, isFirst } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows" }, { status: 400 });
    }

    const client = await db.connect();
    try {
      if (isFirst) {
        await client.query("TRUNCATE TABLE orders RESTART IDENTITY");
      }

      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = rows.slice(i, i + CHUNK);
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
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`;
        }).join(",");

        await client.query(
          `INSERT INTO orders(order_id,status,depot,total_pay,pickup_city,create_date,create_hour,sap_profile_id,distance)
           VALUES ${placeholders}`,
          values
        );
      }

      return NextResponse.json({ inserted: rows.length });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    console.error("Import error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
