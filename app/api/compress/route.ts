import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";
import { compressDate } from "@/lib/compress";

export async function GET() {
    await initDB();
    const client = await db.connect();
    try {
        // Get all dates from orders (raw) and compression_log
        const res = await client.query(`
      WITH raw_dates AS (
        SELECT create_date, COUNT(*)::int as raw_rows
        FROM orders
        GROUP BY create_date
      ),
      log AS (
        SELECT create_date, status, compressed_at, raw_row_count, summary_rows
        FROM compression_log
      )
      SELECT
        COALESCE(r.create_date, l.create_date) as create_date,
        COALESCE(r.raw_rows, 0) as raw_rows,
        l.status,
        l.compressed_at,
        l.raw_row_count,
        l.summary_rows
      FROM raw_dates r
      FULL OUTER JOIN log l ON r.create_date = l.create_date
      ORDER BY COALESCE(r.create_date, l.create_date) DESC
    `);

        const dates = res.rows.map((r: any) => {
            const hasRaw = r.raw_rows > 0;
            const hasCompressed = r.status === "compressed";
            let displayStatus: string;
            if (hasCompressed && hasRaw) {
                displayStatus = "recompress"; // có cả summary cũ và raw mới
            } else if (hasCompressed && !hasRaw) {
                displayStatus = "compressed";
            } else {
                displayStatus = "raw";
            }
            return {
                date: r.create_date,
                raw_rows: r.raw_rows,
                status: displayStatus,
                compressed_at: r.compressed_at,
                prev_raw_count: r.raw_row_count,
                summary_rows: r.summary_rows,
            };
        });

        return NextResponse.json({ dates });
    } catch (e) {
        console.error("compress GET error:", e);
        return NextResponse.json({ error: String(e) }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function POST(req: NextRequest) {
    await initDB();
    const body = await req.json();
    const { date, dates: batchDates } = body as { date?: string; dates?: string[] };

    const client = await db.connect();
    try {
        const targetDates = batchDates ?? (date ? [date] : []);
        if (targetDates.length === 0) {
            return NextResponse.json({ error: "No date specified" }, { status: 400 });
        }

        const results: { date: string; rawDeleted: number; summaryInserted: number }[] = [];

        for (const d of targetDates) {
            try {
                const r = await compressDate(client, d);
                results.push({ date: d, ...r });
            } catch (err: any) {
                results.push({ date: d, rawDeleted: 0, summaryInserted: 0 });
            }
        }

        return NextResponse.json({ ok: true, results });
    } catch (e) {
        console.error("compress POST error:", e);
        return NextResponse.json({ error: String(e) }, { status: 500 });
    } finally {
        client.release();
    }
}
