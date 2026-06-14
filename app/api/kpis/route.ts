import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const GMV_FILTER = `LOWER(status) LIKE 'complete%' OR LOWER(status) IN ('in process','in progress') OR LOWER(status) LIKE 'process%'`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date"); // e.g. "2026-06-14"

  // DAY_FILTER: if date param provided use it, else use MAX date from DB
  const DAY_FILTER = dateParam
    ? `create_date = $1::date`
    : `create_date = (SELECT MAX(create_date) FROM orders)`;

  const client = await db.connect();
  try {
    const queryArgs = dateParam ? [dateParam] : [];

    const [nat, dep, dates] = await Promise.all([
      client.query(`
        WITH deduped AS (
          SELECT DISTINCT ON (COALESCE(NULLIF(order_id,''), id::text))
            id, order_id, status, depot, total_pay, sap_profile_id, create_date
          FROM orders
          WHERE ${DAY_FILTER}
          ORDER BY COALESCE(NULLIF(order_id,''), id::text)
        )
        SELECT
          COUNT(*)::int as total,
          COALESCE(SUM(total_pay) FILTER (WHERE ${GMV_FILTER}), 0)::float as gmv,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'complete%')::int as complete,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'cancel%')::int as cancel,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'process%' OR LOWER(status) IN ('in progress','in process'))::int as processing,
          COUNT(DISTINCT NULLIF(sap_profile_id,''))::int as tx_active,
          MAX(create_date)::text as max_date,
          (SELECT MIN(create_date)::text FROM orders) as min_date
        FROM deduped
      `, queryArgs),
      client.query(`
        WITH deduped AS (
          SELECT DISTINCT ON (COALESCE(NULLIF(order_id,''), id::text))
            id, order_id, status, depot, total_pay, sap_profile_id, create_date
          FROM orders
          WHERE ${DAY_FILTER}
          ORDER BY COALESCE(NULLIF(order_id,''), id::text)
        )
        SELECT depot,
          COUNT(*)::int as total,
          COALESCE(SUM(total_pay) FILTER (WHERE ${GMV_FILTER}), 0)::float as gmv,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'complete%')::int as complete,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'cancel%')::int as cancel,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'process%' OR LOWER(status) IN ('in progress','in process'))::int as processing,
          COUNT(DISTINCT NULLIF(sap_profile_id,''))::int as tx_active
        FROM deduped
        GROUP BY depot ORDER BY depot
      `, queryArgs),
      // All available dates in DB sorted descending (newest first)
      client.query(`SELECT DISTINCT create_date::text as date FROM orders ORDER BY create_date DESC`),
    ]);

    const r = nat.rows[0];
    return NextResponse.json({
      national: {
        total: r.total, gmv: r.gmv, complete: r.complete,
        cancel: r.cancel, processing: r.processing,
        txActive: r.tx_active, maxDate: r.max_date, minDate: r.min_date,
      },
      depots: dep.rows.map(d => ({
        depot: d.depot, total: d.total, gmv: d.gmv,
        complete: d.complete, cancel: d.cancel,
        processing: d.processing, txActive: d.tx_active,
      })),
      availableDates: dates.rows.map(d => d.date),
    });
  } catch (e) {
    console.error("kpis error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally { client.release(); }
}
