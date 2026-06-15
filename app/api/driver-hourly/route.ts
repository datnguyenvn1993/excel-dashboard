import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const client = await db.connect();
  try {
    const dateRes = await client.query(
      `SELECT MAX(create_date::text) as max_date FROM orders`
    );
    const maxDate = dateParam || dateRes.rows[0]?.max_date;
    if (!maxDate) return NextResponse.json({ hourly: [], byTeam: {}, d7Date: null });

    // D-7 date
    const d7Obj = new Date(maxDate + "T12:00:00Z");
    d7Obj.setUTCDate(d7Obj.getUTCDate() - 7);
    const d7DateStr = d7Obj.toISOString().slice(0, 10);

    const [todayRes, d7HourRes, byTeamRes] = await Promise.all([
      client.query(`
        SELECT create_hour::text as hour,
               COUNT(DISTINCT TRIM(COALESCE(sap_profile_id,''))) as cnt
        FROM orders
        WHERE create_date::text = $1
          AND TRIM(COALESCE(sap_profile_id,'')) != ''
        GROUP BY create_hour ORDER BY create_hour::int
      `, [maxDate]),
      client.query(`
        SELECT create_hour::text as hour,
               COUNT(DISTINCT TRIM(COALESCE(sap_profile_id,''))) as cnt
        FROM orders
        WHERE create_date::text = $1
          AND TRIM(COALESCE(sap_profile_id,'')) != ''
        GROUP BY create_hour ORDER BY create_hour::int
      `, [d7DateStr]),
      client.query(`
        SELECT d.doi,
               o.create_hour::text as hour,
               COUNT(DISTINCT TRIM(COALESCE(o.sap_profile_id,''))) as cnt
        FROM orders o
        JOIN drivers d ON NULLIF(TRIM(o.sap_profile_id),'') = d.sap_id
        WHERE o.create_date::text = $1
          AND TRIM(COALESCE(o.sap_profile_id,'')) != ''
        GROUP BY d.doi, o.create_hour ORDER BY d.doi, o.create_hour::int
      `, [maxDate]),
    ]);

    const todayMap: Record<string, number> = {};
    todayRes.rows.forEach((r: { hour: string; cnt: string }) => { todayMap[r.hour] = Number(r.cnt); });
    const d7Map: Record<string, number> = {};
    d7HourRes.rows.forEach((r: { hour: string; cnt: string }) => { d7Map[r.hour] = Number(r.cnt); });

    const hourly = Array.from({ length: 24 }, (_, i) => ({
      hour: String(i),
      today: todayMap[String(i)] || 0,
      d7: d7Map[String(i)] || 0,
    }));

    const byTeam: Record<string, { hour: string; count: number }[]> = {};
    const teamSet = new Set<string>();
    byTeamRes.rows.forEach((r: { doi: string; hour: string; cnt: string }) => {
      if (!r.doi) return;
      teamSet.add(r.doi);
      if (!byTeam[r.doi]) byTeam[r.doi] = [];
      byTeam[r.doi].push({ hour: r.hour, count: Number(r.cnt) });
    });

    return NextResponse.json({ hourly, byTeam, teams: [...teamSet].sort(), maxDate, d7Date: d7DateStr });
  } catch (e) {
    console.error("driver-hourly error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}
