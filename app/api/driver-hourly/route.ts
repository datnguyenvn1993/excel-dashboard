import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isDateCompressed } from "@/lib/compress";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const client = await db.connect();
  try {
    const dateRes = await client.query(`
      SELECT MAX(d)::text as max_date FROM (
        SELECT MAX(create_date) as d FROM orders
        UNION ALL
        SELECT MAX(create_date) as d FROM orders_summary
      ) sub
    `);
    const maxDate = dateParam || dateRes.rows[0]?.max_date;
    if (!maxDate) return NextResponse.json({ hourly: [], byTeam: {}, d7Date: null });

    // D-7 date
    const d7Obj = new Date(maxDate + "T12:00:00Z");
    d7Obj.setUTCDate(d7Obj.getUTCDate() - 7);
    const d7DateStr = d7Obj.toISOString().slice(0, 10);

    const todayCompressed = await isDateCompressed(client, maxDate);
    const d7Compressed = await isDateCompressed(client, d7DateStr);

    const buildNatRaw = () => `
      SELECT create_hour::text as hour,
             COUNT(DISTINCT TRIM(COALESCE(sap_profile_id,'')))::int as cnt
      FROM orders
      WHERE create_date::text = $1
        AND TRIM(COALESCE(sap_profile_id,'')) != ''
        AND SPLIT_PART(TRIM(CAST(depot AS TEXT)), '.', 1) = '1032'
      GROUP BY create_hour ORDER BY create_hour::int
    `;
    const buildNatSummary = () => `
      SELECT create_hour::text as hour,
             SUM(driver_active)::int as cnt
      FROM orders_summary
      WHERE create_date::text = $1 AND depot = '1032'
      GROUP BY create_hour ORDER BY create_hour::int
    `;

    const buildTeamRaw = () => `
      SELECT d.doi,
             o.create_hour::text as hour,
             COUNT(DISTINCT TRIM(COALESCE(o.sap_profile_id,'')))::int as cnt
      FROM orders o
      JOIN drivers d ON NULLIF(TRIM(o.sap_profile_id),'') = d.sap_id
      WHERE o.create_date::text = $1
        AND TRIM(COALESCE(o.sap_profile_id,'')) != ''
        AND SPLIT_PART(TRIM(CAST(o.depot AS TEXT)), '.', 1) = '1032'
      GROUP BY d.doi, o.create_hour ORDER BY d.doi, o.create_hour::int
    `;
    const buildTeamSummary = () => `
      SELECT doi,
             create_hour::text as hour,
             SUM(driver_active)::int as cnt
      FROM orders_summary
      WHERE create_date::text = $1 AND depot = '1032' AND doi != ''
      GROUP BY doi, create_hour ORDER BY doi, create_hour::int
    `;

    const [todayRes, d7HourRes, byTeamRes, byTeamD7Res] = await Promise.all([
      client.query(todayCompressed ? buildNatSummary() : buildNatRaw(), [maxDate]),
      client.query(d7Compressed ? buildNatSummary() : buildNatRaw(), [d7DateStr]),
      client.query(todayCompressed ? buildTeamSummary() : buildTeamRaw(), [maxDate]),
      client.query(d7Compressed ? buildTeamSummary() : buildTeamRaw(), [d7DateStr]),
    ]);

    const todayMap: Record<string, number> = {};
    todayRes.rows.forEach((r: { hour: string; cnt: string | number }) => { todayMap[r.hour] = Number(r.cnt); });
    const d7Map: Record<string, number> = {};
    d7HourRes.rows.forEach((r: { hour: string; cnt: string | number }) => { d7Map[r.hour] = Number(r.cnt); });

    const hourly = Array.from({ length: 24 }, (_, i) => ({
      hour: String(i),
      today: todayMap[String(i)] || 0,
      d7: d7Map[String(i)] || 0,
    }));

    const byTeam: Record<string, { hour: string; count: number }[]> = {};
    const byTeamD7: Record<string, { hour: string; count: number }[]> = {};
    const teamSet = new Set<string>();

    byTeamRes.rows.forEach((r: { doi: string; hour: string; cnt: string | number }) => {
      if (!r.doi) return;
      teamSet.add(r.doi);
      if (!byTeam[r.doi]) byTeam[r.doi] = [];
      byTeam[r.doi].push({ hour: r.hour, count: Number(r.cnt) });
    });

    byTeamD7Res.rows.forEach((r: { doi: string; hour: string; cnt: string | number }) => {
      if (!r.doi) return;
      teamSet.add(r.doi);
      if (!byTeamD7[r.doi]) byTeamD7[r.doi] = [];
      byTeamD7[r.doi].push({ hour: r.hour, count: Number(r.cnt) });
    });

    return NextResponse.json({ hourly, byTeam, byTeamD7, teams: [...teamSet].sort(), maxDate, d7Date: d7DateStr });
  } catch (e) {
    console.error("driver-hourly error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}

