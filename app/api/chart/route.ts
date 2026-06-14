import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const client = await db.connect();
  try {
    const maxRes = await client.query(`SELECT MAX(create_date)::text as max_date FROM orders`);
    const maxDate: string | null = maxRes.rows[0]?.max_date ?? null;

    if (!maxDate) {
      return NextResponse.json({ hourly: [], daily: [], todayDate: null, d7Date: null });
    }

    const d7 = new Date(maxDate + "T00:00:00");
    d7.setDate(d7.getDate() - 7);
    const d7Str = d7.toISOString().slice(0, 10);

    const [hourlyRes, dailyRes] = await Promise.all([
      client.query(
        `SELECT create_date::text, create_hour, SUM(total_pay)::float as gmv
         FROM orders
         WHERE create_date IN ($1::date, $2::date) AND create_hour IS NOT NULL
         GROUP BY create_date, create_hour ORDER BY create_date, create_hour`,
        [maxDate, d7Str]
      ),
      client.query(
        `SELECT create_date::text as date,
           COUNT(*) FILTER (WHERE LOWER(status) LIKE 'complete%')::int as complete,
           COUNT(*) FILTER (WHERE LOWER(status) LIKE 'process%' OR LOWER(status)='in progress')::int as processing,
           COUNT(*) FILTER (WHERE LOWER(status) LIKE 'cancel%')::int as cancel
         FROM orders
         WHERE create_date >= $1::date - 10
         GROUP BY create_date ORDER BY create_date`,
        [maxDate]
      ),
    ]);

    const todayGMV = new Array(24).fill(0);
    const d7GMV = new Array(24).fill(0);
    for (const row of hourlyRes.rows) {
      const h = row.create_hour;
      if (h < 0 || h > 23) continue;
      if (row.create_date === maxDate) todayGMV[h] += row.gmv;
      if (row.create_date === d7Str)   d7GMV[h]   += row.gmv;
    }

    return NextResponse.json({
      todayDate: maxDate,
      d7Date: d7Str,
      hourly: Array.from({ length: 24 }, (_, h) => ({
        hour: String(h).padStart(2,"0") + "h",
        today: Math.round(todayGMV[h] / 1_000_000),
        d7:    Math.round(d7GMV[h]    / 1_000_000),
      })),
      daily: dailyRes.rows.map(r => ({
        date:       r.date.slice(5).replace("-", "/"),
        complete:   r.complete,
        processing: r.processing,
        cancel:     r.cancel,
      })),
    });
  } catch (e) {
    console.error("chart error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}
