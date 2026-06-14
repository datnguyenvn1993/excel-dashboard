import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const D10 = `create_date >= (SELECT COALESCE(MAX(create_date)-INTERVAL '10 days','2000-01-01'::date) FROM orders)`;

export async function GET() {
  const client = await db.connect();
  try {
    const [nat, dep] = await Promise.all([
      client.query(`
        SELECT COUNT(*)::int as total,
          COALESCE(SUM(total_pay),0)::float as gmv,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'complete%')::int as complete,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'cancel%')::int as cancel,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'process%' OR LOWER(status)='in progress')::int as processing,
          COUNT(DISTINCT NULLIF(sap_profile_id,''))::int as tx_active,
          MAX(create_date)::text as max_date
        FROM orders WHERE ${D10}
      `),
      client.query(`
        SELECT depot,
          COUNT(*)::int as total,
          COALESCE(SUM(total_pay),0)::float as gmv,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'complete%')::int as complete,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'cancel%')::int as cancel,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'process%' OR LOWER(status)='in progress')::int as processing,
          COUNT(DISTINCT NULLIF(sap_profile_id,''))::int as tx_active
        FROM orders WHERE ${D10}
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
