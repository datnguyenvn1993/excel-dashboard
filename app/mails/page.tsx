"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppNav from "@/components/AppNav";
import { parseMsgFile, ParsedMail } from "@/lib/mailParse";
import {
  CATEGORIES,
  COMPLAINANTS,
  EditableField,
  MailCase,
  RESULTS,
  STATUSES,
  durationText,
  lookupPartner,
} from "@/lib/mailCases";
import { PARTNERS } from "@/lib/partners";

interface Contact {
  email: string;
  partnerName: string;
}
interface User {
  username: string;
  displayName: string;
}

const UPLOAD_BATCH = 10;

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

/** ISO → giá trị cho <input type="datetime-local"> theo giờ máy. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const STATUS_STYLE: Record<string, string> = {
  "Chưa xử lý": "bg-red-50 text-red-700 border-red-200",
  "Đang xử lý": "bg-amber-50 text-amber-700 border-amber-200",
  "Đã xử lý": "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const cellInput =
  "w-full text-xs px-2 py-1 rounded-md border border-gray-200 bg-white focus:outline-none focus:border-emerald-500";

/** Ô text: lưu khi rời ô (blur) hoặc Enter nếu giá trị đổi. */
function TextCell({
  value,
  onSave,
  placeholder,
  list,
  multiline,
}: {
  value: string | null;
  onSave: (v: string) => void;
  placeholder?: string;
  list?: string;
  multiline?: boolean;
}) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const commit = () => {
    if (v.trim() !== (value ?? "").trim()) onSave(v);
  };
  if (multiline) {
    return (
      <textarea
        value={v}
        rows={2}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        className={`${cellInput} min-w-[180px] resize-y`}
      />
    );
  }
  return (
    <input
      value={v}
      list={list}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cellInput}
    />
  );
}

function SelectCell({
  value,
  options,
  onSave,
  className = "",
  empty = "—",
}: {
  value: string | null;
  options: { value: string; label: string }[] | string[];
  onSave: (v: string) => void;
  className?: string;
  empty?: string | null;
}) {
  const opts = (options as (string | { value: string; label: string })[]).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );
  return (
    <select value={value ?? ""} onChange={(e) => onSave(e.target.value)} className={`${cellInput} ${className}`}>
      {empty !== null && <option value="">{empty}</option>}
      {value && !opts.some((o) => o.value === value) && <option value={value}>{value}</option>}
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function MessageView({ m, index, total }: { m: MailCase["messages"][number]; index: number; total: number }) {
  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="px-3 py-2 border-b border-gray-100 text-[11px] text-gray-500 space-y-0.5">
        <div>
          <b className="text-gray-700">
            {index === 0 ? "Mail đầu tiên" : `Phản hồi ${index}/${total - 1}`}
          </b>
          {m.date && <span> · {fmtDateTime(m.date)}</span>}
        </div>
        <div>
          <b>Từ:</b> {m.from || "—"}
        </div>
        <div>
          <b>Đến:</b> {m.to || "—"}
          {m.cc && (
            <>
              {" "}
              · <b>Cc:</b> {m.cc}
            </>
          )}
        </div>
      </div>
      <pre className="px-3 py-2 text-xs text-gray-800 whitespace-pre-wrap font-sans max-h-96 overflow-auto">
        {m.body || "(trống)"}
      </pre>
    </div>
  );
}

export default function MailsPage() {
  const [cases, setCases] = useState<MailCase[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showReplies, setShowReplies] = useState<Set<string>>(new Set());
  const [showContacts, setShowContacts] = useState(false);

  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fPic, setFPic] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const load = useCallback(async () => {
    try {
      const [c, ct, u] = await Promise.all([
        fetch("/api/mail-cases", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/mail-contacts", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/mail-cases/users", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (c.error) throw new Error(c.error);
      setCases(c.cases ?? []);
      setContacts(ct.contacts ?? []);
      setUsers(u.users ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const contactMap = useMemo(
    () => Object.fromEntries(contacts.map((c) => [c.email.toLowerCase(), c.partnerName])),
    [contacts]
  );
  const partnerOf = useCallback(
    (c: MailCase) => c.partnerName ?? lookupPartner(c.partnerEmail, contactMap),
    [contactMap]
  );
  const partnerSuggestions = useMemo(
    () =>
      Array.from(
        new Set([
          ...contacts.map((c) => c.partnerName),
          ...Object.values(PARTNERS).map((p) => p.name).filter(Boolean),
        ])
      ).sort((a, b) => a.localeCompare(b, "vi")),
    [contacts]
  );
  const picOptions = useMemo(
    () => users.map((u) => ({ value: u.username, label: u.displayName ? `${u.displayName} (${u.username})` : u.username })),
    [users]
  );

  // ── Import .msg ──────────────────────────────────────────────────────────
  const importFiles = async (files: File[]) => {
    const msgs = files.filter((f) => /\.msg$/i.test(f.name));
    if (msgs.length === 0) {
      showToast("✖ Chỉ nhận file .msg (kéo mail từ Outlook ra thư mục hoặc File → Save As)");
      return;
    }
    const lines: string[] = [];
    const parsed: ParsedMail[] = [];
    for (let i = 0; i < msgs.length; i++) {
      setBusy(`Đang đọc ${i + 1}/${msgs.length}: ${msgs[i].name}`);
      try {
        const p = await parseMsgFile(msgs[i]);
        if (!p.threadIdFound) lines.push(`⚠️ ${p.fileName}: không thấy "thread::…::", dùng tiêu đề làm khóa`);
        parsed.push(p);
      } catch (e) {
        lines.push(`✖ ${msgs[i].name}: không đọc được (${e instanceof Error ? e.message : "lỗi"})`);
      }
    }
    // Trong cùng lần import, cùng thread → giữ bản có nhiều phản hồi nhất.
    const byThread = new Map<string, ParsedMail>();
    for (const p of parsed) {
      const old = byThread.get(p.threadId);
      if (!old || p.messages.length >= old.messages.length) byThread.set(p.threadId, p);
    }
    const list = Array.from(byThread.values());
    let inserted = 0;
    let updated = 0;
    try {
      for (let i = 0; i < list.length; i += UPLOAD_BATCH) {
        setBusy(`Đang lưu ${Math.min(i + UPLOAD_BATCH, list.length)}/${list.length} mail...`);
        const res = await fetch("/api/mail-cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cases: list.slice(i, i + UPLOAD_BATCH) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        inserted += json.inserted ?? 0;
        updated += json.updated ?? 0;
      }
      lines.unshift(`✅ ${inserted} sự vụ mới, ${updated} sự vụ cập nhật (trùng thread id)`);
    } catch (e) {
      lines.unshift(`✖ Lưu thất bại: ${e instanceof Error ? e.message : "lỗi"}`);
    }
    setBusy(null);
    setReport(lines);
    await load();
  };

  // ── Sửa một ô ────────────────────────────────────────────────────────────
  const saveField = async (threadId: string, field: EditableField, value: string | null) => {
    const prev = cases;
    setCases((cs) => cs.map((c) => (c.threadId === threadId ? { ...c, [field]: value || null } : c)));
    try {
      const res = await fetch("/api/mail-cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, field, value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    } catch (e) {
      setCases(prev);
      showToast(`✖ Chưa lưu được: ${e instanceof Error ? e.message : "lỗi"}`);
    }
  };

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setter(n);
  };

  // ── Lọc ──────────────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cases.filter((c) => {
      if (fStatus && c.status !== fStatus) return false;
      if (fCategory && (c.category ?? "") !== fCategory) return false;
      if (fPic && (fPic === "__none__" ? !!c.pic : c.pic !== fPic)) return false;
      if (!s) return true;
      return [c.subject, c.orderCodes.join(" "), partnerOf(c), c.partnerEmail, c.sfCase ?? "", c.note ?? "", c.threadId]
        .join(" ")
        .toLowerCase()
        .includes(s);
    });
  }, [cases, q, fStatus, fCategory, fPic, partnerOf]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of cases) m[c.status] = (m[c.status] ?? 0) + 1;
    return m;
  }, [cases]);

  const exportCsv = () => {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const header = [
      "Thread ID", "Ngày tạo", "Subject", "Mã đơn", "Đối tác", "Email đối tác", "Phân loại", "Người khiếu nại",
      "Trạng thái", "PIC", "Partner xác minh", "Ngày hoàn thành", "Thời gian hoàn thành", "Kết quả",
      "Case SF", "Note", "Số mail trong thread",
    ];
    const lines = [header.join(",")];
    for (const c of visible) {
      lines.push(
        [
          c.threadId, fmtDateTime(c.createdAt), c.subject, c.orderCodes.join(" "), partnerOf(c), c.partnerEmail,
          c.category ?? "", c.complainant ?? "", c.status, c.pic ?? "", c.partnerVerify ?? "",
          fmtDateTime(c.completedAt), durationText(c.createdAt, c.completedAt), c.result ?? "", c.sfCase ?? "",
          c.note ?? "", String(c.messages.length),
        ]
          .map((v) => esc(String(v)))
          .join(",")
      );
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quan-ly-mail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filterCls =
    "text-xs px-2 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 focus:outline-none focus:border-emerald-500";
  const th = "px-2 py-2 font-semibold border-b border-gray-200 text-center whitespace-nowrap";
  const COLS = 15;

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="sticky top-0 z-30 border-b shadow-sm px-4 sm:px-6 py-3"
        style={{ background: "#27BDBE", borderColor: "#22a7a8" }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-sm sm:text-base font-bold uppercase tracking-wide text-white">
              📧 Quản lý mail khiếu nại
            </h1>
            <p className="text-xs text-cyan-50 mt-0.5">
              {cases.length} sự vụ · {counts["Chưa xử lý"] ?? 0} chưa xử lý · {counts["Đang xử lý"] ?? 0} đang
              xử lý · {counts["Đã xử lý"] ?? 0} đã xử lý
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <AppNav active="/mails" />
            <label className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-teal-700 hover:bg-cyan-50 shadow-sm cursor-pointer">
              ⬆ Import .msg
              <input
                type="file"
                accept=".msg"
                multiple
                className="hidden"
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (fs.length) importFiles(fs);
                }}
              />
            </label>
          </div>
        </div>
      </header>

      <main
        className="p-4 sm:p-6 space-y-4"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const fs = Array.from(e.dataTransfer.files);
          if (fs.length) importFiles(fs);
        }}
      >
        <div
          className={`border-2 border-dashed rounded-xl px-4 py-3 text-center text-xs ${
            dragging ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-gray-300 text-gray-500"
          }`}
        >
          {busy ? (
            <span className="text-gray-700">⏳ {busy}</span>
          ) : (
            <>
              Kéo thả nhiều file <b>.msg</b> vào đây (hoặc bấm <b>⬆ Import .msg</b>). Trùng mã{" "}
              <code>thread::…::</code> thì cập nhật nội dung mới, giữ nguyên các cột bạn đã nhập.
            </>
          )}
        </div>

        {report && (
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-xs space-y-0.5 relative">
            <button onClick={() => setReport(null)} className="absolute right-3 top-2 text-gray-400 hover:text-gray-700">
              ×
            </button>
            {report.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">⚠️ {error}</div>
        )}

        {/* Bộ lọc */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm subject, mã đơn, đối tác, case SF..."
            className={`${filterCls} w-72`}
          />
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={filterCls}>
            <option value="">Mọi trạng thái</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className={filterCls}>
            <option value="">Mọi phân loại</option>
            {CATEGORIES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value={fPic} onChange={(e) => setFPic(e.target.value)} className={filterCls}>
            <option value="">Mọi PIC</option>
            <option value="__none__">Chưa có PIC</option>
            {picOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500">{visible.length} sự vụ</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowContacts(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              📇 Email → Đối tác ({contacts.length})
            </button>
            <button
              disabled={visible.length === 0}
              onClick={exportCsv}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              ⬇ Xuất CSV
            </button>
          </div>
        </div>

        <datalist id="partner-suggestions">
          {partnerSuggestions.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        {/* Bảng sự vụ */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-auto max-h-[75vh]">
            <table className="text-xs border-collapse min-w-full">
              <thead className="sticky top-0 z-20 bg-gray-100 text-gray-600">
                <tr>
                  <th className={th}></th>
                  <th className={th}>Ngày tạo</th>
                  <th className={`${th} min-w-[260px]`}>Subject · Mã đơn</th>
                  <th className={`${th} min-w-[170px]`}>Tên đối tác</th>
                  <th className={`${th} min-w-[170px]`}>Phân loại khiếu nại</th>
                  <th className={th}>Người KN</th>
                  <th className={th}>Trạng thái</th>
                  <th className={`${th} min-w-[130px]`}>PIC</th>
                  <th className={`${th} min-w-[150px]`}>Partner xác minh</th>
                  <th className={th}>Ngày hoàn thành</th>
                  <th className={th}>Thời gian HT</th>
                  <th className={`${th} min-w-[120px]`}>Kết quả</th>
                  <th className={`${th} min-w-[110px]`}>Case SF</th>
                  <th className={`${th} min-w-[180px]`}>Note</th>
                  <th className={th}>Mail</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={COLS} className="px-4 py-10 text-center text-gray-400">
                      Đang tải...
                    </td>
                  </tr>
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={COLS} className="px-4 py-10 text-center text-gray-400">
                      {cases.length ? "Không có sự vụ khớp bộ lọc." : "Chưa có mail nào — import file .msg để bắt đầu."}
                    </td>
                  </tr>
                ) : (
                  visible.map((c, i) => {
                    const open = expanded.has(c.threadId);
                    const replies = c.messages.length - 1;
                    const partner = partnerOf(c);
                    const save = (f: EditableField) => (v: string) => saveField(c.threadId, f, v);
                    return (
                      <Fragment key={c.threadId}>
                        <tr className={`${i % 2 ? "bg-gray-50/50" : "bg-white"} border-t border-gray-100 align-top`}>
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => toggle(expanded, setExpanded, c.threadId)}
                              title={open ? "Thu gọn" : "Xem nội dung mail"}
                              className="w-6 h-6 rounded hover:bg-gray-200 text-gray-500"
                            >
                              {open ? "▾" : "▸"}
                            </button>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-gray-600 text-center">
                            {fmtDateTime(c.createdAt) || "—"}
                          </td>
                          <td className="px-2 py-2">
                            <div className="font-medium text-gray-800 line-clamp-2" title={c.subject}>
                              {c.subject || "(không có tiêu đề)"}
                            </div>
                            {c.orderCodes.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {c.orderCodes.map((o) => (
                                  <button
                                    key={o}
                                    title="Bấm để copy mã đơn"
                                    onClick={() => {
                                      navigator.clipboard?.writeText(o);
                                      showToast(`✔ Đã copy ${o}`);
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 font-mono text-[10px]"
                                  >
                                    {o}
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <TextCell
                              value={partner}
                              list="partner-suggestions"
                              placeholder={c.partnerEmail || "Nhập tên đối tác"}
                              onSave={save("partnerName")}
                            />
                            <div className="text-[10px] text-gray-400 mt-0.5 truncate" title={c.partnerEmail}>
                              {c.partnerEmail || "không rõ email"}
                              {c.partnerName !== null && <span className="text-amber-600"> · sửa tay</span>}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <SelectCell value={c.category} options={CATEGORIES} onSave={save("category")} />
                          </td>
                          <td className="px-2 py-2">
                            <SelectCell
                              value={c.complainant}
                              options={COMPLAINANTS}
                              onSave={save("complainant")}
                              className="min-w-[80px]"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <SelectCell
                              value={c.status}
                              options={STATUSES}
                              empty={null}
                              onSave={save("status")}
                              className={`font-semibold min-w-[110px] ${STATUS_STYLE[c.status] ?? ""}`}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <SelectCell value={c.pic} options={picOptions} onSave={save("pic")} />
                          </td>
                          <td className="px-2 py-2">
                            <TextCell value={c.partnerVerify} onSave={save("partnerVerify")} />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="datetime-local"
                              defaultValue={toLocalInput(c.completedAt)}
                              key={c.completedAt ?? "none"}
                              onBlur={(e) => {
                                const v = e.target.value ? new Date(e.target.value).toISOString() : "";
                                if ((v || null) !== c.completedAt) saveField(c.threadId, "completedAt", v);
                              }}
                              className={cellInput}
                            />
                          </td>
                          <td className="px-2 py-2 text-center whitespace-nowrap text-gray-700">
                            {durationText(c.createdAt, c.completedAt) || "—"}
                          </td>
                          <td className="px-2 py-2">
                            <SelectCell value={c.result} options={RESULTS} onSave={save("result")} />
                          </td>
                          <td className="px-2 py-2">
                            <TextCell value={c.sfCase} onSave={save("sfCase")} placeholder="Số case" />
                          </td>
                          <td className="px-2 py-2">
                            <TextCell value={c.note} onSave={save("note")} multiline />
                          </td>
                          <td className="px-2 py-2 text-center whitespace-nowrap">
                            <button
                              onClick={() => toggle(expanded, setExpanded, c.threadId)}
                              className="text-teal-700 hover:underline"
                            >
                              {c.messages.length} mail
                            </button>
                          </td>
                        </tr>
                        {open && (
                          <tr className="bg-gray-50">
                            <td></td>
                            <td colSpan={COLS - 1} className="px-2 pb-3 pt-1">
                              <div className="max-w-5xl space-y-2">
                                {c.messages[0] && <MessageView m={c.messages[0]} index={0} total={c.messages.length} />}
                                {replies > 0 && (
                                  <button
                                    onClick={() => toggle(showReplies, setShowReplies, c.threadId)}
                                    className="text-xs font-medium text-teal-700 hover:underline"
                                  >
                                    {showReplies.has(c.threadId) ? "▾ Ẩn" : "▸ Xem"} {replies} phản hồi
                                  </button>
                                )}
                                {showReplies.has(c.threadId) &&
                                  c.messages
                                    .slice(1)
                                    .map((m, k) => (
                                      <MessageView key={k} m={m} index={k + 1} total={c.messages.length} />
                                    ))}
                                <div className="text-[10px] text-gray-400">
                                  Thread ID: <span className="font-mono">{c.threadId}</span>
                                  {c.fileName && <> · File: {c.fileName}</>}
                                  {c.updatedBy && <> · Sửa lần cuối bởi {c.updatedBy}</>}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {showContacts && (
        <ContactsModal
          contacts={contacts}
          suggestions={partnerSuggestions}
          unmapped={Array.from(
            new Set(
              cases
                .filter((c) => c.partnerEmail && !lookupPartner(c.partnerEmail, contactMap))
                .map((c) => c.partnerEmail)
            )
          )}
          onClose={() => setShowContacts(false)}
          onChanged={async (msg) => {
            showToast(msg);
            await load();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-lg bg-gray-900 text-white text-sm px-4 py-2 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function ContactsModal({
  contacts,
  suggestions,
  unmapped,
  onClose,
  onChanged,
}: {
  contacts: Contact[];
  suggestions: string[];
  unmapped: string[];
  onClose: () => void;
  onChanged: (msg: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (e: string, n: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/mail-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, partnerName: n }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setEmail("");
      setName("");
      await onChanged(`✔ Đã lưu ${e} → ${n}`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: string) => {
    if (!confirm(`Xóa ${e} khỏi danh bạ?`)) return;
    setBusy(true);
    await fetch(`/api/mail-contacts?email=${encodeURIComponent(e)}`, { method: "DELETE" });
    setBusy(false);
    await onChanged(`🗑️ Đã xóa ${e}`);
  };

  const inp = "text-sm px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-emerald-500";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">📇 Email người nhận → Tên đối tác</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Dùng để tự điền tên đối tác theo người nhận của mail đầu tiên. Nhập email đầy đủ, hoặc{" "}
              <code>@tenmien.com</code> để áp dụng cho cả tên miền.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-2">
            ×
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@doitac.com hoặc @doitac.com"
            className={`${inp} flex-1 min-w-[200px] font-mono`}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            list="partner-suggestions"
            placeholder="Tên đối tác"
            className={`${inp} flex-1 min-w-[180px]`}
          />
          <button
            disabled={busy || !email.trim() || !name.trim()}
            onClick={() => save(email.trim(), name.trim())}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-semibold disabled:opacity-50"
          >
            Lưu
          </button>
        </div>
        {err && <div className="text-xs text-red-600">⚠️ {err}</div>}

        {unmapped.length > 0 && (
          <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2">
            <b className="text-amber-700">Email chưa gán đối tác:</b>{" "}
            {unmapped.map((e) => (
              <button
                key={e}
                onClick={() => setEmail(e)}
                className="mr-1 mb-1 px-1.5 py-0.5 rounded bg-white border border-amber-300 font-mono hover:bg-amber-100"
              >
                {e}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-auto border border-gray-200 rounded-lg flex-1">
          <table className="text-xs w-full">
            <thead className="bg-gray-100 text-gray-600 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Email / tên miền</th>
                <th className="px-3 py-2 text-left">Tên đối tác</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-gray-400">
                    Chưa có liên hệ nào.
                  </td>
                </tr>
              )}
              {contacts.map((c) => (
                <tr key={c.email} className="border-t border-gray-100">
                  <td className="px-3 py-1.5 font-mono">{c.email}</td>
                  <td className="px-3 py-1.5">{c.partnerName}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEmail(c.email);
                        setName(c.partnerName);
                      }}
                      className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-50 mr-1"
                    >
                      Sửa
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => remove(c.email)}
                      className="px-2 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {suggestions.length === 0 && null}
      </div>
    </div>
  );
}
