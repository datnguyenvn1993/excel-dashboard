import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";
import { REGION_ORDER, parseRegions, buildRegionSql } from "@/lib/regions";

export async function GET(req: NextRequest) {
  await initDB();
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const selectedRegions = parseRegions(searchParams.get("regions"));
  const hourParam = searchParams.get("hour");
  const hour = hourParam !== null && hourParam !== "" ? parseInt(hourParam, 10) : null;

  const regionCaseSql = buildRegionSql("pickup_city");
  const regionFilterSql = selectedRegions.length > 0
    ? "AND (" + regionCaseSql + ") IN (" + selectedRegions.map(r => "'" + r.replace(/'/g, "''") + "'").join(",") + ")"
    : "";
  const hourFilterSql = hour !== null ? `AND create_hour <= ${hour}` : "";

  const client = await db.connect();
  try {
    // Resolve target date
    let targetDate: string;
    if (dateParam) {
      targetDate = dateParam;
    } else {
      const res = await client.query("SELECT MAX(create_date)::text as d FROM orders");
      targetDate = res.rows[0]?.d ?? "";
    }
    if (!targetDate) {
      return NextResponse.json({
        national: {
          total: 0, gmv: 0, complete: 0, cancel: 0, processing: 0, txActive: 0,
          maxDate: null, minDate: null, d7Total: 0, d7Gmv: 0, d7TxActive: 0
        },
        regions: [], availableDates: [], lastImportAt: null, d7Date: null,
      });
    }

    // Compute D-7 date
    const d7Obj = new Date(targetDate + "T12:00:00Z");
    d7Obj.setUTCDate(d7Obj.getUTCDate() - 7);
    const d7DateStr = d7Obj.toISOString().slice(0, 10);

    const buildNatQuery = () => `
      WITH deduped AS (
        SELECT DISTINCT ON (COALESCE(NULLIF(order_id,''), id::text))
          id, order_id, status, total_pay, sap_profile_id, create_date, pickup_city
        FROM orders WHERE create_date = $1::date ${hourFilterSql}
        ORDER BY COALESCE(NULLIF(order_id,''), id::text)
      )
      SELECT
        COUNT(*)::int as total,
        COALESCE(SUM(CASE WHEN LOWER(status) LIKE 'complete%' THEN total_pay ELSE 0 END),0)::float as gmv,
        COUNT(*) FILTER (WHERE LOWER(status) LIKE 'complete%')::int as complete,
        COUNT(*) FILTER (WHERE LOWER(status) LIKE 'cancel%')::int as cancel,
        COUNT(*) FILTER (WHERE LOWER(status) LIKE 'process%' OR LOWER(status)='in progress')::int as processing,
        COUNT(DISTINCT NULLIF(TRIM(sap_profile_id),''))::int as tx_active
      FROM deduped WHERE 1=1 ${regionFilterSql}
    `;

    const buildRegQuery = () => `
      WITH deduped AS (
        SELECT DISTINCT ON (COALESCE(NULLIF(order_id,''), id::text))
          id, order_id, status, total_pay, sap_profile_id, create_date, pickup_city
        FROM orders WHERE create_date = $1::date ${hourFilterSql}
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
      FROM deduped GROUP BY 1 ORDER BY 1
    `;

    const [nat, reg, natD7, regD7, dates, meta] = await Promise.all([
      client.query(buildNatQuery(), [targetDate]),
      client.query(buildRegQuery(), [targetDate]),
      client.query(buildNatQuery(), [d7DateStr]),
      client.query(buildRegQuery(), [d7DateStr]),
      client.query("SELECT DISTINCT create_date::text as date FROM orders ORDER BY 1 DESC"),
      client.query("SELECT value FROM metadata WHERE key = 'last_import_at'"),
    ]);

    const r = nat.rows[0];
    const rd7 = natD7.rows[0];
    const minDate = dates.rows[dates.rows.length - 1]?.date ?? null;
    const lastImportAt = meta.rows[0]?.value ?? null;

    return NextResponse.json({
      national: {
        total: r.total, gmv: r.gmv, complete: r.complete,
        cancel: r.cancel, processing: r.processing, txActive: r.tx_active,
        maxDate: targetDate, minDate,
        d7Total: rd7?.total ?? 0, d7Gmv: rd7?.gmv ?? 0, d7TxActive: rd7?.tx_active ?? 0,
      },
      regions: REGION_ORDER.map(name => {
        const row = reg.rows.find((rw: { region: string }) => rw.region === name);
        const rowD7 = regD7.rows.find((rw: { region: string }) => rw.region === name);
        if (!row) return null;
        return {
          region: name, total: row.total, gmv: row.gmv,
          complete: row.complete, cancel: row.cancel,
          processing: row.processing, txActive: row.tx_active,
          d7Total: rowD7?.total ?? 0, d7Gmv: rowD7?.gmv ?? 0, d7TxActive: rowD7?.tx_active ?? 0,
        };
      }).filter(Boolean),
      availableDates: dates.rows.map((d: { date: string }) => d.date),
      lastImportAt,
      d7Date: d7DateStr,
    });
  } catch (e) {
    console.error("kpis error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally { client.release(); }
}
