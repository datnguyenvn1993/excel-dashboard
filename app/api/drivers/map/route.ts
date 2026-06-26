import { NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";

// Returns the full sap_id -> doi map so the client can aggregate orders into the
// driver-group (doi) dimension before upload. The map is small (one row per driver).
export async function GET() {
  try {
    await initDB();
    const client = await db.connect();
    try {
      const r = await client.query("SELECT sap_id, doi FROM drivers");
      const map: Record<string, string> = {};
      for (const row of r.rows as { sap_id: string; doi: string }[]) {
        map[String(row.sap_id).trim()] = String(row.doi ?? "").trim();
      }
      return NextResponse.json({ map, total: r.rows.length });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
