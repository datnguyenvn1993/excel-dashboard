import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";

export async function GET(req: NextRequest) {
    await initDB();
    const client = await db.connect();
    try {
        const r = await client.query("SELECT DISTINCT depot FROM orders LIMIT 20");
        return NextResponse.json({ depots: r.rows });
    } finally {
        client.release();
    }
}
