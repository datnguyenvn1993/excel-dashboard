import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

// Danh mục partner_id → tên hãng / miền do người dùng nhập.
// GET: { entries: [{partnerId, name, mien, updatedAt, updatedBy}], dataIds: string[] }
// POST: { entries: [{partnerId, name, mien}] } → upsert (trùng partner_id thì ghi đè)
// DELETE: ?id=<partnerId> → xóa bản ghi nhập tay (quay về danh sách mặc định)

const MAX_ENTRIES = 2000;

async function username(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("session")?.value;
  const p = token ? await verifyToken(token) : null;
  return p?.username ?? null;
}

export async function GET() {
  await initDB();
  const client = await db.connect();
  try {
    const [dir, ids] = await Promise.all([
      client.query(
        `SELECT partner_id, name, mien, updated_at, updated_by FROM partner_directory ORDER BY partner_id`
      ),
      client.query(`SELECT DISTINCT partner_id FROM kpi_partner_monthly`),
    ]);
    return NextResponse.json({
      entries: dir.rows.map((r) => ({
        partnerId: r.partner_id,
        name: r.name,
        mien: r.mien,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by,
      })),
      dataIds: ids.rows.map((r) => r.partner_id as string),
    });
  } catch (e) {
    console.error("partner-directory GET error:", e);
    return NextResponse.json({ error: "Không đọc được danh mục" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  await initDB();
  let body: { entries?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ error: "Thiếu entries" }, { status: 400 });
  }
  if (body.entries.length > MAX_ENTRIES) {
    return NextResponse.json({ error: `Tối đa ${MAX_ENTRIES} dòng mỗi lần` }, { status: 413 });
  }
  const byId = new Map<string, { name: string; mien: string }>();
  for (const e of body.entries as Record<string, unknown>[]) {
    const id = String(e?.partnerId ?? "").trim();
    if (!id) continue;
    byId.set(id, {
      name: String(e?.name ?? "").trim(),
      mien: String(e?.mien ?? "").trim(),
    });
  }
  if (byId.size === 0) {
    return NextResponse.json({ error: "Không có partner_id hợp lệ" }, { status: 400 });
  }
  const ids = Array.from(byId.keys());
  const who = await username(req);
  const client = await db.connect();
  try {
    await client.query(
      `INSERT INTO partner_directory (partner_id, name, mien, updated_by)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
       ON CONFLICT (partner_id)
       DO UPDATE SET name = EXCLUDED.name, mien = EXCLUDED.mien,
                     updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [
        ids,
        ids.map((id) => byId.get(id)!.name),
        ids.map((id) => byId.get(id)!.mien),
        ids.map(() => who),
      ]
    );
    return NextResponse.json({ success: true, saved: ids.length });
  } catch (e) {
    console.error("partner-directory POST error:", e);
    return NextResponse.json({ error: "Lưu danh mục thất bại" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest) {
  await initDB();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
  const client = await db.connect();
  try {
    await client.query(`DELETE FROM partner_directory WHERE partner_id = $1`, [id]);
    return NextResponse.json({ success: true });
  } finally {
    client.release();
  }
}
