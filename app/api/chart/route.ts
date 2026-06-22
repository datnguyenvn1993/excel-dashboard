import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildRegionSql, citiesForRegions, parseRegions } from "@/lib/regions";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const selectedRegions = parseRegions(searchParams.get("regions"));

  const client = await db.connect();
  try {
    const maxRes = await client.query(`SELECT MAX(create_date)::text as max_date FROM orders`);
    const dateParam = searchParams.get("date");
    const maxDate: string | null = dateParam || (maxRes.rows[0]?.max_date ?? null);

    if (!maxDate) {
      return NextResponse.json({ hourly: [], daily: [], todayDate: null, d7Date: null });
    }

    const d7 = new Date(maxDate + "T00:00:00");
    d7.setDate(d7.getDate() - 7);
    const d7Str = d7.toISOString().slice(0, 10);

    // Build city filter if regions selected
    const regionCaseSql = buildRegionSql("pickup_city");
    const regionFilterSql = selectedRegions.length > 0
      ? "AND (" + regionCaseSql + ") IN (" + selectedRegions.map(r => "'" + r.replace(/'/g, "''") + "'").join(",") + ")"
      : "";

    const [hourlyRes, dailyRes] = await Promise.all([
      client.query(
        `WITH deduped AS (
           SELECT DISTINCT ON (COALESCE(NULLIF(order_id,''), id::text))
             create_date, create_hour, total_pay, pickup_city, status
           FROM orders
           WHERE create_date IN ($1::date, $2::date) AND create_hour IS NOT NULL
           ${regionFilterSql}
           ORDER BY COALESCE(NULLIF(order_id,''), id::text)
         )
         SELECT create_date::text, create_hour,
           (${regionCaseSql}) as region,
           COALESCE(SUM(CASE WHEN LOWER(status) LIKE 'complete%' THEN total_pay ELSE 0 END),0)::float as gmv
         FROM deduped
         GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
        [maxDate, d7Str]
      ),
      client.query(
        `WITH daily_agg AS (
           SELECT create_date,
             COUNT(*) FILTER (WHERE LOWER(status) LIKE 'complete%')::int as complete,
             COUNT(*) FILTER (WHERE LOWER(status) LIKE 'process%' OR LOWER(status)='in progress')::int as processing,
             COUNT(*) FILTER (WHERE UPPER(TRIM(cancel_by)) = 'DRIVER')::int as cancel,
             COALESCE(SUM(CASE WHEN LOWER(status) LIKE 'complete%' THEN total_pay ELSE 0 END),0)::float as gmv
           FROM orders
           WHERE create_date >= $1::date - 17
           AND SPLIT_PART(TRIM(CAST(depot AS TEXT)), '.', 1) = '1032'
           ${regionFilterSql}
           GROUP BY create_date
         )
         SELECT d1.create_date::text as date,
           COALESCE(d1.complete,0) as complete,
           COALESCE(d1.processing,0) as processing,
           COALESCE(d1.cancel,0) as cancel,
           COALESCE(d1.gmv,0) as gmv,
           COALESCE(d2.complete,0) as complete_d7,
           COALESCE(d2.processing,0) as processing_d7,
           COALESCE(d2.cancel,0) as cancel_d7,
           COALESCE(d2.gmv,0) as gmv_d7
         FROM daily_agg d1
         LEFT JOIN daily_agg d2 ON d1.create_date = d2.create_date + 7
         WHERE d1.create_date >= $1::date - 10
         ORDER BY d1.create_date`,
        [maxDate]
      ),
    ]);

    const hourlyData: any[] = Array.from({ length: 24 }, (_, h) => ({
      hour: String(h).padStart(2, "0") + "h",
      today: 0,
      d7: 0
    }));

    for (const row of hourlyRes.rows) {
      const h = row.create_hour;
      if (h < 0 || h > 23) continue;
      const gmvMil = row.gmv / 1_000_000;
      const rName = row.region;

      if (row.create_date === maxDate) {
        hourlyData[h].today += gmvMil;
        if (rName) hourlyData[h][rName] = (hourlyData[h][rName] || 0) + gmvMil;
      }
      if (row.create_date === d7Str) {
        hourlyData[h].d7 += gmvMil;
        if (rName) hourlyData[h][rName + "_d7"] = (hourlyData[h][rName + "_d7"] || 0) + gmvMil;
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
      daily: dailyRes.rows.map(r => {
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
