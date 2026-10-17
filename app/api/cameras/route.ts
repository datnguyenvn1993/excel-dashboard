import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { DEFAULT_CAMERAS } from "@/lib/cameras";

// GET: danh sách camera (mọi người dùng đã đăng nhập).
// POST { camId, name, oldCamId? }: thêm / sửa (đổi cả ID nếu có oldCamId) — chỉ admin.
// DELETE ?id=<camId>: xóa — chỉ admin.

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  const p = token ? await verifyToken(token) : null;
  return p && p.role === "admin" ? p : null;
}

const FORBIDDEN = () =>
  NextResponse.json({ error: "Chỉ admin được sửa danh sách camera" }, { status: 403 });

export async function GET() {
  await initDB();
  const client = await db.connect();
  try {
    let res = await client.query(
      `SELECT cam_id, name, sort_order FROM traffic_cameras ORDER BY sort_order, name`
    );
    // Lần đầu: nạp danh sách mặc định.
    if (res.rows.length === 0) {
      await client.query(
        `INSERT INTO traffic_cameras (cam_id, name, sort_order)
         SELECT * FROM unnest($1::text[], $2::text[], $3::int[])
         ON CONFLICT (cam_id) DO NOTHING`,
        [
          DEFAULT_CAMERAS.map((c) => c.camId),
          DEFAULT_CAMERAS.map((c) => c.name),
          DEFAULT_CAMERAS.map((_, i) => i),
        ]
      );
      res = await client.query(
        `SELECT cam_id, name, sort_order FROM traffic_cameras ORDER BY sort_order, name`
      );
    }
    return NextResponse.json({
      cameras: res.rows.map((r) => ({ camId: r.cam_id, name: r.name, sortOrder: r.sort_order })),
    });
  } catch (e) {
    console.error("cameras GET error:", e);
    return NextResponse.json({ error: "Không đọc được danh sách camera" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return FORBIDDEN();
  await initDB();
  let body: { camId?: string; name?: string; oldCamId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }
  const camId = String(body.camId ?? "").trim();
  const name = String(body.name ?? "").trim();
  const oldCamId = String(body.oldCamId ?? "").trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(camId)) {
    return NextResponse.json({ error: "ID camera không hợp lệ" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Thiếu tên camera" }, { status: 400 });

  const client = await db.connect();
  try {
    if (oldCamId && oldCamId !== camId) {
      const dup = await client.query(`SELECT 1 FROM traffic_cameras WHERE cam_id = $1`, [camId]);
      if (dup.rows.length) {
        return NextResponse.json({ error: "ID này trùng với camera khác" }, { status: 409 });
      }
      await client.query(
        `UPDATE traffic_cameras SET cam_id = $1, name = $2, updated_at = NOW(), updated_by = $3
         WHERE cam_id = $4`,
        [camId, name, admin.username, oldCamId]
      );
    } else {
      await client.query(
        `INSERT INTO traffic_cameras (cam_id, name, sort_order, updated_by)
         VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM traffic_cameras), $3)
         ON CONFLICT (cam_id)
         DO UPDATE SET name = EXCLUDED.name, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        [camId, name, admin.username]
      );
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("cameras POST error:", e);
    return NextResponse.json({ error: "Lưu camera thất bại" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) return FORBIDDEN();
  await initDB();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
  const client = await db.connect();
  try {
    await client.query(`DELETE FROM traffic_cameras WHERE cam_id = $1`, [id]);
    return NextResponse.json({ success: true });
  } finally {
    client.release();
  }
}
