import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";

interface DriverRow { sap_id: string; doi: string; }

export async function POST(req: NextRequest) {
  try {
    await initDB();
    const body = await req.json() as { rows: DriverRow[] };
    const { rows } = body;
    if (!Array.isArray(rows) || rows.length === 0)
      return NextResponse.json({ error: "No rows" }, { status: 400 });
    const client = await db.connect();
    try {
      await client.query("TRUNCATE TABLE drivers");
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = rows.slice(i, i + CHUNK);
        const vals: unknown[] = [];
        const ph = batch.map((r, j) => {
          vals.push(r.sap_id.trim(), (r.doi || "").trim());
          return "($" + (j*2+1) + ",$" + (j*2+2) + ")";
        }).join(",");
        await client.query(
          "INSERT INTO drivers (sap_id,doi) VALUES " + ph +
          " ON CONFLICT (sap_id) DO UPDATE SET doi=EXCLUDED.doi,imported_at=NOW()",
          vals
        );
      }
      await client.query(
        "INSERT INTO metadata(key,value) VALUES('last_driver_import',NOW()::text)" +
        " ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value"
      );
      return NextResponse.json({ inserted: rows.length });
    } finally { client.release(); }
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    await initDB();
    const client = await db.connect();
    try {
      const r = await client.query("SELECT COUNT(*)::int as total FROM drivers");
      const m = await client.query("SELECT value FROM metadata WHERE key='last_driver_import'");
      return NextResponse.json({ total: r.rows[0].total, lastImport: m.rows[0]?.value ?? null });
    } finally { client.release(); }
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
