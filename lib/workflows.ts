// Quy trình xử lý (Workflow) — plan A: bản mẫu/SOP để tra cứu, chưa gắn vào sự vụ.
// Cả quy trình (lanes + steps) lưu dưới dạng một JSON trong cột data.

export interface Lane {
  id: string;
  name: string;
  color: string;
}

export type DocKind = "image" | "gsheet" | "gdoc" | "link";

export interface WorkflowDoc {
  kind: DocKind;
  url: string;
  name: string;
}

export interface Step {
  id: string;
  laneId: string;
  title: string;
  sla: string; // vd. "4h", "24h"
  note: string;
  mailSubject: string;
  mailBody: string;
  notify: string;
  rule: string;
  docs: WorkflowDoc[];
}

export interface WorkflowData {
  lanes: Lane[];
  steps: Step[]; // thứ tự trong mảng = thứ tự các bước
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  data: WorkflowData;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const LANE_COLORS = [
  "#2a78d6", "#eb6834", "#1baf7a", "#6250d6", "#eda100", "#e87ba4", "#008300", "#e34948",
];

export const emptyData = (): WorkflowData => ({ lanes: [], steps: [] });

/** Nhận diện loại tài liệu từ URL người dùng dán vào. */
export function docKindFromUrl(url: string): DocKind {
  const u = url.toLowerCase();
  if (/docs\.google\.com\/spreadsheets/.test(u) || /\.(xlsx?|csv)(\?|$)/.test(u)) return "gsheet";
  if (/docs\.google\.com\/document/.test(u) || /\.docx?(\?|$)/.test(u)) return "gdoc";
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/.test(u)) return "image";
  return "link";
}

export const DOC_ICON: Record<DocKind, string> = {
  image: "🖼️",
  gsheet: "📊",
  gdoc: "📄",
  link: "🔗",
};

export const DOC_LABEL: Record<DocKind, string> = {
  image: "Hình ảnh",
  gsheet: "Google Sheet / Excel",
  gdoc: "Google Doc / Word",
  link: "Liên kết",
};

/** Kiểm tra sơ bộ một WorkflowData hợp lệ (dùng khi lưu). */
export function sanitizeData(raw: unknown): WorkflowData {
  const d = (raw ?? {}) as Partial<WorkflowData>;
  const lanes: Lane[] = Array.isArray(d.lanes)
    ? d.lanes.slice(0, 20).map((l) => ({
        id: String(l.id ?? ""),
        name: String(l.name ?? "").slice(0, 60),
        color: String(l.color ?? LANE_COLORS[0]).slice(0, 20),
      }))
    : [];
  const laneIds = new Set(lanes.map((l) => l.id));
  const steps: Step[] = Array.isArray(d.steps)
    ? d.steps.slice(0, 100).map((s) => ({
        id: String(s.id ?? ""),
        laneId: laneIds.has(String(s.laneId)) ? String(s.laneId) : lanes[0]?.id ?? "",
        title: String(s.title ?? "").slice(0, 200),
        sla: String(s.sla ?? "").slice(0, 20),
        note: String(s.note ?? "").slice(0, 5000),
        mailSubject: String(s.mailSubject ?? "").slice(0, 500),
        mailBody: String(s.mailBody ?? "").slice(0, 10000),
        notify: String(s.notify ?? "").slice(0, 2000),
        rule: String(s.rule ?? "").slice(0, 2000),
        docs: Array.isArray(s.docs)
          ? s.docs.slice(0, 30).map((x) => ({
              kind: (["image", "gsheet", "gdoc", "link"] as DocKind[]).includes(x.kind as DocKind)
                ? (x.kind as DocKind)
                : "link",
              url: String(x.url ?? "").slice(0, 2000),
              name: String(x.name ?? "").slice(0, 200),
            }))
          : [],
      }))
    : [];
  return { lanes, steps };
}
