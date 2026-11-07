import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";
import { getSession, canManage } from "@/lib/session";
import { Workflow, canEditWorkflow, sanitizeData } from "@/lib/workflows";

// GET: danh sách quy trình (mọi người xem). POST: tạo/cập nhật (manager/admin). DELETE ?id=.

function rowToWf(r: Record<string, unknown>): Workflow {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? "",
    data: sanitizeData(r.data),
    editors: Array.isArray(r.editors) ? (r.editors as string[]) : [],
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
    updatedBy: (r.updated_by as string) ?? null,
  };
}

export async function GET() {
  await initDB();
  const client = await db.connect();
  try {
    const res = await client.query(`SELECT * FROM workflows ORDER BY name`);
    return NextResponse.json({ workflows: res.rows.map(rowToWf) });
  } catch (e) {
    console.error("workflows GET error:", e);
    return NextResponse.json({ error: "Không đọc được quy trình" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDB();
  let body: { id?: string; name?: string; description?: string; data?: unknown; editors?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Thiếu tên quy trình" }, { status: 400 });
  const data = sanitizeData(body.data);
  const editors = Array.isArray(body.editors)
    ? Array.from(new Set(body.editors.map((e) => String(e).trim().toLowerCase()).filter(Boolean))).slice(0, 100)
    : [];

  const client = await db.connect();
  try {
    // Quy trình đã tồn tại: cần quyền sửa (Manager/Admin hoặc đã có trong editors).
    // Tạo mới: chỉ Manager/Admin.
    const existingId = body.id ? String(body.id) : "";
    if (existingId) {
      const cur = await client.query(`SELECT editors FROM workflows WHERE id = $1`, [existingId]);
      if (cur.rows.length === 0) return NextResponse.json({ error: "Không tìm thấy quy trình" }, { status: 404 });
      const curEditors = Array.isArray(cur.rows[0].editors) ? (cur.rows[0].editors as string[]) : [];
      if (!canEditWorkflow(user.role, user.username, curEditors)) {
        return NextResponse.json({ error: "Bạn không có quyền sửa quy trình này" }, { status: 403 });
      }
    } else if (!canManage(user.role)) {
      return NextResponse.json({ error: "Chỉ Manager/Admin được tạo quy trình mới" }, { status: 403 });
    }
    const id = existingId || `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    await client.query(
      `INSERT INTO workflows (id, name, description, data, editors, updated_by)
       VALUES ($1, $2, $3, $4::jsonb, $5::text[], $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description,
         data = EXCLUDED.data, editors = EXCLUDED.editors,
         updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [id, name.slice(0, 200), String(body.description ?? "").slice(0, 1000), JSON.stringify(data), editors, user.username]
    );
    return NextResponse.json({ success: true, id });
  } catch (e) {
    console.error("workflows POST error:", e);
    return NextResponse.json({ error: "Lưu quy trình thất bại" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getSession(req);
  if (!user || !canManage(user.role)) {
    return NextResponse.json({ error: "Chỉ Manager/Admin được xóa quy trình" }, { status: 403 });
  }
  await initDB();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
  const client = await db.connect();
  try {
    await client.query(`DELETE FROM workflows WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } finally {
    client.release();
  }
}
