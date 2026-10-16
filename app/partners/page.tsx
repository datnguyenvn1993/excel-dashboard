"use client";

import { useMemo, useState } from "react";
import AppNav from "@/components/AppNav";
import { MIEN_ORDER, PARTNERS } from "@/lib/partners";
import { usePartnerDirectory } from "@/lib/usePartnerDirectory";
import { formatImportTime } from "@/lib/storage";

interface Row {
  partnerId: string;
  defaultName: string;
  defaultMien: string;
  name: string; // tên hiệu lực (nhập tay > mặc định)
  mien: string;
  manual: boolean; // có bản ghi nhập tay trong DB
  updatedAt?: string;
  updatedBy?: string | null;
  inData: boolean;
}

type Draft = { name: string; mien: string };

const inputCls =
  "w-full text-xs px-2 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-800 focus:outline-none focus:border-emerald-500";

async function saveEntries(entries: { partnerId: string; name: string; mien: string }[]) {
  const res = await fetch("/api/partner-directory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as { saved: number };
}

function MienSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = (MIEN_ORDER as readonly string[]).includes(value) || !value
    ? MIEN_ORDER
    : [...MIEN_ORDER, value];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">— Chọn miền —</option>
      {options.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}

export default function PartnersPage() {
  const { entries, dataIds, loaded, reload } = usePartnerDirectory();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyInData, setOnlyInData] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newMien, setNewMien] = useState("");
  const [bulk, setBulk] = useState("");

  const rows: Row[] = useMemo(() => {
    const manual = new Map(entries.map((e) => [e.partnerId, e]));
    const inData = new Set(dataIds);
    const ids = new Set<string>([...Object.keys(PARTNERS), ...manual.keys(), ...dataIds]);
    return Array.from(ids)
      .map((id) => {
        const d = PARTNERS[id];
        const m = manual.get(id);
        return {
          partnerId: id,
          defaultName: d?.name ?? "",
          defaultMien: d?.mien ?? "",
          name: m?.name || d?.name || "",
          mien: m?.mien || d?.mien || "",
          manual: !!m,
          updatedAt: m?.updatedAt,
          updatedBy: m?.updatedBy,
          inData: inData.has(id),
        };
      })
      .sort(
        (a, b) =>
          Number(!!a.name) - Number(!!b.name) || // chưa có tên lên đầu
          a.name.localeCompare(b.name, "vi") ||
          a.partnerId.localeCompare(b.partnerId)
      );
  }, [entries, dataIds]);

  const missingCount = rows.filter((r) => r.inData && !r.name).length;
  const inDataCount = rows.filter((r) => r.inData).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyInData && !r.inData) return false;
      if (onlyMissing && r.name) return false;
      if (q && !r.partnerId.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [rows, search, onlyMissing, onlyInData]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      await reload();
      setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Có lỗi xảy ra" });
    } finally {
      setBusy(false);
    }
  };

  const draftOf = (r: Row): Draft => drafts[r.partnerId] ?? { name: r.name, mien: r.mien };
  const setDraft = (id: string, d: Draft) => setDrafts((s) => ({ ...s, [id]: d }));
  const isDirty = (r: Row) => {
    const d = drafts[r.partnerId];
    return !!d && (d.name !== r.name || d.mien !== r.mien);
  };

  const saveRow = (r: Row) =>
    run(async () => {
      const d = draftOf(r);
      await saveEntries([{ partnerId: r.partnerId, name: d.name.trim(), mien: d.mien }]);
      setDrafts((s) => {
        const n = { ...s };
        delete n[r.partnerId];
        return n;
      });
      return `Đã lưu ${r.partnerId}`;
    });

  const resetRow = (r: Row) =>
    run(async () => {
      const res = await fetch(`/api/partner-directory?id=${encodeURIComponent(r.partnerId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDrafts((s) => {
        const n = { ...s };
        delete n[r.partnerId];
        return n;
      });
      return `Đã bỏ bản nhập tay của ${r.partnerId}`;
    });

  const addOne = () =>
    run(async () => {
      const id = newId.trim();
      if (!id) throw new Error("Nhập partner_id");
      if (!newName.trim()) throw new Error("Nhập tên hãng");
      await saveEntries([{ partnerId: id, name: newName.trim(), mien: newMien }]);
      setNewId("");
      setNewName("");
      setNewMien("");
      return `Đã thêm ${id}`;
    });

  // Dán nhiều dòng từ Excel: partner_id <Tab> Tên hãng <Tab> Miền (cột Miền không bắt buộc).
  const addBulk = () =>
    run(async () => {
      const parsed = bulk
        .split(/\r?\n/)
        .map((line) => line.split(line.includes("\t") ? "\t" : ",").map((c) => c.trim()))
        .filter((c) => c[0] && c[0].toLowerCase() !== "partner_id")
        .map(([partnerId, name = "", mien = ""]) => ({ partnerId, name, mien }));
      if (parsed.length === 0) throw new Error("Không có dòng hợp lệ");
      const r = await saveEntries(parsed);
      setBulk("");
      return `Đã lưu ${r.saved} partner`;
    });

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="sticky top-0 z-30 border-b shadow-sm px-4 sm:px-6 py-3"
        style={{ background: "#27BDBE", borderColor: "#22a7a8" }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-sm sm:text-base font-bold uppercase tracking-wide text-white">
              🗂 Danh mục partner
            </h1>
            <p className="text-xs text-cyan-50 mt-0.5">
              {loaded
                ? `${inDataCount} partner_id trong dữ liệu · ${missingCount} chưa có tên`
                : "Đang tải..."}
            </p>
          </div>
          <AppNav active="/partners" />
        </div>
      </header>

      <main className="p-4 sm:p-6 space-y-4">
        {msg && (
          <div
            className={`text-sm rounded-lg px-4 py-2 border ${
              msg.ok
                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                : "text-red-600 bg-red-50 border-red-200"
            }`}
          >
            {msg.ok ? "✅ " : "⚠️ "}
            {msg.text}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Thêm một partner */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-700">Thêm / sửa một partner</h2>
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="partner_id"
              className={`${inputCls} font-mono`}
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tên hãng"
              className={inputCls}
            />
            <MienSelect value={newMien} onChange={setNewMien} />
            <button
              disabled={busy}
              onClick={addOne}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-semibold disabled:opacity-50"
            >
              Lưu partner
            </button>
            <p className="text-[11px] text-gray-400">
              partner_id đã có thì tên/miền sẽ được ghi đè.
            </p>
          </div>

          {/* Dán nhiều dòng */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-700">Dán nhiều dòng từ Excel</h2>
            <textarea
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              rows={6}
              placeholder={"partner_id\tTên hãng\tMiền\n061c6fe6-...\tTaxi Bắc Á\tHà Nội"}
              className={`${inputCls} font-mono`}
            />
            <button
              disabled={busy || !bulk.trim()}
              onClick={addBulk}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-semibold disabled:opacity-50"
            >
              Lưu tất cả
            </button>
            <p className="text-[11px] text-gray-400">
              Copy 3 cột partner_id · Tên hãng · Miền từ Excel rồi dán vào đây. Cột Miền có thể bỏ
              trống.
            </p>
          </div>
        </div>

        {/* Danh sách */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 flex-wrap px-3 py-2 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">Danh sách ({visible.length})</h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm partner_id hoặc tên..."
              className="text-xs px-2 py-1.5 rounded-lg border border-gray-300 w-64 focus:outline-none focus:border-emerald-500"
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={onlyMissing}
                onChange={(e) => setOnlyMissing(e.target.checked)}
              />
              Chỉ ID chưa có tên
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={onlyInData}
                onChange={(e) => setOnlyInData(e.target.checked)}
              />
              Chỉ ID có trong dữ liệu
            </label>
          </div>
          <div className="overflow-auto max-h-[70vh]">
            <table className="text-xs border-collapse w-full">
              <thead className="sticky top-0 z-10 bg-gray-100 text-gray-600">
                <tr>
                  {["partner_id", "Tên hãng", "Miền", "Nguồn", ""].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold border-b border-gray-200 text-center">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => {
                  const d = draftOf(r);
                  const dirty = isDirty(r);
                  return (
                    <tr
                      key={r.partnerId}
                      className={`${i % 2 ? "bg-gray-50/50" : ""} ${!r.name ? "bg-amber-50" : ""}`}
                    >
                      <td className="px-3 py-1.5 font-mono text-[11px] text-gray-600 whitespace-nowrap text-center">
                        {r.partnerId}
                      </td>
                      <td className="px-3 py-1.5 min-w-[240px]">
                        <input
                          value={d.name}
                          onChange={(e) => setDraft(r.partnerId, { ...d, name: e.target.value })}
                          placeholder={r.defaultName || "Chưa có tên — nhập vào đây"}
                          className={inputCls}
                        />
                      </td>
                      <td className="px-3 py-1.5 min-w-[150px]">
                        <MienSelect
                          value={d.mien}
                          onChange={(v) => setDraft(r.partnerId, { ...d, mien: v })}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-center text-[11px] text-gray-500 whitespace-nowrap">
                        {r.manual ? (
                          <span title={r.updatedBy ? `bởi ${r.updatedBy}` : undefined}>
                            Nhập tay · {formatImportTime(r.updatedAt)}
                          </span>
                        ) : r.defaultName ? (
                          "Mặc định"
                        ) : (
                          <span className="text-amber-600 font-medium">Chưa có tên</span>
                        )}
                        {!r.inData && <span className="ml-1 text-gray-400">(không có dữ liệu)</span>}
                      </td>
                      <td className="px-3 py-1.5 text-center whitespace-nowrap">
                        <button
                          disabled={busy || !dirty}
                          onClick={() => saveRow(r)}
                          className="px-2.5 py-1 rounded-md bg-emerald-600 text-white disabled:opacity-30"
                        >
                          Lưu
                        </button>
                        {r.manual && (
                          <button
                            disabled={busy}
                            onClick={() => resetRow(r)}
                            title="Xóa bản nhập tay, quay về tên mặc định"
                            className="ml-1 px-2.5 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                          >
                            Bỏ nhập tay
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                      {loaded ? "Không có partner nào khớp bộ lọc." : "Đang tải..."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
