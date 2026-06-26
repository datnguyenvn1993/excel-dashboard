// Client-side aggregation: turns raw order rows into the SAME summary rows that
// server-side lib/compress.ts (compressDate) would produce, so we can upload only
// the aggregated rows instead of 180k raw rows. This drastically cuts Vercel
// "Fast Origin Transfer" (incoming bytes to compute).
//
// IMPORTANT: the logic here must stay faithful to lib/compress.ts:compressDate and
// the filtering in app/api/import/route.ts. If you change one, change both.

import { regionForCity } from "./regions";
import { depotCode, depotGroupForDepot } from "./depots";

export interface RawRow {
  order_id: string;
  status: string;
  depot: string;
  total_pay: number;
  pickup_city: string;
  create_date: string;
  create_hour: number;
  sap_profile_id: string;
  distance: string;
  cancel_by: string;
}

export interface OrdersSummaryRow {
  create_date: string;
  create_hour: number;
  depot: string;
  region: string;
  doi: string;
  order_count: number;
  complete_count: number;
  cancel_count: number;
  processing_count: number;
  gmv: number;
  driver_active: number;
}

export interface HourlyRow {
  create_date: string;
  create_hour: number;
  key: string; // doi (team) or depot_group (depot)
  gmv: number;
  driver_active: number;
  trip_complete: number;
}

export interface AggregateResult {
  ordersSummary: OrdersSummaryRow[];
  teamHourly: HourlyRow[];
  depotHourly: HourlyRow[];
  dates: string[];
  rawCount: number;       // rows after filter+dedup (what would have been inserted as raw)
  inputCount: number;     // rows before filtering
}

// ---- matches app/api/import/route.ts ----
const VALID_STATUSES = ["COMPLETED", "CANCELLED", "IN PROCESS"];
const VALID_DEPOTS = new Set([
  "PFBLU", "1017", "1109", "PFBDI", "1107", "1019", "PFBTN", "2000",
  "PFCMU", "PFDLA", "PFĐắk Nông", "2010", "1108", "1022", "PFGLA",
  "PFHDU", "PFHNA", "1031", "1032", "PFHBI", "2012", "1015", "2011",
  "PFKGG", "PFLDG", "PFLSN", "PFLCI", "2013", "PFNBI", "PFNTN", "3002",
  "PFPYE", "PFQBI", "2014", "1041", "1016", "PFQTR", "PFSTG", "PFTNI",
  "PFTBI", "PFTNG", "1000", "1110", "PFTVH", "PFTQU", "PFVLG", "1018",
  "PLFYBI",
]);

// Group-key separator: a control char that won't appear in dates/depots/doi values.
const SEP = String.fromCharCode(1);

// ---- status helpers (match the LOWER(status) LIKE ... predicates in SQL) ----
function isComplete(status: string): boolean {
  return String(status).toLowerCase().startsWith("complete");
}
function isProcessing(status: string): boolean {
  const s = String(status).toLowerCase();
  return s.startsWith("process") || s === "in progress";
}
function isCancelByDriver(cancelBy: string): boolean {
  return String(cancelBy).trim().toUpperCase() === "DRIVER";
}

/**
 * Filter to valid statuses/depots and normalize "IN PROCESS" -> "COMPLETED".
 * Faithful to app/api/import/route.ts.
 */
export function filterAndNormalize(rows: RawRow[]): RawRow[] {
  const out: RawRow[] = [];
  for (const r of rows) {
    const st = String(r.status).toUpperCase();
    if (!VALID_STATUSES.includes(st)) continue;
    if (!VALID_DEPOTS.has(String(r.depot))) continue;
    out.push({ ...r, status: st === "IN PROCESS" ? "COMPLETED" : st });
  }
  return out;
}

/**
 * Dedup by order_id (matches the DISTINCT ON (COALESCE(NULLIF(order_id,''), id))
 * dedup that app/api/kpis/route.ts applies when reading raw orders). Rows with an
 * empty order_id are all kept (each treated as unique, like the id fallback).
 */
function dedupeByOrderId(rows: RawRow[]): RawRow[] {
  const seen = new Set<string>();
  const out: RawRow[] = [];
  for (const r of rows) {
    const oid = String(r.order_id ?? "").trim();
    if (oid) {
      if (seen.has(oid)) continue;
      seen.add(oid);
    }
    out.push(r);
  }
  return out;
}

// Build cumulative (create_hour <= h) hourly summary, grouped by a key, per date.
// Mirrors the per-hour loop (h = 0..23) in compressDate for team_hourly/depot_hourly.
function buildCumulativeHourly(
  rows: RawRow[],
  keyFn: (r: RawRow) => string
): HourlyRow[] {
  const out: HourlyRow[] = [];
  // group by (date, key); store date + key explicitly to avoid parsing the map key
  const groups = new Map<string, { date: string; key: string; rows: RawRow[] }>();
  for (const r of rows) {
    const key = keyFn(r);
    const mapKey = `${r.create_date}${SEP}${key}`;
    let g = groups.get(mapKey);
    if (!g) {
      g = { date: r.create_date, key, rows: [] };
      groups.set(mapKey, g);
    }
    g.rows.push(r);
  }
  for (const { date, key, rows: rs } of groups.values()) {
    // bucket rows by hour
    const byHour = new Map<number, RawRow[]>();
    for (const r of rs) {
      const h = r.create_hour;
      let arr = byHour.get(h);
      if (!arr) { arr = []; byHour.set(h, arr); }
      arr.push(r);
    }
    // running cumulative across hours 0..23
    const saps = new Set<string>();
    let gmv = 0;
    let trip = 0;
    let anyCount = 0;
    for (let h = 0; h <= 23; h++) {
      const rowsH = byHour.get(h);
      if (rowsH) {
        for (const r of rowsH) {
          anyCount++;
          if (isComplete(r.status)) {
            trip++;
            gmv += r.total_pay || 0;
            const sap = String(r.sap_profile_id ?? "").trim();
            if (sap) saps.add(sap);
          }
        }
      }
      // HAVING COUNT(*) > 0 in compressDate: emit once the cumulative window has rows
      if (anyCount > 0) {
        out.push({
          create_date: date,
          create_hour: h,
          key,
          gmv,
          driver_active: saps.size,
          trip_complete: trip,
        });
      }
    }
  }
  return out;
}

/**
 * Full client-side aggregation. driverMap maps trimmed sap_profile_id -> doi.
 */
export function aggregate(
  inputRows: RawRow[],
  driverMap: Record<string, string>
): AggregateResult {
  const inputCount = inputRows.length;
  const filtered = filterAndNormalize(inputRows);
  const rows = dedupeByOrderId(filtered);

  // ---- orders_summary: group by (date, hour, depot_code, region, doi) ----
  const osMap = new Map<string, OrdersSummaryRow & { saps: Set<string> }>();
  for (const r of rows) {
    const depot = depotCode(r.depot);
    const region = regionForCity(r.pickup_city);
    const sap = String(r.sap_profile_id ?? "").trim();
    const doi = driverMap[sap] ?? "";
    const key = `${r.create_date}${SEP}${r.create_hour}${SEP}${depot}${SEP}${region}${SEP}${doi}`;
    let g = osMap.get(key);
    if (!g) {
      g = {
        create_date: r.create_date,
        create_hour: r.create_hour,
        depot,
        region,
        doi,
        order_count: 0,
        complete_count: 0,
        cancel_count: 0,
        processing_count: 0,
        gmv: 0,
        driver_active: 0,
        saps: new Set<string>(),
      };
      osMap.set(key, g);
    }
    g.order_count++;
    if (isComplete(r.status)) {
      g.complete_count++;
      g.gmv += r.total_pay || 0;
      if (sap) g.saps.add(sap);
    }
    if (isCancelByDriver(r.cancel_by)) g.cancel_count++;
    if (isProcessing(r.status)) g.processing_count++;
  }
  const ordersSummary: OrdersSummaryRow[] = [];
  for (const g of osMap.values()) {
    const { saps, ...rest } = g;
    ordersSummary.push({ ...rest, driver_active: saps.size });
  }

  // ---- team_hourly_summary: only depot code '1032', grouped by doi ----
  const team1032 = rows.filter((r) => depotCode(r.depot) === "1032");
  const teamHourly = buildCumulativeHourly(team1032, (r) => {
    const sap = String(r.sap_profile_id ?? "").trim();
    return driverMap[sap] ?? "";
  });

  // ---- depot_hourly_summary: all rows, grouped by depot_group ----
  const depotHourly = buildCumulativeHourly(rows, (r) => depotGroupForDepot(r.depot));

  const dates = [...new Set(rows.map((r) => r.create_date).filter(Boolean))];

  return {
    ordersSummary,
    teamHourly,
    depotHourly,
    dates,
    rawCount: rows.length,
    inputCount,
  };
}
