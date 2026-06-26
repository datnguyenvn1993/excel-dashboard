import { NextRequest, NextResponse } from "next/server";
import { initDB, db } from "@/lib/db";

// Receives PRE-AGGREGATED summaries from the client (already grouped the same way
// lib/compress.ts:compressDate would), writes them into the summary tables, and marks
// each date "compressed" so the existing dual-read APIs serve them. Raw orders are
// never uploaded -> minimal Vercel Fast Origin Transfer.

interface OrdersSummaryRow {
  create_date: string; create_hour: number; depot: string; region: string; doi: string;
  order_count: number; complete_count: number; cancel_count: number; processing_count: number;
  gmv: number; driver_active: number;
}
interface HourlyRow {
  create_date: string; create_hour: number; key: string;
  gmv: number; driver_active: number; trip_complete: number;
}

// Generic chunked multi-row INSERT. cols = number of columns per row.
async function bulkInsert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  sqlPrefix: string,
  rows: unknown[][],
  cols: number
) {
  if (rows.length === 0) return;
  const maxRowsPerQuery = Math.max(1, Math.floor(60000 / cols));
  for (let i = 0; i < rows.length; i += maxRowsPerQuery) {
    const batch = rows.slice(i, i + maxRowsPerQuery);
    const values: unknown[] = [];
    const placeholders = batch
      .map((row, j) => {
        const base = j * cols;
        for (const v of row) values.push(v);
        return "(" + Array.from({ length: cols }, (_, k) => `$${base + k + 1}`).join(",") + ")";
      })
      .join(",");
    await client.query(sqlPrefix + " VALUES " + placeholders, values);
  }
}

export async function POST(req: NextRequest) {
  try {
    await initDB();
    const body = (await req.json()) as {
      ordersSummary: OrdersSummaryRow[];
      teamHourly: HourlyRow[];
      depotHourly: HourlyRow[];
      dates: string[];
      rawCount?: number;
    };
    const { ordersSummary, teamHourly, depotHourly, dates } = body;

    if (!Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: "No dates" }, { status: 400 });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Replace any existing data for the uploaded dates (raw + summary), so re-upload
      // of a date overwrites cleanly and isDateCompressed() (no raw rows) becomes true.
      await client.query("DELETE FROM orders WHERE create_date = ANY($1::date[])", [dates]);
      await client.query("DELETE FROM orders_summary WHERE create_date = ANY($1::date[])", [dates]);
      await client.query("DELETE FROM team_hourly_summary WHERE create_date = ANY($1::date[])", [dates]);
      await client.query("DELETE FROM depot_hourly_summary WHERE create_date = ANY($1::date[])", [dates]);

      await bulkInsert(
        client,
        `INSERT INTO orders_summary
          (create_date, create_hour, depot, region, doi,
           order_count, complete_count, cancel_count, processing_count, gmv, driver_active)`,
        (ordersSummary ?? []).map((r) => [
          r.create_date, r.create_hour, r.depot, r.region, r.doi,
          r.order_count, r.complete_count, r.cancel_count, r.processing_count, r.gmv, r.driver_active,
        ]),
        11
      );

      await bulkInsert(
        client,
        `INSERT INTO team_hourly_summary
          (create_date, create_hour, doi, gmv, driver_active, trip_complete)`,
        (teamHourly ?? []).map((r) => [
          r.create_date, r.create_hour, r.key, r.gmv, r.driver_active, r.trip_complete,
        ]),
        6
      );

      await bulkInsert(
        client,
        `INSERT INTO depot_hourly_summary
          (create_date, create_hour, depot_group, gmv, driver_active, trip_complete)`,
        (depotHourly ?? []).map((r) => [
          r.create_date, r.create_hour, r.key, r.gmv, r.driver_active, r.trip_complete,
        ]),
        6
      );

      // Mark each date compressed.
      const summaryByDate = new Map<string, number>();
      for (const r of ordersSummary ?? []) {
        summaryByDate.set(r.create_date, (summaryByDate.get(r.create_date) ?? 0) + 1);
      }
      for (const d of dates) {
        await client.query(
          `INSERT INTO compression_log (create_date, status, compressed_at, raw_row_count, summary_rows)
           VALUES ($1::date, 'compressed', NOW(), $2, $3)
           ON CONFLICT (create_date) DO UPDATE
           SET status = 'compressed', compressed_at = NOW(), raw_row_count = $2, summary_rows = $3`,
          [d, body.rawCount ?? null, summaryByDate.get(d) ?? 0]
        );
      }

      await client.query(
        `INSERT INTO metadata (key, value) VALUES ('last_import_at', NOW()::text)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
      );

      // Retention: drop anything older than 20 days.
      const cutoff = "current_date - interval '20 days'";
      await client.query(`DELETE FROM orders WHERE create_date < ${cutoff}`);
      await client.query(`DELETE FROM orders_summary WHERE create_date < ${cutoff}`);
      await client.query(`DELETE FROM team_hourly_summary WHERE create_date < ${cutoff}`);
      await client.query(`DELETE FROM depot_hourly_summary WHERE create_date < ${cutoff}`);
      await client.query(`DELETE FROM compression_log WHERE create_date < ${cutoff}`);

      await client.query("COMMIT");

      return NextResponse.json({
        ok: true,
        dates,
        ordersSummaryRows: (ordersSummary ?? []).length,
        teamHourlyRows: (teamHourly ?? []).length,
        depotHourlyRows: (depotHourly ?? []).length,
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    console.error("import-summary error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
