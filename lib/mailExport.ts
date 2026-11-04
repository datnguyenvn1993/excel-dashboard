// Xuất các sự vụ mail đã chọn ra Excel theo đúng mẫu báo cáo (cột A → W).
// Các cột A (M), B (Week), G (SAP ID), H (Tên TX) là cột chạy hàm trong file mẫu → để trống.
import { MailCase } from "@/lib/mailCases";
import { THREAD_RE } from "@/lib/mailParse";

export const TEMPLATE_HEADERS = [
  "M", // A
  "Week", // B
  "PIC", // C
  "Ngày\ntiếp nhận", // D
  "Thời gian tiếp nhận", // E
  "Điện thoại", // F
  "SAP ID", // G
  "Tên TX", // H
  "Đối Tác", // I
  "Nguồn", // J
  "Loại Khiếu nại", // K
  "Tiêu đề", // L
  "Trạng thái", // M
  "Người khiếu nại", // N
  "Mã đơn hàng", // O
  "Nội dung sự vụ", // P
  "Parner xác minh sự vụ", // Q
  "Ngày hoàn thành", // R
  "Thời gian hoàn thành \n(Ghi giờ cụ thể: 00:00:00)", // S
  "Kết quả", // T
  "Số lần phản ánh", // U
  "Hình thức XLVP", // V
  "SLA", // W
];

type Cell = { t: "s" | "n"; v: string | number; z?: string } | null;

/** Các phần ngày giờ theo giờ Việt Nam. */
function vnParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour") % 24, mi: get("minute"), s: get("second") };
}

/** Ô ngày Excel thật (số serial, định dạng dd/mm/yyyy) để các cột hàm M/Week tính được. */
function dateCell(iso: string | null): Cell {
  if (!iso) return null;
  const p = vnParts(iso);
  const serial = (Date.UTC(p.y, p.mo - 1, p.d) - Date.UTC(1899, 11, 30)) / 86_400_000;
  return { t: "n", v: serial, z: "dd/mm/yyyy" };
}

/** Ô giờ Excel (phần lẻ của ngày, định dạng hh:mm:ss). */
function timeCell(iso: string | null): Cell {
  if (!iso) return null;
  const p = vnParts(iso);
  return { t: "n", v: (p.h * 3600 + p.mi * 60 + p.s) / 86_400, z: "hh:mm:ss" };
}

const text = (v: string | null | undefined): Cell => (v ? { t: "s", v: v.slice(0, 32_000) } : null);

/** Số điện thoại VN đầu tiên trong nội dung (0xxxxxxxxx / +84 / 84), chuẩn hóa về 0xxxxxxxxx. */
export function extractPhone(s: string): string {
  const m = s.match(/(?<![\d])(?:\+?84|0)(?:[\s.-]?\d){9}(?![\d])/);
  if (!m) return "";
  const digits = m[0].replace(/\D/g, "");
  return digits.startsWith("84") ? "0" + digits.slice(2) : digits;
}

const normSubject = (s: string) =>
  s.replace(/^((re|fw|fwd|tl|trả lời|chuyển tiếp)\s*:\s*)+/i, "").trim().toLowerCase();

/**
 * Số lần phản ánh: các sự vụ (trong toàn bộ dữ liệu) có cùng mã đơn hàng, đếm số phản ánh khác nhau
 * theo Case SF; sự vụ chưa có Case SF thì phân biệt theo Subject. Nhiều mã → lấy số lớn nhất.
 */
export function complaintCounter(all: MailCase[]) {
  const byCode = new Map<string, MailCase[]>();
  for (const c of all) for (const code of c.orderCodes) {
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code)!.push(c);
  }
  return (c: MailCase): number | null => {
    if (c.orderCodes.length === 0) return null;
    let best = 1;
    for (const code of c.orderCodes) {
      const keys = new Set(
        (byCode.get(code) ?? []).map((x) => (x.sfCase?.trim() ? `sf:${x.sfCase.trim().toLowerCase()}` : `subj:${normSubject(x.subject)}`))
      );
      best = Math.max(best, keys.size);
    }
    return best;
  };
}

function firstBody(c: MailCase): string {
  return (c.messages[0]?.body ?? "")
    .replace(new RegExp(THREAD_RE.source, "g"), "")
    .trim();
}

export async function exportMailTemplate(
  selected: MailCase[],
  all: MailCase[],
  partnerOf: (c: MailCase) => string,
  picName: (username: string | null) => string
) {
  const XLSX = await import("xlsx");
  const count = complaintCounter(all);
  const rows: Cell[][] = selected.map((c) => [
    null, // A M (hàm)
    null, // B Week (hàm)
    text(picName(c.pic)), // C
    dateCell(c.createdAt), // D
    timeCell(c.createdAt), // E
    text(extractPhone(firstBody(c))), // F
    null, // G SAP ID (hàm)
    null, // H Tên TX (hàm)
    text(partnerOf(c)), // I
    null, // J Nguồn (để trống)
    text(c.category), // K
    text(c.subject), // L
    text(c.status), // M
    text(c.complainant), // N
    text(c.orderCodes.join(", ")), // O
    text(firstBody(c)), // P
    text(c.partnerVerify), // Q
    dateCell(c.completedAt), // R
    timeCell(c.completedAt), // S
    text(c.result), // T
    ((n) => (n === null ? null : ({ t: "n", v: n } as Cell)))(count(c)), // U
    text(c.penalty), // V
    null, // W SLA
  ]);

  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
  rows.forEach((r, ri) =>
    r.forEach((cell, ci) => {
      if (cell) ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })] = cell;
    })
  );
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: TEMPLATE_HEADERS.length - 1 } });
  ws["!cols"] = [6, 6, 14, 12, 10, 13, 10, 18, 20, 8, 26, 40, 12, 10, 20, 60, 20, 12, 12, 26, 10, 18, 8].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Su vu");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `su-vu-mail-${stamp}.xlsx`);
}
