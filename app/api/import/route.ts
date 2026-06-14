import { NextRequest, NextResponse } from "next/server";
import { db, initDB } from "@/lib/db";

interface ImportRow {
  order_id: string; status: string; depot: string; total_pay: number;
  pickup_city: string; create_date: string | null; create_hour: number | null;
  sap_profile_id: string; distance: string;
}

export async function POST(req: NextRequest) {
  try {
    await initDB();
    const { rows, isFirst } = (await req.json()) as { rows: ImportRow[]; isFirst: boolean };

    const client = await db.connect();
    try {
      if (isFirst) await client.query("TRUNCATE orders");
      if (rows.length === 0) return NextResponse.json({ ok: true });

      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = rows.slice(i, i + CHUNK);
        const placeholders = batch.map((_, j) => {
          const b = j * 9;
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`;
        }).join(",");
        const values = batch.flatMap(r => [
          r.order_id, r.status, r.depot, r.total_pay,
          r.pickup_city, r.create_date, r.create_hour,
          r.sap_profile_id, r.distance,
        ]);
        await client.query(
          `INSERT INTO orders(order_id,status,depot,total_pay,pickup_city,create_date,create_hour,sap_profile_id,distance) VALUES ${placeholders}`,
          values
        );
      }
    } finally {
      client.release();
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Import error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
