// Đọc file .msg (Outlook) ngay trong trình duyệt và tách ra các trường của một sự vụ mail.
// Một file .msg copy từ Outlook chứa mail mới nhất, các mail trước nằm trích dẫn bên dưới
// (khối "From:/Sent:/To:/Subject:" hoặc "Từ:/Đã gửi:/Đến:/Chủ đề:").

export interface MailMessage {
  from: string;
  to: string;
  cc: string;
  date: string | null; // ISO
  subject: string;
  body: string;
}

export interface ParsedMail {
  threadId: string;
  threadIdFound: boolean; // false = không thấy "thread::...::", dùng khóa thay thế
  subject: string;
  orderCodes: string[];
  partnerEmail: string; // người nhận đầu tiên của mail đầu tiên
  toEmails: string[]; // toàn bộ email người nhận mail đầu tiên
  createdAt: string | null; // thời gian gửi mail đầu tiên (ISO)
  messages: MailMessage[]; // theo thời gian: [0] = mail đầu tiên
  fileName: string;
}

const MAX_BODY = 20_000;

export const THREAD_RE = /thread::([A-Za-z0-9_\-+/=]{6,})::/;
// Mã đơn: bắt đầu 01M / 01K, chuỗi liền >10 ký tự.
const ORDER_RE = /\b01[MK][A-Za-z0-9]{8,}\b/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function extractOrderCodes(...texts: string[]): string[] {
  const set = new Set<string>();
  for (const t of texts) for (const m of t.match(ORDER_RE) ?? []) set.add(m.toUpperCase());
  return Array.from(set);
}

export function extractEmails(s: string): string[] {
  return Array.from(new Set((s.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase())));
}

// ─── Ngày giờ trong khối trích dẫn ───────────────────────────────────────────

/** "Monday, October 27, 2026 9:15 AM" · "Thứ Hai, 27 tháng 10, 2026 9:15 SA" · "27/10/2026 09:15". */
export function parseMailDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // Tiếng Việt: 27 tháng 10, 2026 9:15 SA/CH
  let m = s.match(/(\d{1,2})\s*tháng\s*(\d{1,2}),?\s*(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(SA|CH|AM|PM)?/i);
  if (m) return toIso(+m[3], +m[2], +m[1], +m[4], +m[5], m[6]);
  // dd/mm/yyyy hh:mm
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(SA|CH|AM|PM)?/i);
  if (m) return toIso(+m[3], +m[2], +m[1], +m[4], +m[5], m[6]);
  // Tiếng Anh: bỏ thứ trong tuần rồi để trình duyệt tự đọc.
  const t = Date.parse(s.replace(/^[A-Za-z]+,\s*/, "").replace(/\s+at\s+/i, " "));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function toIso(y: number, mo: number, d: number, h: number, mi: number, ampm?: string): string | null {
  const ap = (ampm ?? "").toUpperCase();
  if ((ap === "CH" || ap === "PM") && h < 12) h += 12;
  if ((ap === "SA" || ap === "AM") && h === 12) h = 0;
  const dt = new Date(y, mo - 1, d, h, mi); // giờ máy người dùng (VN)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

// ─── Tách các mail trong thread ──────────────────────────────────────────────

const H_FROM = "(?:From|Từ)";
const H_DATE = "(?:Sent|Date|Đã gửi|Ngày gửi|Ngày)";
const H_TO = "(?:To|Đến|Tới)";
const H_CC = "(?:Cc|CC)";
const H_SUBJ = "(?:Subject|Chủ đề|Tiêu đề)";

// Dòng "From:" mở đầu một khối trích dẫn (phía trước có thể có đường kẻ ____ / -----Original Message-----).
const QUOTE_START = new RegExp(
  `^[ \\t>*]*${H_FROM}\\s*:[^\\n]*\\n(?:[ \\t>*]*[^\\n]*\\n){0,2}?[ \\t>*]*${H_DATE}\\s*:`,
  "gim"
);

function headerValue(block: string, key: string): string {
  const m = block.match(new RegExp(`^[ \\t>*]*${key}\\s*:\\s*(.*)$`, "im"));
  return m ? m[1].trim() : "";
}

function clean(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/^[ \t]*(?:_{10,}|-{5,}\s*Original Message\s*-{5,}|-{10,})[ \t]*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_BODY);
}

interface Segment {
  header: string;
  body: string;
}

function splitThread(text: string): Segment[] {
  const t = text.replace(/\r\n/g, "\n");
  const starts: number[] = [];
  QUOTE_START.lastIndex = 0;
  for (let m = QUOTE_START.exec(t); m; m = QUOTE_START.exec(t)) starts.push(m.index);
  if (starts.length === 0) return [{ header: "", body: t }];
  const segs: Segment[] = [{ header: "", body: t.slice(0, starts[0]) }];
  starts.forEach((s, i) => {
    const chunk = t.slice(s, starts[i + 1] ?? t.length);
    // Khối header kết thúc ở dòng Subject/Chủ đề (hoặc dòng trống đầu tiên).
    const subj = chunk.match(new RegExp(`^[ \\t>*]*${H_SUBJ}\\s*:.*$`, "im"));
    let cut = subj ? (subj.index ?? 0) + subj[0].length : chunk.indexOf("\n\n");
    if (cut < 0) cut = chunk.length;
    segs.push({ header: chunk.slice(0, cut), body: chunk.slice(cut) });
  });
  return segs;
}

// ─── Đọc một file .msg ───────────────────────────────────────────────────────

type MsgFields = {
  subject?: string;
  body?: string;
  bodyHtml?: string;
  senderName?: string;
  senderEmail?: string;
  senderSmtpAddress?: string;
  clientSubmitTime?: string;
  messageDeliveryTime?: string;
  creationTime?: string;
  recipients?: { name?: string; email?: string; smtpAddress?: string; recipType?: string }[];
};

function hashKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export async function parseMsgFile(file: File): Promise<ParsedMail> {
  const { default: MsgReader } = await import("@kenjiuno/msgreader");
  const data = new MsgReader(await file.arrayBuffer()).getFileData() as MsgFields & {
    error?: string;
  };
  if (data.error) throw new Error(data.error);

  const subject = (data.subject ?? "").trim();
  const body = data.body ?? (data.bodyHtml ?? "").replace(/<[^>]+>/g, " ");
  const tid = (body.match(THREAD_RE) ?? (data.bodyHtml ?? "").match(THREAD_RE))?.[1];

  const recips = data.recipients ?? [];
  const fmt = (r: { name?: string; email?: string; smtpAddress?: string }) => {
    const email = r.smtpAddress || (r.email?.includes("@") ? r.email : "");
    return email ? `${r.name ?? ""} <${email}>`.trim() : r.name ?? "";
  };
  const latestDate =
    data.clientSubmitTime || data.messageDeliveryTime || data.creationTime || null;

  const segs = splitThread(body);
  const messages: MailMessage[] = segs.map((seg, i) => {
    if (i === 0) {
      const senderEmail = data.senderSmtpAddress || (data.senderEmail?.includes("@") ? data.senderEmail : "");
      return {
        from: senderEmail ? `${data.senderName ?? ""} <${senderEmail}>`.trim() : data.senderName ?? "",
        to: recips.filter((r) => (r.recipType ?? "to") === "to").map(fmt).join("; "),
        cc: recips.filter((r) => r.recipType === "cc").map(fmt).join("; "),
        date: latestDate ? new Date(latestDate).toISOString() : null,
        subject,
        body: clean(seg.body),
      };
    }
    return {
      from: headerValue(seg.header, H_FROM),
      to: headerValue(seg.header, H_TO),
      cc: headerValue(seg.header, H_CC),
      date: parseMailDate(headerValue(seg.header, H_DATE)),
      subject: headerValue(seg.header, H_SUBJ),
      body: clean(seg.body),
    };
  });
  messages.reverse(); // cũ → mới; [0] là mail đầu tiên

  const first = messages[0];
  const toEmails = extractEmails(first.to);
  const firstSubject = first.subject || subject;

  return {
    threadId: tid ?? `nothread-${hashKey(firstSubject.replace(/^((re|fw|fwd|tl|trả lời|chuyển tiếp)\s*:\s*)+/i, "").toLowerCase())}`,
    threadIdFound: !!tid,
    subject: firstSubject.replace(/^((re|fw|fwd|tl|trả lời|chuyển tiếp)\s*:\s*)+/i, "").trim() || subject,
    orderCodes: extractOrderCodes(subject, body),
    partnerEmail: toEmails[0] ?? "",
    toEmails,
    createdAt: first.date ?? (latestDate ? new Date(latestDate).toISOString() : null),
    messages,
    fileName: file.name,
  };
}
