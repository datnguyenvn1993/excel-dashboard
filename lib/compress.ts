import type { PoolClient } from "pg";
import { buildRegionSql } from "./regions";
import { buildDepotGroupSql } from "./depots";

/**
 * Check if a date has been compressed (has summary rows).
 * Returns true ONLY if 'compressed' and NO raw orders exist for this date.
 * If raw orders exist, we must use them (e.g., user uploaded new data over compressed data).
 */
export async function isDateCompressed(client: PoolClient, date: string): Promise<boolean> {
  const res = await client.query(
    `SELECT status FROM compression_log 
         WHERE create_date = $1::date AND status = 'compressed'
         AND NOT EXISTS (SELECT 1 FROM orders WHERE create_date = $1::date LIMIT 1)`,
    [date]
  );
  return res.rows.length > 0;
}

/**
 * Check compression status for multiple dates at once.
 * Returns a Set of compressed date strings, filtering out ones with raw orders.
 */
export async function getCompressedDates(client: PoolClient): Promise<Set<string>> {
  const res = await client.query(
    `SELECT c.create_date::text 
         FROM compression_log c
         WHERE c.status = 'compressed'
         AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.create_date = c.create_date LIMIT 1)`
  );
  return new Set(res.rows.map((r: { create_date: string }) => r.create_date));
}

/**
 * Compress a single date: aggregate raw orders into orders_summary, then delete raw rows.
 */
export async function compressDate(client: PoolClient, date: string): Promise<{ rawDeleted: number; summaryInserted: number }> {
  const regionCaseSql = buildRegionSql("o.pickup_city");
  const depotGroupSql = buildDepotGroupSql("o.depot");

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

  // Precalculate cumulative data for Team Report to avoid Driver Active duplication
  await client.query("DELETE FROM team_hourly_summary WHERE create_date = $1::date", [date]);
  await client.query("DELETE FROM depot_hourly_summary WHERE create_date = $1::date", [date]);

  for (let h = 0; h <= 23; h++) {
    await client.query(`
            INSERT INTO team_hourly_summary (create_date, create_hour, doi, gmv, driver_active, trip_complete)
            SELECT
              $1::date,
              $2::smallint,
              COALESCE(d.doi, ''),
              COALESCE(SUM(CASE WHEN LOWER(o.status) LIKE 'complete%' THEN o.total_pay ELSE 0 END), 0),
              COUNT(DISTINCT NULLIF(TRIM(o.sap_profile_id),'')) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int,
              COUNT(o.id) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int
            FROM orders o
            LEFT JOIN drivers d ON NULLIF(TRIM(o.sap_profile_id),'') = d.sap_id
            WHERE o.create_date = $1::date 
              AND SPLIT_PART(TRIM(CAST(o.depot AS TEXT)), '.', 1) = '1032'
              AND o.create_hour <= $2::int
            GROUP BY COALESCE(d.doi, '')
            HAVING COUNT(o.id) > 0
        `, [date, h]);

    // Precalculate cumulative data for Depot Report
    await client.query(`
            INSERT INTO depot_hourly_summary (create_date, create_hour, depot_group, gmv, driver_active, trip_complete)
            SELECT
              $1::date,
              $2::smallint,
              COALESCE(${depotGroupSql}, 'Khác'),
              COALESCE(SUM(CASE WHEN LOWER(o.status) LIKE 'complete%' THEN o.total_pay ELSE 0 END), 0),
              COUNT(DISTINCT NULLIF(TRIM(o.sap_profile_id),'')) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int,
              COUNT(o.id) FILTER (WHERE LOWER(o.status) LIKE 'complete%')::int
            FROM orders o
            WHERE o.create_date = $1::date 
              AND o.create_hour <= $2::int
            GROUP BY COALESCE(${depotGroupSql}, 'Khác')
            HAVING COUNT(o.id) > 0
        `, [date, h]);
  }

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
