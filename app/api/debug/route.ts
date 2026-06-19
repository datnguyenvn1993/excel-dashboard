import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";

export async function GET(req: NextRequest) {
    await initDB();
    const client = await db.connect();
    try {
        await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_by TEXT;");
        return NextResponse.json({ ok: true });
    } finally {
        client.release();
    }
}
