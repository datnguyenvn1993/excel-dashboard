import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireAdmin(req: NextRequest) {
    const session = req.cookies.get("session")?.value;
    if (!session) return null;
    const payload = await verifyToken(session);
    if (!payload || payload.role !== "admin") return null;
    return payload;
}

export async function GET(req: NextRequest) {
    const admin = await requireAdmin(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const client = await db.connect();
    try {
        const sizeRes = await client.query("SELECT pg_size_pretty(pg_database_size(current_database())) as size, pg_database_size(current_database()) as raw_size");
        const tablesRes = await client.query(`
            SELECT relname as table_name,
                   pg_size_pretty(pg_total_relation_size(relid)) as total_size,
                   pg_total_relation_size(relid) as raw_size,
                   n_live_tup as row_count
            FROM pg_stat_user_tables
            ORDER BY pg_total_relation_size(relid) DESC
        `);

        return NextResponse.json({
            database: {
                pretty: sizeRes.rows[0].size,
                raw: parseInt(sizeRes.rows[0].raw_size),
                limit: 256 * 1024 * 1024 // 256MB Hobby Tier
            },
            tables: tablesRes.rows.map(r => ({
                name: r.table_name,
                prettySize: r.total_size,
                rawSize: parseInt(r.raw_size),
                rows: parseInt(r.row_count)
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    } finally {
        client.release();
    }
}
