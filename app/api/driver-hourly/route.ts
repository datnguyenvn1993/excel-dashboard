import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const client = await db.connect();
  try {
    // Get max date
    const dateRes = await client.query(
      `SELECT MAX(create_date::text) as max_date FROM orders`
    );
    const maxDate = dateParam || dateRes.rows[0]?.max_date;
    if (!maxDate) return NextResponse.json({ hourly: [], byTeam: {} });

    // D-7 date
    const d7Res = await client.query(
      `SELECT ($1::date - INTERVAL '7 days')::text as d7`, [maxDate]
    );
    const d7Date = d7Res.rows[0]?.d7;

    // Today hourly driver active
    const todayRes = await client.query(`
      SELECT create_hour::text as hour,
             COUNT(DISTINCT TRIM(COALESCE(sap_profile_id,''))) as cnt
      FROM orders
      WHERE create_date::text = $1
        AND TRIM(COALESCE(sap_profile_id,'')) != ''
      GROUP BY create_hour
      ORDER BY create_hour::int
    `, [maxDate]);

    // D-7 hourly driver active
    const d7HourRes = await client.query(`
      SELECT create_hour::text as hour,
             COUNT(DISTINCT TRIM(COALESCE(sap_profile_id,''))) as cnt
      FROM orders
      WHERE create_date::text = $1
        AND TRIM(COALESCE(sap_profile_id,'')) != ''
      GROUP BY create_hour
      ORDER BY create_hour::int
    `, [d7Date || '1970-01-01']);

    // Per-team hourly (today only)
    const teamRes = await client.query(`
      SELECT d.doi,
             o.create_hour::text as hour,
             COUNT(DISTINCT TRIM(o.sap_profile_id)) as cnt
      FROM orders o
      JOIN drivers d ON NULLIF(TRIM(o.sap_profile_id),'') = d.sap_id
      WHERE o.create_date::text = $1
      GROUP BY d.doi, o.create_hour
      ORDER BY d.doi, o.create_hour::int
    `, [maxDate]);

    // Build hourly array 0-23
    const todayMap: Record<string, number> = {};
    todayRes.rows.forEach(r => { todayMap[r.hour] = Number(r.cnt); });
    const d7Map: Record<string, number> = {};
    d7HourRes.rows.forEach(r => { d7Map[r.hour] = Number(r.cnt); });

    const hourly = Array.from({ length: 24 }, (_, i) => ({
      hour: String(i),
      today: todayMap[String(i)] || 0,
      d7: d7Map[String(i)] || 0,
    }));

    // Build per-team data
    const byTeam: Record<string, {hour:string;count:number}[]> = {};
    teamRes.rows.forEach(r => {
      if (!byTeam[r.doi]) byTeam[r.doi] = [];
      byTeam[r.doi].push({ hour: r.hour, count: Number(r.cnt) });
    });

    return NextResponse.json({ hourly, byTeam, maxDate, d7Date });
  } finally {
    client.release();
  }
}
