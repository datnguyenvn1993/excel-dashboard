import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0"));
  const limit = Math.min(500, parseInt(searchParams.get("limit") ?? "100"));
  const offset = page * limit;
  const hourParam = searchParams.get("hour");
  const hour = hourParam !== null && hourParam !== "" ? parseInt(hourParam, 10) : null;
  const client = await db.connect();
  try {
    let effectiveHour = hour;
    if (effectiveHour === null) {
      const metaRes = await client.query("SELECT value FROM metadata WHERE key = 'last_import_at'");
      const importAt = metaRes.rows[0]?.value;
      if (importAt) { const d = new Date(importAt); if (!isNaN(d.getTime())) effectiveHour = ((d.getUTCHours() + 7) % 24) - 1; }
    }
    const hourFilter = effectiveHour !== null ? `AND create_hour <= ${effectiveHour}` : "";

    // Calculate MAX date from both tables
    const maxRes = await client.query(`
      SELECT MAX(d)::date as max_date FROM (
        SELECT MAX(create_date) as d FROM orders
        UNION ALL
        SELECT MAX(create_date) as d FROM orders_summary
      ) sub
    `);
    const maxDate = maxRes.rows[0]?.max_date || '2000-01-01';

    const d10Sql = `create_date >= ($1::date - INTERVAL '10 days')`;

    const [dataRes, countRes] = await Promise.all([
      client.query(
        `SELECT id, order_id, status, depot, total_pay::float, pickup_city,
                create_date::text, create_hour, sap_profile_id, distance
         FROM orders WHERE ${d10Sql} ${hourFilter}
         ORDER BY create_date DESC, id DESC LIMIT $2 OFFSET $3`,
        [maxDate, limit, offset]
      ),
      client.query(`SELECT COUNT(*)::int as total FROM orders WHERE ${d10Sql} ${hourFilter}`, [maxDate]),
    ]);
    return NextResponse.json({
      rows: dataRes.rows,
      total: countRes.rows[0].total,
      page,
      limit,
    });
  } catch (e) {
    console.error("rows GET error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest) {
  const { all, ids } = (await req.json()) as { all?: boolean; ids?: number[] };
  const client = await db.connect();
  try {
    if (all) {
      // Data now lives in the summary tables (raw `orders` is normally empty),
      // so a full reset must clear those too.
      await client.query(
        "TRUNCATE orders, orders_summary, team_hourly_summary, depot_hourly_summary, compression_log"
      );
    } else if (ids && ids.length > 0) {
      await client.query("DELETE FROM orders WHERE id = ANY($1::int[])", [ids]);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("rows DELETE error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}
