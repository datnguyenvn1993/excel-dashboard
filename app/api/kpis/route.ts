import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const DAY_FILTER = `create_date = (SELECT MAX(create_date) FROM orders)`;
const GMV_FILTER = `LOWER(status) LIKE 'complete%' OR LOWER(status) IN ('in process','in progress') OR LOWER(status) LIKE 'process%'`;

export async function GET() {
  const client = await db.connect();
  try {
    const [nat, dep] = await Promise.all([
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
          MAX(create_date)::text as max_date
        FROM deduped
      `),
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
      `),
    ]);

    const r = nat.rows[0];
    return NextResponse.json({
      national: {
        total: r.total, gmv: r.gmv, complete: r.complete,
        cancel: r.cancel, processing: r.processing,
        txActive: r.tx_active, maxDate: r.max_date,
      },
      depots: dep.rows.map(d => ({
        depot: d.depot, total: d.total, gmv: d.gmv,
        complete: d.complete, cancel: d.cancel,
        processing: d.processing, txActive: d.tx_active,
      })),
    });
  } catch (e) {
    console.error("kpis error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}
