import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildRegionSql, parseRegions } from "@/lib/regions";
import { isDateCompressed } from "@/lib/compress";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const selectedRegions = parseRegions(searchParams.get("regions"));

  const client = await db.connect();
  try {
    const maxRes = await client.query(`
      SELECT MAX(d)::text as max_date FROM (
        SELECT MAX(create_date) as d FROM orders
        UNION ALL
        SELECT MAX(create_date) as d FROM orders_summary
      ) sub
    `);
    const dateParam = searchParams.get("date");
    const maxDate: string | null = dateParam || (maxRes.rows[0]?.max_date ?? null);

    if (!maxDate) {
      return NextResponse.json({ hourly: [], daily: [], todayDate: null, d7Date: null });
    }

    const d7 = new Date(maxDate + "T00:00:00");
    d7.setDate(d7.getDate() - 7);
    const d7Str = d7.toISOString().slice(0, 10);

    const regionCaseSql = buildRegionSql("pickup_city");
    const regionFilterSql = selectedRegions.length > 0
      ? "AND (" + regionCaseSql + ") IN (" + selectedRegions.map(r => "'" + r.replace(/'/g, "''") + "'").join(",") + ")"
      : "";
    const regionFilterSummarySql = selectedRegions.length > 0
      ? "AND region IN (" + selectedRegions.map(r => "'" + r.replace(/'/g, "''") + "'").join(",") + ")"
      : "";

    const todayCompressed = await isDateCompressed(client, maxDate);
    const d7Compressed = await isDateCompressed(client, d7Str);

    // --- Hourly data ---
    type HourlyRow = { create_date: string; create_hour: number; region: string | null; gmv: number; trip: number };
    const hourlyRows: HourlyRow[] = [];

    const rawHourlySql = `
      WITH deduped AS (
        SELECT DISTINCT ON (COALESCE(NULLIF(order_id,''), id::text))
          create_date, create_hour, total_pay, pickup_city, status
        FROM orders
        WHERE create_date = $1::date AND create_hour IS NOT NULL
        ${regionFilterSql}
        ORDER BY COALESCE(NULLIF(order_id,''), id::text)
      )
      SELECT create_date::text, create_hour,
        (${regionCaseSql}) as region,
        COALESCE(SUM(CASE WHEN LOWER(status) LIKE 'complete%' THEN total_pay ELSE 0 END),0)::float as gmv,
        COUNT(*) FILTER (WHERE LOWER(status) LIKE 'complete%')::int as trip
      FROM deduped
      GROUP BY 1, 2, 3 ORDER BY 1, 2, 3
    `;
    const summaryHourlySql = `
      SELECT create_date::text, create_hour, region,
        COALESCE(SUM(gmv),0)::float as gmv,
        COALESCE(SUM(complete_count),0)::int as trip
      FROM orders_summary
      WHERE create_date = $1::date ${regionFilterSummarySql}
      GROUP BY 1, 2, 3 ORDER BY 1, 2, 3
    `;

    // Today hourly
    const todayHourly = await client.query(todayCompressed ? summaryHourlySql : rawHourlySql, [maxDate]);
    hourlyRows.push(...todayHourly.rows);

    // D-7 hourly
    const d7Hourly = await client.query(d7Compressed ? summaryHourlySql : rawHourlySql, [d7Str]);
    hourlyRows.push(...d7Hourly.rows);

    // --- Daily data (UNION raw + summary) ---
    const dailyRes = await client.query(
      `WITH daily_agg AS (
         SELECT create_date,
           SUM(cc)::int as complete, SUM(pc)::int as processing,
           SUM(canc)::int as cancel, COALESCE(SUM(g),0)::float as gmv
         FROM (
           SELECT create_date,
             COUNT(*) FILTER (WHERE LOWER(status) LIKE 'complete%') as cc,
             COUNT(*) FILTER (WHERE LOWER(status) LIKE 'process%' OR LOWER(status)='in progress') as pc,
             COUNT(*) FILTER (WHERE UPPER(TRIM(cancel_by)) = 'DRIVER') as canc,
             SUM(CASE WHEN LOWER(status) LIKE 'complete%' THEN total_pay ELSE 0 END) as g
           FROM orders
           WHERE create_date >= $1::date - 17
           AND SPLIT_PART(TRIM(CAST(depot AS TEXT)), '.', 1) = '1032'
           ${regionFilterSql}
           GROUP BY create_date
           UNION ALL
           SELECT create_date,
             SUM(complete_count), SUM(processing_count), SUM(cancel_count), SUM(gmv)
           FROM orders_summary
           WHERE create_date >= $1::date - 17 AND depot = '1032'
           ${regionFilterSummarySql}
           GROUP BY create_date
         ) combined
         GROUP BY create_date
       )
       SELECT create_date::text as date,
         COALESCE(complete,0) as complete, COALESCE(processing,0) as processing,
         COALESCE(cancel,0) as cancel, COALESCE(gmv,0) as gmv
       FROM daily_agg
       WHERE create_date >= $1::date - 10
       ORDER BY create_date`,
      [maxDate]
    );

    // --- Build hourly output ---
    const hourlyData: any[] = Array.from({ length: 24 }, (_, h) => ({
      hour: String(h).padStart(2, "0") + "h",
      today: 0, d7: 0, trip_today: 0, trip_d7: 0
    }));

    for (const row of hourlyRows) {
      const h = row.create_hour;
      if (h < 0 || h > 23) continue;
      const gmvMil = row.gmv / 1_000_000;
      const trip = row.trip || 0;
      const rName = row.region;

      if (row.create_date === maxDate) {
        hourlyData[h].today += gmvMil;
        hourlyData[h].trip_today += trip;
        if (rName) {
          hourlyData[h][rName] = (hourlyData[h][rName] || 0) + gmvMil;
          hourlyData[h][rName + "_trip"] = (hourlyData[h][rName + "_trip"] || 0) + trip;
        }
      }
      if (row.create_date === d7Str) {
        hourlyData[h].d7 += gmvMil;
        hourlyData[h].trip_d7 += trip;
        if (rName) {
          hourlyData[h][rName + "_d7"] = (hourlyData[h][rName + "_d7"] || 0) + gmvMil;
          hourlyData[h][rName + "_trip_d7"] = (hourlyData[h][rName + "_trip_d7"] || 0) + trip;
        }
      }
    }

    for (let h = 0; h < 24; h++) {
      for (const key in hourlyData[h]) {
        if (key !== "hour") hourlyData[h][key] = Math.round(hourlyData[h][key]);
      }
    }

    return NextResponse.json({
      todayDate: maxDate,
      d7Date: d7Str,
      hourly: hourlyData,
      daily: dailyRes.rows.map((r: any) => {
        const d = new Date(r.date + "T00:00:00Z");
        const dayOfWeek = d.getUTCDay();
        return {
          date: r.date.slice(5).replace("-", "/"),
          isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
          complete: r.complete,
          processing: r.processing,
          cancel: r.cancel,
          gmv: Math.round(r.gmv / 1_000_000),
        };
      }),
    });
  } catch (e) {
    console.error("chart error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}
