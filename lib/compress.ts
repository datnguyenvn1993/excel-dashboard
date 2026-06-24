import type { PoolClient } from "pg";
import { buildRegionSql } from "./regions";

/**
 * Check if a date has been compressed (has summary rows).
 */
export async function isDateCompressed(client: PoolClient, date: string): Promise<boolean> {
    const res = await client.query(
        "SELECT status FROM compression_log WHERE create_date = $1::date AND status = 'compressed'",
        [date]
    );
    return res.rows.length > 0;
}

/**
 * Check compression status for multiple dates at once.
 * Returns a Set of compressed date strings.
 */
export async function getCompressedDates(client: PoolClient): Promise<Set<string>> {
    const res = await client.query(
        "SELECT create_date::text FROM compression_log WHERE status = 'compressed'"
    );
    return new Set(res.rows.map((r: { create_date: string }) => r.create_date));
}

/**
 * Compress a single date: aggregate raw orders into orders_summary, then delete raw rows.
 */
export async function compressDate(client: PoolClient, date: string): Promise<{ rawDeleted: number; summaryInserted: number }> {
    const regionCaseSql = buildRegionSql("o.pickup_city");

    // Count raw rows first
    const countRes = await client.query(
        "SELECT COUNT(*)::int as cnt FROM orders WHERE create_date = $1::date",
        [date]
    );
    const rawCount = countRes.rows[0]?.cnt ?? 0;
    if (rawCount === 0) {
        throw new Error(`Không có dữ liệu thô cho ngày ${date}`);
    }

    // Delete old summary if exists (for recompress)
    await client.query("DELETE FROM orders_summary WHERE create_date = $1::date", [date]);

    // Aggregate and insert
    const insertSql = `
    INSERT INTO orders_summary (create_date, create_hour, depot, region, doi,
      order_count, complete_count, cancel_count, processing_count, gmv, driver_active)
    SELECT
      o.create_date,
      o.create_hour,
      COALESCE(SPLIT_PART(TRIM(CAST(o.depot AS TEXT)), '.', 1), ''),
      COALESCE(${regionCaseSql}, ''),
      COALESCE(d.doi, ''),
      COUNT(*)::int,
      COUNT(*) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int,
      COUNT(*) FILTER (WHERE UPPER(TRIM(o.cancel_by)) = 'DRIVER')::int,
      COUNT(*) FILTER (WHERE LOWER(o.status) LIKE 'process%' OR LOWER(o.status) = 'in progress')::int,
      COALESCE(SUM(CASE WHEN LOWER(o.status) LIKE 'complete%' THEN o.total_pay ELSE 0 END), 0),
      COUNT(DISTINCT NULLIF(TRIM(o.sap_profile_id),'')) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int
    FROM orders o
    LEFT JOIN drivers d ON NULLIF(TRIM(o.sap_profile_id),'') = d.sap_id
    WHERE o.create_date = $1::date
    GROUP BY o.create_date, o.create_hour,
             SPLIT_PART(TRIM(CAST(o.depot AS TEXT)), '.', 1),
             ${regionCaseSql},
             COALESCE(d.doi, '')
  `;
    const insertRes = await client.query(insertSql, [date]);
    const summaryRows = insertRes.rowCount ?? 0;

    // Delete raw rows
    await client.query("DELETE FROM orders WHERE create_date = $1::date", [date]);

    // Update compression log
    await client.query(`
    INSERT INTO compression_log (create_date, status, compressed_at, raw_row_count, summary_rows)
    VALUES ($1::date, 'compressed', NOW(), $2, $3)
    ON CONFLICT (create_date) DO UPDATE
    SET status = 'compressed', compressed_at = NOW(), raw_row_count = $2, summary_rows = $3
  `, [date, rawCount, summaryRows]);

    return { rawDeleted: rawCount, summaryInserted: summaryRows };
}
