import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const hourParam = searchParams.get("hour");
  const hour = hourParam !== null && hourParam !== "" ? parseInt(hourParam, 10) : null;
  await initDB();
  const client = await db.connect();
  try {
    const dateExpr = dateParam ? "$1::date" : "(SELECT MAX(create_date) FROM orders)";
    const prevExpr = dateParam ? "($1::date - INTERVAL '7 days')" : "((SELECT MAX(create_date) FROM orders) - INTERVAL '7 days')";
    const hourFilterSql = await (async () => {
      let h = hour;
      if (h === null) {
        const metaRes = await client.query("SELECT value FROM metadata WHERE key = 'last_import_at'");
        const importAt = metaRes.rows[0]?.value;
        if (importAt) { const d = new Date(importAt); if (!isNaN(d.getTime())) h = (d.getUTCHours() + 7) % 24; }
      }
      return h !== null ? `AND o.create_hour <= ${h}` : "";
    })();
    const args = dateParam ? [dateParam] : [];
    const sql = `
      WITH curr AS (
        SELECT COALESCE(d.doi, '') AS doi,
          COALESCE(SUM(CASE WHEN LOWER(o.status) LIKE 'complete%' THEN o.total_pay ELSE 0 END),0)::float AS gmv,
          COUNT(DISTINCT NULLIF(TRIM(o.sap_profile_id),'')) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int AS driver_active,
          COUNT(o.id) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int AS trip_complete
        FROM orders o
        LEFT JOIN drivers d ON NULLIF(TRIM(o.sap_profile_id),'') = d.sap_id
        WHERE o.create_date = ${dateExpr} AND SPLIT_PART(TRIM(CAST(o.depot AS TEXT)), '.', 1) = '1032' ${hourFilterSql}
        GROUP BY COALESCE(d.doi, '')
      ),
      prev AS (
        SELECT COALESCE(d.doi, '') AS doi,
          COALESCE(SUM(CASE WHEN LOWER(o.status) LIKE 'complete%' THEN o.total_pay ELSE 0 END),0)::float AS gmv,
          COUNT(DISTINCT NULLIF(TRIM(o.sap_profile_id),'')) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int AS driver_active,
          COUNT(o.id) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int AS trip_complete
        FROM orders o
        LEFT JOIN drivers d ON NULLIF(TRIM(o.sap_profile_id),'') = d.sap_id
        WHERE o.create_date = ${prevExpr} AND SPLIT_PART(TRIM(CAST(o.depot AS TEXT)), '.', 1) = '1032' ${hourFilterSql}
        GROUP BY COALESCE(d.doi, '')
      )
      SELECT COALESCE(c.doi, p.doi) AS doi,
        COALESCE(c.gmv, 0) AS gmv, p.gmv AS gmv_prev,
        COALESCE(c.driver_active, 0) AS driver_active, p.driver_active AS driver_active_prev,
        COALESCE(c.trip_complete, 0) AS trip_complete, p.trip_complete AS trip_complete_prev
      FROM curr c FULL OUTER JOIN prev p ON c.doi = p.doi
      ORDER BY COALESCE(c.doi, p.doi)
    `;
    const r = await client.query(sql, args);
    return NextResponse.json({ teams: r.rows });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally { client.release(); }
}
