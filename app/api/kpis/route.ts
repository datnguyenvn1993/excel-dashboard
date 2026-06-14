import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { REGION_ORDER, parseRegions, buildRegionSql } from "@/lib/regions";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const selectedRegions = parseRegions(searchParams.get("regions"));

  const DAY_FILTER = dateParam
    ? `create_date = $1::date`
    : `create_date = (SELECT MAX(create_date) FROM orders)`;

  const regionCaseSql = buildRegionSql("pickup_city");

  const regionFilterSql = selectedRegions.length > 0
    ? `AND (${regionCaseSql}) IN (${selectedRegions.map(r => `'${r.replace(/'/g,"''")}'`).join(",")})`
    : "";

  const client = await db.connect();
  try {
    const queryArgs = dateParam ? [dateParam] : [];

    const [nat, reg, dates] = await Promise.all([
      client.query(`
        WITH deduped AS (
          SELECT DISTINCT ON (COALESCE(NULLIF(order_id,''), id::text))
            id, order_id, status, total_pay, sap_profile_id, create_date, pickup_city
          FROM orders
          WHERE ${DAY_FILTER}
          ORDER BY COALESCE(NULLIF(order_id,''), id::text)
        )
        SELECT
          COUNT(*)::int as total,
          COALESCE(SUM(CASE WHEN LOWER(status) LIKE 'complete%' THEN total_pay ELSE 0 END),0)::float as gmv,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'complete%')::int as complete,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'cancel%')::int as cancel,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'process%' OR LOWER(status)='in progress')::int as processing,
          COUNT(DISTINCT NULLIF(TRIM(sap_profile_id),''))::int as tx_active
        FROM deduped
        WHERE 1=1 ${regionFilterSql}
      `, queryArgs),
      client.query(`
        WITH deduped AS (
          SELECT DISTINCT ON (COALESCE(NULLIF(order_id,''), id::text))
            id, order_id, status, total_pay, sap_profile_id, create_date, pickup_city
          FROM orders
          WHERE ${DAY_FILTER}
          ORDER BY COALESCE(NULLIF(order_id,''), id::text)
        )
        SELECT
          (${regionCaseSql}) as region,
          COUNT(*)::int as total,
          COALESCE(SUM(CASE WHEN LOWER(status) LIKE 'complete%' THEN total_pay ELSE 0 END),0)::float as gmv,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'complete%')::int as complete,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'cancel%')::int as cancel,
          COUNT(*) FILTER (WHERE LOWER(status) LIKE 'process%' OR LOWER(status)='in progress')::int as processing,
          COUNT(DISTINCT NULLIF(TRIM(sap_profile_id),''))::int as tx_active
        FROM deduped
        GROUP BY 1
        ORDER BY 1
      `, queryArgs),
      client.query(`
        SELECT DISTINCT create_date::text as date
        FROM orders
        ORDER BY 1 DESC
      `),
    ]);

    const r = nat.rows[0];
    const maxDate = dateParam ?? dates.rows[0]?.date ?? null;
    const minDate = dates.rows[dates.rows.length - 1]?.date ?? null;

    return NextResponse.json({
      national: {
        total: r.total, gmv: r.gmv, complete: r.complete,
        cancel: r.cancel, processing: r.processing,
        txActive: r.tx_active, maxDate, minDate,
      },
      regions: REGION_ORDER.map(name => {
        const row = reg.rows.find(r => r.region === name);
        if (!row) return null;
        return {
          region: name, total: row.total, gmv: row.gmv,
          complete: row.complete, cancel: row.cancel,
          processing: row.processing, txActive: row.tx_active,
        };
      }).filter(Boolean),
      availableDates: dates.rows.map(d => d.date),
    });
  } catch (e) {
    console.error("kpis error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}
