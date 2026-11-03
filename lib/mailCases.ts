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
export const RESULTS = ["Vi phạm", "Không vi phạm", "Khác"];

export interface MailCase {
  threadId: string;
  subject: string;
  orderCodes: string[];
  partnerEmail: string;
  partnerName: string | null; // null = lấy theo danh bạ email → đối tác
  messages: MailMessage[];
  createdAt: string | null;
  category: string | null;
  status: string;
  complainant: string | null;
  partnerVerify: string | null;
  completedAt: string | null;
  result: string | null;
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
  status: "status",
  complainant: "complainant",
  partnerVerify: "partner_verify",
  completedAt: "completed_at",
  result: "result",
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

/** "2 ngày 5 giờ" giữa lúc tạo và lúc hoàn thành. */
export function durationText(from: string | null, to: string | null): string {
  if (!from || !to) return "";
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms)) return "";
  if (ms < 0) return "⚠️ trước ngày tạo";
  const h = Math.round(ms / 3_600_000);
  const d = Math.floor(h / 24);
  const r = h % 24;
  return d ? `${d} ngày${r ? ` ${r} giờ` : ""}` : `${h} giờ`;
}
