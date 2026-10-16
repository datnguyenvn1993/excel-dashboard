import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";

// Lưu / đọc dữ liệu KPI theo partner trên server (Postgres).
// Row dạng gọn: [partnerId, month "MM/YYYY", metric, value].
type CompactRow = [string, string, string, number];

const META_KEY = "kpi_last_import";
const MAX_ROWS_PER_REQUEST = 10000;

export async function GET(req: NextRequest) {
  await initDB();
  // ?partner=<id> → chỉ trả dữ liệu của một hãng (trang chi tiết).
  const partner = req.nextUrl.searchParams.get("partner");
  const client = await db.connect();
  try {
    const [data, meta] = await Promise.all([
      partner
        ? client.query(
            `SELECT partner_id, month, metric, value FROM kpi_partner_monthly WHERE partner_id = $1`,
            [partner]
          )
        : client.query(`SELECT partner_id, month, metric, value FROM kpi_partner_monthly`),
      client.query(`SELECT value FROM metadata WHERE key = $1`, [META_KEY]),
    ]);
    const rows: CompactRow[] = data.rows.map((r) => [
      r.partner_id,
      r.month,
      r.metric,
      Number(r.value),
    ]);
    let info: { fileName?: string; uploadedAt?: string } = {};
    try {
      if (meta.rows[0]?.value) info = JSON.parse(meta.rows[0].value);
    } catch {}
    return NextResponse.json({
      rows,
      fileName: info.fileName ?? "",
      uploadedAt: info.uploadedAt ?? "",
    });
  } catch (e) {
    console.error("kpi-data GET error:", e);
    return NextResponse.json({ error: "Không đọc được dữ liệu" }, { status: 500 });
  } finally {
    client.release();
  }
}

// Upsert một lô rows. Trùng (partner_id, month, metric) → ghi đè giá trị.
export async function POST(req: NextRequest) {
  await initDB();
  let body: { rows?: unknown; fileName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }
  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "Thiếu rows" }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Tối đa ${MAX_ROWS_PER_REQUEST} dòng mỗi lần gửi` },
      { status: 413 }
    );
  }

  // Lọc dòng hợp lệ + khử trùng trong lô (dòng sau thắng) — Postgres không cho
  // ON CONFLICT cập nhật cùng một khóa hai lần trong một câu lệnh.
  const dedup = new Map<string, CompactRow>();
  for (const r of body.rows as unknown[]) {
    if (!Array.isArray(r) || r.length < 4) continue;
    const [p, m, k, v] = r;
    const value = typeof v === "number" ? v : Number(v);
    if (!p || !m || !k || !Number.isFinite(value)) continue;
    const row: CompactRow = [String(p), String(m), String(k), value];
    dedup.set(`${row[0]}\u0001${row[1]}\u0001${row[2]}`, row);
  }
  const rows = Array.from(dedup.values());

  const client = await db.connect();
  try {
    let inserted = 0;
    let updated = 0;
    if (rows.length > 0) {
      const res = await client.query(
        `INSERT INTO kpi_partner_monthly (partner_id, month, metric, value)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::float8[])
         ON CONFLICT (partner_id, month, metric)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [
          rows.map((r) => r[0]),
          rows.map((r) => r[1]),
          rows.map((r) => r[2]),
          rows.map((r) => r[3]),
        ]
      );
      for (const r of res.rows) {
        if (r.inserted) inserted++;
        else updated++;
      }
    }

    if (body.fileName) {
      await client.query(
        `INSERT INTO metadata (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [
          META_KEY,
          JSON.stringify({ fileName: body.fileName, uploadedAt: new Date().toISOString() }),
        ]
      );
    }

    return NextResponse.json({ success: true, inserted, updated });
  } catch (e) {
    console.error("kpi-data POST error:", e);
    return NextResponse.json({ error: "Lưu dữ liệu thất bại" }, { status: 500 });
  } finally {
    client.release();
  }
}
