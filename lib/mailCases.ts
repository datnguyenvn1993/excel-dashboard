// Danh mục lựa chọn + kiểu dữ liệu của trang Quản lý mail (sự vụ khiếu nại).
import type { MailMessage } from "@/lib/mailParse";

export const CATEGORIES = [
  "Thái độ, quấy rối khách hàng",
  "Quên đồ / thất lạc tài sản",
  "Hóa đơn, giá cước, khuyến mại",
  "Hủy cuốc, từ chối cuốc",
  "Lỗi ứng dụng, GPS, không nhận cuốc",
  "Khác",
];
export const STATUSES = ["Chưa xử lý", "Đang xử lý", "Đã xử lý"];
export const COMPLAINANTS = ["KH", "TX", "Partner", "Khác"];
export const RESULTS = [
  "QTUX nhóm 1",
  "QTUX nhóm 2",
  "QTUX nhóm 3",
  "QTUX nhóm 4",
  "Nhắc nhở lần 1",
  "Các quy định khác",
  "Nhắc nhở & TĐT",
  "Xác Minh Không phải lỗi TX/Chưa đủ căn cứ đánh giá, xác minh vi phạm",
  "Đã hỗ trợ TX",
  "Không vi phạm",
  "Khác",
];
// Hình thức xử lý vi phạm (cột mới).
export const PENALTIES = ["Phạt đối tác", "Không phạt đối tác"];

/** Kết quả mang tính vi phạm → tô đỏ. */
export const isViolationResult = (r: string | null) => !!r && /^(QTUX|Nhắc nhở|Vi phạm)/.test(r);

export interface MailCase {
  threadId: string;
  subject: string;
  orderCodes: string[];
  partnerEmail: string;
  partnerName: string | null; // null = lấy theo danh bạ email → đối tác
  messages: MailMessage[];
  createdAt: string | null;
  category: string | null;
  status: string; // tự tính: xem deriveStatus
  importCount: number;
  complainant: string | null;
  partnerVerify: string | null;
  completedAt: string | null;
  result: string | null;
  penalty: string | null; // Hình thức XLVP
  note: string | null;
  sfCase: string | null;
  pic: string | null;
  fileName: string | null;
  importedAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

// Cột người dùng được sửa → tên cột trong DB (chỉ cho phép các cột này qua API).
export const EDITABLE_FIELDS = {
  partnerName: "partner_name",
  category: "category",
  complainant: "complainant",
  partnerVerify: "partner_verify",
  completedAt: "completed_at",
  result: "result",
  penalty: "penalty",
  note: "note",
  sfCase: "sf_case",
  pic: "pic",
  createdAt: "created_at",
} as const;
export type EditableField = keyof typeof EDITABLE_FIELDS;

/** Email người nhận → tên đối tác; khóa có thể là email đầy đủ hoặc "@domain.com". */
export function lookupPartner(email: string, contacts: Record<string, string>): string {
  const e = email.toLowerCase();
  if (!e) return "";
  if (contacts[e]) return contacts[e];
  const at = e.indexOf("@");
  return at >= 0 ? contacts[e.slice(at)] ?? "" : "";
}

/**
 * Trạng thái tự động:
 * - có ngày hoàn thành → Đã xử lý
 * - thread có phản hồi, hoặc đã import trùng (gộp) → Đang xử lý
 * - chỉ có mail đầu tiên → Chưa xử lý
 */
export function deriveStatus(c: { completedAt: string | null; messageCount: number; importCount: number }): string {
  if (c.completedAt) return "Đã xử lý";
  if (c.messageCount > 1 || c.importCount > 1) return "Đang xử lý";
  return "Chưa xử lý";
}

/** "2 ngày 5 giờ 12 phút" giữa hai mốc (mốc cuối mặc định là bây giờ). */
export function durationText(from: string | null, to: string | number | null): string {
  if (!from || to === null) return "";
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms)) return "";
  if (ms < 0) return "⚠️ trước ngày tạo";
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts = [d && `${d} ngày`, h && `${h} giờ`, (!d || m) && `${m} phút`].filter(Boolean);
  return parts.join(" ");
}
