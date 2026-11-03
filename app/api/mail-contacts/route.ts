import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";
import { getSession } from "@/lib/session";

// Danh bạ email người nhận → tên đối tác (khóa là email hoặc "@domain.com").
// GET: danh sách · POST { email, partnerName } · DELETE ?email=

const KEY_RE = /^([A-Za-z0-9._%+-]+)?@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export async function GET() {
  await initDB();
  const client = await db.connect();
  try {
    const res = await client.query(
      `SELECT email, partner_name, updated_at, updated_by FROM mail_partner_contacts ORDER BY partner_name, email`
    );
    return NextResponse.json({
      contacts: res.rows.map((r) => ({
        email: r.email,
        partnerName: r.partner_name,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by,
      })),
    });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDB();
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const partnerName = String(body.partnerName ?? "").trim();
  if (!KEY_RE.test(email)) {
    return NextResponse.json({ error: "Email không hợp lệ (vd. a@b.com hoặc @b.com)" }, { status: 400 });
  }
  if (!partnerName) return NextResponse.json({ error: "Thiếu tên đối tác" }, { status: 400 });
  const client = await db.connect();
  try {
    await client.query(
      `INSERT INTO mail_partner_contacts (email, partner_name, updated_by) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET partner_name = EXCLUDED.partner_name,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [email, partnerName.slice(0, 300), user.username]
    );
    return NextResponse.json({ success: true });
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDB();
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "Thiếu email" }, { status: 400 });
  const client = await db.connect();
  try {
    await client.query(`DELETE FROM mail_partner_contacts WHERE email = $1`, [email.toLowerCase()]);
    return NextResponse.json({ success: true });
  } finally {
    client.release();
  }
}
