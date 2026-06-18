import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const D10 = `create_date >= (SELECT COALESCE(MAX(create_date)-INTERVAL '10 days','2000-01-01'::date) FROM orders)`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0"));
  const limit = Math.min(500, parseInt(searchParams.get("limit") ?? "100"));
  const offset = page * limit;
  const hourParam = searchParams.get("hour");
  const hour = hourParam !== null && hourParam !== "" ? parseInt(hourParam, 10) : null;
  const hourFilter = hour !== null ? `AND create_hour <= ${hour}` : "";

  const client = await db.connect();
  try {
    const [dataRes, countRes] = await Promise.all([
      client.query(
        `SELECT id, order_id, status, depot, total_pay::float, pickup_city,
                create_date::text, create_hour, sap_profile_id, distance
         FROM orders WHERE ${D10} ${hourFilter}
         ORDER BY create_date DESC, id DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      client.query(`SELECT COUNT(*)::int as total FROM orders WHERE ${D10} ${hourFilter}`),
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
      await client.query("TRUNCATE orders");
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
