import { NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";

// Danh sách người dùng cho dropdown PIC (chỉ tên, không có thông tin nhạy cảm).
export async function GET() {
  await initDB();
  const client = await db.connect();
  try {
    const res = await client.query(`SELECT username, display_name FROM users ORDER BY username`);
    return NextResponse.json({
      users: res.rows.map((r) => ({ username: r.username, displayName: r.display_name ?? "" })),
    });
  } finally {
    client.release();
  }
}
