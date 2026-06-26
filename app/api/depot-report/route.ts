import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";
import { isDateCompressed } from "@/lib/compress";
import { buildDepotGroupSql } from "@/lib/depots";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const hourParam = searchParams.get("hour");
    const hour = hourParam !== null && hourParam !== "" ? parseInt(hourParam, 10) : null;
    await initDB();
    const client = await db.connect();
    try {
        // Determine effective targetDate and prevDate
        let targetDate = dateParam;
        if (!targetDate) {
            const maxRes = await client.query(`
        SELECT MAX(d)::text as max_date FROM (
          SELECT MAX(create_date) as d FROM orders
          UNION ALL
          SELECT MAX(create_date) as d FROM orders_summary
        ) sub
      `);
            targetDate = maxRes.rows[0]?.max_date ?? null;
        }
        if (!targetDate) return NextResponse.json({ depots: [] });

        const prevDateObj = new Date(targetDate + "T12:00:00Z");
        prevDateObj.setUTCDate(prevDateObj.getUTCDate() - 7);
        const prevDate = prevDateObj.toISOString().slice(0, 10);

        const targetCompressed = await isDateCompressed(client, targetDate);
        const prevCompressed = await isDateCompressed(client, prevDate);

        // Filter by hour
        let effectiveHour = hour;
        if (effectiveHour === null) {
            const maxRes = await client.query(`
        SELECT MAX(d)::text as max_date FROM (
          SELECT MAX(create_date) as d FROM orders
          UNION ALL
          SELECT MAX(create_date) as d FROM orders_summary
        ) sub
      `);
            const absoluteMaxDate = maxRes.rows[0]?.max_date ?? null;

            let maxH = null;
            // Get max hour for targetDate (try summary first if compressed, else raw)
            if (targetCompressed) {
                const mh = await client.query("SELECT MAX(create_hour)::int as h FROM orders_summary WHERE create_date = $1::date", [targetDate]);
                maxH = mh.rows[0]?.h ?? null;
            } else {
                const mh = await client.query("SELECT MAX(create_hour)::int as h FROM orders WHERE create_date = $1::date", [targetDate]);
                maxH = mh.rows[0]?.h ?? null;
            }

            if (targetDate === absoluteMaxDate) {
                const metaRes = await client.query("SELECT value FROM metadata WHERE key = 'last_import_at'");
                const importAt = metaRes.rows[0]?.value;
                if (importAt) {
                    const d = new Date(importAt);
                    if (!isNaN(d.getTime())) {
                        const vnTime = new Date(d.getTime() + 7 * 3600 * 1000);
                        const vnDateStr = vnTime.toISOString().split('T')[0];
                        if (targetDate === vnDateStr) {
                            effectiveHour = vnTime.getUTCHours() - 1;
                        } else { effectiveHour = maxH; }
                    } else { effectiveHour = maxH; }
                } else { effectiveHour = maxH; }
            } else {
                effectiveHour = maxH;
            }
        }

        const hourFilterRawSql = effectiveHour !== null ? `AND o.create_hour <= ${effectiveHour}` : "";
        const effHourForSummary = effectiveHour !== null ? effectiveHour : 23;
        const depotGroupSql = buildDepotGroupSql("o.depot");

        // Build raw queries
        const buildCurrRaw = () => `
      SELECT COALESCE(${depotGroupSql}, 'Khác') AS depot_group,
        COALESCE(SUM(CASE WHEN LOWER(o.status) LIKE 'complete%' THEN o.total_pay ELSE 0 END),0)::float AS gmv,
        COUNT(DISTINCT NULLIF(TRIM(o.sap_profile_id),'')) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int AS driver_active,
        COUNT(o.id) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int AS trip_complete
      FROM orders o
      WHERE o.create_date = $1::date ${hourFilterRawSql}
      GROUP BY COALESCE(${depotGroupSql}, 'Khác')
    `;
        const buildPrevRaw = () => `
      SELECT COALESCE(${depotGroupSql}, 'Khác') AS depot_group,
        COALESCE(SUM(CASE WHEN LOWER(o.status) LIKE 'complete%' THEN o.total_pay ELSE 0 END),0)::float AS gmv,
        COUNT(DISTINCT NULLIF(TRIM(o.sap_profile_id),'')) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int AS driver_active,
        COUNT(o.id) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int AS trip_complete
      FROM orders o
      WHERE o.create_date = $1::date ${hourFilterRawSql}
      GROUP BY COALESCE(${depotGroupSql}, 'Khác')
    `;

        // Build summary queries
        const buildCurrSummary = () => `
      SELECT depot_group,
        gmv::float AS gmv,
        driver_active::int AS driver_active,
        trip_complete::int AS trip_complete
      FROM depot_hourly_summary
      WHERE create_date = $1::date AND create_hour = ${effHourForSummary}
    `;
        const buildPrevSummary = () => `
      SELECT depot_group,
        gmv::float AS gmv,
        driver_active::int AS driver_active,
        trip_complete::int AS trip_complete
      FROM depot_hourly_summary
      WHERE create_date = $1::date AND create_hour = ${effHourForSummary}
    `;

        // Proper parameterization:
        const buildFinalSql = () => `
       WITH curr AS (
         ${(targetCompressed ? buildCurrSummary() : buildCurrRaw()).replace(/\$1/g, '$1')}
       ),
       prev AS (
         ${(prevCompressed ? buildPrevSummary() : buildPrevRaw()).replace(/\$1/g, '$2')}
       )
       SELECT COALESCE(c.depot_group, p.depot_group) AS depot_group,
        COALESCE(c.gmv, 0) AS gmv, COALESCE(p.gmv, 0) AS gmv_prev,
        COALESCE(c.driver_active, 0) AS driver_active, COALESCE(p.driver_active, 0) AS driver_active_prev,
        COALESCE(c.trip_complete, 0) AS trip_complete, COALESCE(p.trip_complete, 0) AS trip_complete_prev
      FROM curr c FULL OUTER JOIN prev p ON c.depot_group = p.depot_group
      ORDER BY COALESCE(c.depot_group, p.depot_group)
    `;

        const r = await client.query(buildFinalSql(), [targetDate, prevDate]);
        return NextResponse.json({ depots: r.rows });
    } catch (e: unknown) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
    } finally { client.release(); }
}
