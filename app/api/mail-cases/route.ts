import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { EDITABLE_FIELDS, EditableField, MailCase } from "@/lib/mailCases";

// GET: toàn bộ sự vụ mail.
// POST { cases: ParsedMail[] }: import — trùng thread_id thì cập nhật phần lấy từ mail
//   (subject, mã đơn, nội dung, người nhận) và GIỮ NGUYÊN các cột người dùng đã nhập.
// PATCH { threadId, field, value }: sửa một ô.
// DELETE ?id=: xóa sự vụ (admin).

const MAX_CASES = 50;

function rowToCase(r: Record<string, unknown>): MailCase {
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    threadId: r.thread_id as string,
    subject: r.subject as string,
    orderCodes: (r.order_codes as string[]) ?? [],
    partnerEmail: r.partner_email as string,
    partnerName: (r.partner_name as string) ?? null,
    messages: (r.messages as MailCase["messages"]) ?? [],
    createdAt: iso(r.created_at),
    category: (r.category as string) ?? null,
    status: r.status as string,
    complainant: (r.complainant as string) ?? null,
    partnerVerify: (r.partner_verify as string) ?? null,
    completedAt: iso(r.completed_at),
    result: (r.result as string) ?? null,
    note: (r.note as string) ?? null,
    sfCase: (r.sf_case as string) ?? null,
    pic: (r.pic as string) ?? null,
    fileName: (r.file_name as string) ?? null,
    importedAt: iso(r.imported_at),
    updatedAt: iso(r.updated_at),
    updatedBy: (r.updated_by as string) ?? null,
  };
}

export async function GET() {
  await initDB();
  const client = await db.connect();
  try {
    const res = await client.query(
      `SELECT * FROM mail_cases ORDER BY created_at DESC NULLS LAST, imported_at DESC`
    );
    return NextResponse.json({ cases: res.rows.map(rowToCase) });
  } catch (e) {
    console.error("mail-cases GET error:", e);
    return NextResponse.json({ error: "Không đọc được danh sách mail" }, { status: 500 });
  } finally {
    client.release();
  }
}

interface IncomingCase {
  threadId?: string;
  subject?: string;
  orderCodes?: string[];
  partnerEmail?: string;
  createdAt?: string | null;
  messages?: unknown[];
  fileName?: string;
}

export async function POST(req: NextRequest) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDB();
  let body: { cases?: IncomingCase[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }
  const cases = (body.cases ?? []).filter((c) => c && typeof c.threadId === "string" && c.threadId);
  if (cases.length === 0) return NextResponse.json({ error: "Không có mail hợp lệ" }, { status: 400 });
  if (cases.length > MAX_CASES) {
    return NextResponse.json({ error: `Tối đa ${MAX_CASES} mail mỗi lần` }, { status: 413 });
  }

  const client = await db.connect();
  let inserted = 0;
  let updated = 0;
  try {
    for (const c of cases) {
      const created = c.createdAt && !Number.isNaN(Date.parse(c.createdAt)) ? c.createdAt : null;
      const res = await client.query(
        `INSERT INTO mail_cases
           (thread_id, subject, order_codes, partner_email, messages, created_at, file_name, updated_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
         ON CONFLICT (thread_id) DO UPDATE SET
           -- Bản import mới hơn (nhiều mail hơn hoặc bằng) thì thay tiêu đề/nội dung; bản cũ hơn thì giữ.
           subject = CASE WHEN jsonb_array_length(EXCLUDED.messages) >= jsonb_array_length(mail_cases.messages)
                          THEN EXCLUDED.subject ELSE mail_cases.subject END,
           order_codes = (SELECT ARRAY(SELECT DISTINCT unnest(mail_cases.order_codes || EXCLUDED.order_codes))),
           partner_email = CASE WHEN EXCLUDED.partner_email <> '' THEN EXCLUDED.partner_email ELSE mail_cases.partner_email END,
           messages = CASE WHEN jsonb_array_length(EXCLUDED.messages) >= jsonb_array_length(mail_cases.messages)
                           THEN EXCLUDED.messages ELSE mail_cases.messages END,
           created_at = COALESCE(LEAST(mail_cases.created_at, EXCLUDED.created_at), mail_cases.created_at, EXCLUDED.created_at),
           file_name = CASE WHEN jsonb_array_length(EXCLUDED.messages) >= jsonb_array_length(mail_cases.messages)
                            THEN EXCLUDED.file_name ELSE mail_cases.file_name END,
           imported_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [
          c.threadId!.slice(0, 200),
          String(c.subject ?? "").slice(0, 1000),
          (c.orderCodes ?? []).map(String).slice(0, 50),
          String(c.partnerEmail ?? "").toLowerCase().slice(0, 320),
          JSON.stringify((c.messages ?? []).slice(0, 50)),
          created,
          String(c.fileName ?? "").slice(0, 300),
          user.username,
        ]
      );
      if (res.rows[0]?.inserted) inserted++;
      else updated++;
    }
    return NextResponse.json({ success: true, inserted, updated });
  } catch (e) {
    console.error("mail-cases POST error:", e);
    return NextResponse.json({ error: "Lưu mail thất bại" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDB();
  let body: { threadId?: string; field?: string; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }
  const field = body.field as EditableField;
  const col = EDITABLE_FIELDS[field];
  if (!body.threadId || !col) return NextResponse.json({ error: "Trường không hợp lệ" }, { status: 400 });

  let value: string | null = body.value === null || body.value === undefined ? null : String(body.value).trim();
  if (value === "") value = null;
  if ((field === "completedAt" || field === "createdAt") && value && Number.isNaN(Date.parse(value))) {
    return NextResponse.json({ error: "Ngày giờ không hợp lệ" }, { status: 400 });
  }
  if (field === "status" && !value) value = "Chưa xử lý";
  if (value && value.length > 5000) value = value.slice(0, 5000);

  const client = await db.connect();
  try {
    const res = await client.query(
      `UPDATE mail_cases SET ${col} = $1, updated_at = NOW(), updated_by = $2 WHERE thread_id = $3`,
      [value, user.username, body.threadId]
    );
    if (res.rowCount === 0) return NextResponse.json({ error: "Không tìm thấy sự vụ" }, { status: 404 });
    return NextResponse.json({ success: true });
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getSession(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Chỉ admin được xóa sự vụ" }, { status: 403 });
  }
  await initDB();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
  const client = await db.connect();
  try {
    await client.query(`DELETE FROM mail_cases WHERE thread_id = $1`, [id]);
    return NextResponse.json({ success: true });
  } finally {
    client.release();
  }
}
