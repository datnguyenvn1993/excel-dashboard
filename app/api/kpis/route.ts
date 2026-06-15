import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const hourRaw   = searchParams.get("hour");
  const hourNum   = hourRaw !== null && hourRaw !== "" ? parseInt(hourRaw, 10) : NaN;
  const HOUR_FILTER = !isNaN(hourNum) ? `AND create_hour = ${hourNum}` : "";

  const DAY_FILTER = dateParam
    ? "create_date = $1::date"
    : "create_date = (SELECT MAX(create_date) FROM orders)";

  const client = await db.connect();
  try {
    const args = dateParam ? [dateParam] : [];
    const [nat, reg, dates] = await Promise.all([
      client.query(`
        SELECT
          COUNT(*)::int as total,
          COALESCE(SUM(CASE WHEN LOWER(status) LIKE 'complete%' THEN total_pay ELSE 0 END),0)::float as gmv,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'complete%')::int as complete,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'cancel%')::int as cancel,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'process%' OR LOWER(status)='in progress')::int as processing,
          COUNT(DISTINCT NULLIF(TRIM(sap_profile_id),''))::int as tx_active,
          MAX(create_date)::text as max_date
        FROM orders WHERE ${DAY_FILTER} ${HOUR_FILTER}
      `, args),
      client.query(`
        SELECT
          depot as region,
          COUNT(*)::int as total,
          COALESCE(SUM(CASE WHEN LOWER(status) LIKE 'complete%' THEN total_pay ELSE 0 END),0)::float as gmv,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'complete%')::int as complete,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'cancel%')::int as cancel,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'process%' OR LOWER(status)='in progress')::int as processing,
          COUNT(DISTINCT NULLIF(TRIM(sap_profile_id),''))::int as tx_active
        FROM orders WHERE ${DAY_FILTER} ${HOUR_FILTER}
        GROUP BY depot ORDER BY depot
      `, args),
      client.query(`SELECT DISTINCT create_date::text as date FROM orders ORDER BY 1 DESC`),
    ]);

    const r = nat.rows[0] ?? {};
    const maxDate = dateParam ?? r.max_date ?? null;
    const availableDates = dates.rows.map((d: { date: string }) => d.date);

    return NextResponse.json({
      national: {
        total:      r.total      ?? 0,
        gmv:        r.gmv        ?? 0,
        complete:   r.complete   ?? 0,
        cancel:     r.cancel     ?? 0,
        processing: r.processing ?? 0,
        txActive:   r.tx_active  ?? 0,
        maxDate,
        minDate: availableDates[availableDates.length - 1] ?? null,
      },
      regions: (reg.rows as Array<Record<string,unknown>>).map(row => ({
        region:     row.region,
        total:      row.total,
        gmv:        row.gmv,
        complete:   row.complete,
        cancel:     row.cancel,
        processing: row.processing,
        txActive:   row.tx_active,
      })),
      availableDates,
      lastImportAt: null,
    });
  } catch (e) {
    console.error("kpis error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}
