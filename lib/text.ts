// Xử lý mã hóa chữ tiếng Việt khi đọc file CSV/Excel.

// Ký tự Windows-1252 ở vùng 0x80–0x9F (khác Latin-1) → byte gốc.
const CP1252_TO_BYTE: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

// Dấu hiệu chuỗi UTF-8 bị đọc nhầm thành Windows-1252/Latin-1 ("ThÃ¡ng", "Chá»‰ sá»‘").
const MOJIBAKE = /[ÃÂÄÅÆáº»]/;

/**
 * Sửa chuỗi tiếng Việt bị lỗi mã hóa kiểu "ThÃ¡ng" → "Tháng".
 * Chỉ áp dụng khi giải mã lại ra UTF-8 hợp lệ; ngược lại giữ nguyên.
 */
export function fixMojibake(s: string): string {
  if (!MOJIBAKE.test(s)) return s;
  const bytes: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c <= 0xff) bytes.push(c);
    else if (CP1252_TO_BYTE[c] !== undefined) bytes.push(CP1252_TO_BYTE[c]);
    else return s; // có ký tự ngoài bảng mã → không phải mojibake
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return s;
  }
}

/** Chuẩn hóa chữ: sửa lỗi mã hóa, gộp dấu (NFC), bỏ khoảng trắng đầu/cuối. */
export function normText(s: string): string {
  return fixMojibake(s).normalize("NFC").trim();
}

/**
 * Giải mã nội dung file CSV thành chuỗi. Ưu tiên UTF-8 (có/không BOM — BigQuery xuất UTF-8
 * không BOM); nếu không phải UTF-8 hợp lệ thì thử Windows-1258 (tiếng Việt trên Excel Windows).
 */
export function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buffer);
  } catch {
    try {
      return new TextDecoder("windows-1258").decode(buffer);
    } catch {
      return new TextDecoder("windows-1252").decode(buffer);
    }
  }
}
