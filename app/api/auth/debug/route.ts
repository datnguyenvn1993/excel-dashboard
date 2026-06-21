import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";

export async function GET(req: NextRequest) {
    await initDB();
    const client = await db.connect();
    try {
        const r = await client.query("SELECT create_date, create_hour, count(*) as count FROM orders WHERE create_date >= current_date - interval '14 days' GROUP BY 1,2 ORDER BY 1 DESC, 2 ASC;");
        return NextResponse.json({ data: r.rows });
    } finally {
        client.release();
    }
}
