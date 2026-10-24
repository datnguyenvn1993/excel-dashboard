// Kỳ báo cáo: tháng ("MM/YYYY") hoặc tuần ("YYYY-MM-DD_YYYY-MM-DD" = ngày đầu_ngày cuối).
// Mọi chỗ hiển thị/sắp xếp kỳ đi qua các hàm ở đây để KPI tháng và KPI tuần dùng chung UI.

export type PeriodKind = "month" | "week";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dmy = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
const dm = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;

function utc(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

function parseWeekKey(key: string): { start: Date; end: Date } | null {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const start = utc(+m[1], +m[2], +m[3]);
  const end = utc(+m[4], +m[5], +m[6]);
  return start && end ? { start, end } : null;
}

/** Số tuần ISO (tuần bắt đầu thứ Hai) của một ngày, kèm năm ISO. */
export function isoWeek(d: Date): { week: number; year: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; // CN = 7
  t.setUTCDate(t.getUTCDate() + 4 - day); // thứ Năm cùng tuần quyết định năm ISO
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return { week, year };
}

/** Giá trị để sắp xếp tăng dần theo thời gian. */
export function periodSortValue(kind: PeriodKind, p: string): number {
  if (kind === "week") return parseWeekKey(p)?.start.getTime() ?? 0;
  const [mm, yyyy] = p.split("/");
  return parseInt(yyyy, 10) * 100 + parseInt(mm, 10);
}

export function sortPeriods(kind: PeriodKind, ps: string[]): string[] {
  return [...ps].sort((a, b) => periodSortValue(kind, a) - periodSortValue(kind, b));
}

/** Có nhiều năm trong danh sách kỳ không (để nhãn ngắn kèm năm). */
export function periodsMultiYear(kind: PeriodKind, ps: string[]): boolean {
  const years = new Set(
    ps.map((p) => (kind === "week" ? String(isoWeekOf(p)?.year ?? "") : p.split("/")[1]))
  );
  return years.size > 1;
}

function isoWeekOf(p: string) {
  const w = parseWeekKey(p);
  return w ? isoWeek(w.start) : null;
}

/** Nhãn ngắn cho tiêu đề cột: "T1" / "T1/26", tuần: "W02" / "W02/26". */
export function periodLabel(kind: PeriodKind, p: string, multiYear: boolean): string {
  if (kind === "week") {
    const w = isoWeekOf(p);
    if (!w) return p;
    return multiYear ? `W${pad(w.week)}/${String(w.year).slice(2)}` : `W${pad(w.week)}`;
  }
  const [mm, yyyy] = p.split("/");
  const mo = parseInt(mm, 10);
  return multiYear ? `T${mo}/${yyyy.slice(2)}` : `T${mo}`;
}

/** Mô tả đầy đủ (tooltip / ô chọn): "01/2026" hoặc "05/01 - 11/01/2026". */
export function periodRange(kind: PeriodKind, p: string): string {
  if (kind === "week") {
    const w = parseWeekKey(p);
    if (!w) return p;
    const sameYear = w.start.getUTCFullYear() === w.end.getUTCFullYear();
    return `${sameYear ? dm(w.start) : dmy(w.start)} - ${dmy(w.end)}`;
  }
  return p;
}

/** "W02/2026 · 05/01 - 11/01/2026" — dùng cho tooltip khi rê chuột. */
export function periodTitle(kind: PeriodKind, p: string): string {
  if (kind === "week") {
    const w = isoWeekOf(p);
    return w ? `Tuần ${pad(w.week)}/${w.year}: ${periodRange(kind, p)}` : p;
  }
  return `Tháng ${p}`;
}

export const PERIOD_UNIT: Record<PeriodKind, string> = { month: "tháng", week: "tuần" };

// ─── Parse giá trị cột kỳ trong file import ──────────────────────────────────

/**
 * Tuần: "05/01 - 11/01/2026", "29/12 - 04/01/2026" (năm của ngày đầu tự lùi 1 khi vắt năm),
 * "29/12/2025 - 04/01/2026", "2026-01-05 - 2026-01-11". Trả về khóa "YYYY-MM-DD_YYYY-MM-DD".
 */
export function parseWeekRange(v: unknown): string | null {
  const s = String(v ?? "").trim().replace(/[–—~]|\bto\b|đến/g, "-");
  let m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d1, m1, y1, d2, m2, y2] = m;
    const endY = +y2;
    const startY = y1 ? +y1 : +m1 > +m2 ? endY - 1 : endY;
    const start = utc(startY, +m1, +d1);
    const end = utc(endY, +m2, +d2);
    if (start && end && start <= end) return `${iso(start)}_${iso(end)}`;
    return null;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s*-\s*(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const start = utc(+m[1], +m[2], +m[3]);
    const end = utc(+m[4], +m[5], +m[6]);
    if (start && end && start <= end) return `${iso(start)}_${iso(end)}`;
  }
  return null;
}
