"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AppNav from "@/components/AppNav";
import {
  DOC_ICON,
  DOC_LABEL,
  LANE_COLORS,
  Lane,
  Step,
  Workflow,
  WorkflowData,
  WorkflowDoc,
  canEditWorkflow,
  docKindFromUrl,
  emptyData,
} from "@/lib/workflows";

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const emptyStep = (laneId: string): Step => ({
  id: uid("s"),
  laneId,
  title: "Bước mới",
  sla: "",
  note: "",
  mailSubject: "",
  mailBody: "",
  notify: "",
  rule: "",
  docs: [],
});

type Tab = "note" | "mail" | "notify" | "rule" | "docs";
const TABS: { key: Tab; label: string }[] = [
  { key: "note", label: "📝 Ghi chú" },
  { key: "mail", label: "✉️ Mẫu mail" },
  { key: "notify", label: "🔔 Thông báo" },
  { key: "rule", label: "⚖️ Quy tắc" },
  { key: "docs", label: "📎 Tài liệu" },
];

export default function WorkflowsPage() {
  // Manager/Admin sửa mọi quy trình; user thường chỉ sửa quy trình được cấp quyền (editors).
  const [role, setRole] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [users, setUsers] = useState<{ username: string; displayName: string }[]>([]);
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        setRole(j?.user?.role ?? "");
        setUsername(j?.user?.username ?? "");
      })
      .catch(() => setRole(""));
    fetch("/api/mail-cases/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((j) => setUsers(j.users ?? []))
      .catch(() => {});
  }, []);
  const isManager = role === "admin" || role === "manager";

  const [list, setList] = useState<Workflow[]>([]);
  const [curId, setCurId] = useState<string | null>(null);
  const [wf, setWf] = useState<Workflow | null>(null); // bản đang xem/sửa (local)
  const [dirty, setDirty] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selStep, setSelStep] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("note");
  const [toast, setToast] = useState<string | null>(null);
  const [showEditors, setShowEditors] = useState(false);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async (selectId?: string) => {
    try {
      const j = await fetch("/api/workflows", { cache: "no-store" }).then((r) => r.json());
      const wfs: Workflow[] = j.workflows ?? [];
      setList(wfs);
      setCurId((prev) => selectId ?? prev ?? wfs[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Khi đổi quy trình đang chọn → nạp bản local mới.
  useEffect(() => {
    const found = list.find((w) => w.id === curId) ?? null;
    setWf(found ? structuredClone(found) : null);
    setDirty(false);
    setSelStep(null);
  }, [curId, list]);

  const mutate = (fn: (d: WorkflowData) => void) => {
    setWf((w) => {
      if (!w) return w;
      const n = structuredClone(w);
      fn(n.data);
      return n;
    });
    setDirty(true);
  };
  const patchStep = (id: string, patch: Partial<Step>) =>
    mutate((d) => {
      const s = d.steps.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    });

  const save = async () => {
    if (!wf) return;
    setSaving(true);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: wf.id, name: wf.name, description: wf.description, data: wf.data, editors: wf.editors }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setDirty(false);
      showToast("✔ Đã lưu quy trình");
      await load(j.id ?? wf.id);
    } catch (e) {
      showToast(`✖ ${e instanceof Error ? e.message : "Lưu thất bại"}`);
    } finally {
      setSaving(false);
    }
  };

  const createWorkflow = async () => {
    const name = prompt("Tên quy trình mới:", "Quy trình mới");
    if (!name?.trim()) return;
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: "", data: emptyData(), editors: [] }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(`✖ ${j.error ?? "Lỗi"}`);
    await load(j.id);
    setEditMode(true);
  };

  const deleteWorkflow = async () => {
    if (!wf) return;
    if (!confirm(`Xóa quy trình "${wf.name}"? Không thể hoàn tác.`)) return;
    await fetch(`/api/workflows?id=${encodeURIComponent(wf.id)}`, { method: "DELETE" });
    setCurId(null);
    await load();
    showToast("🗑️ Đã xóa quy trình");
  };

  const canEdit = canEditWorkflow(role, username, wf?.editors);
  const selected = wf?.data.steps.find((s) => s.id === selStep) ?? null;
  const laneOf = (id: string) => wf?.data.lanes.find((l) => l.id === id);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header
        className="sticky top-0 z-30 border-b shadow-sm px-4 sm:px-6 py-3"
        style={{ background: "#27BDBE", borderColor: "#22a7a8" }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-sm sm:text-base font-bold uppercase tracking-wide text-white">
              🧭 Quy trình xử lý (Workflow)
            </h1>
            <p className="text-xs text-cyan-50 mt-0.5">
              Ma trận phân công: cột = bên liên quan · hàng = các bước · mũi tên = luồng xử lý
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {wf && canEdit && (
              <>
                <button
                  onClick={() => setEditMode((v) => !v)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                    editMode ? "bg-amber-400 text-amber-900" : "bg-white/15 text-white border border-white/30"
                  }`}
                >
                  {editMode ? "✓ Đang chỉnh sửa" : "✏️ Chỉnh sửa"}
                </button>
                <button
                  onClick={() => setShowEditors(true)}
                  title="Cấp quyền sửa quy trình này cho user"
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/15 text-white border border-white/30"
                >
                  👥 Phân quyền{wf.editors.length ? ` (${wf.editors.length})` : ""}
                </button>
                <button
                  onClick={save}
                  disabled={!dirty || saving}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-teal-700 shadow-sm disabled:opacity-40"
                >
                  {saving ? "Đang lưu..." : dirty ? "💾 Lưu *" : "💾 Đã lưu"}
                </button>
              </>
            )}
            <AppNav active="/workflows" />
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar danh sách quy trình */}
        <aside className="w-60 bg-white border-r border-gray-200 p-3 overflow-auto shrink-0">
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Quy trình ({list.length})
            </h2>
          </div>
          {loading ? (
            <p className="text-xs text-gray-400 px-1">Đang tải...</p>
          ) : (
            list.map((w) => (
              <button
                key={w.id}
                onClick={() => setCurId(w.id)}
                className={`w-full text-left p-2.5 rounded-lg border mb-1.5 ${
                  w.id === curId ? "border-teal-400 bg-cyan-50" : "border-gray-100 hover:bg-gray-50"
                }`}
              >
                <div className="text-sm font-semibold text-gray-800">{w.name}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {w.data.steps.length} bước · {w.data.lanes.length} bên
                </div>
              </button>
            ))
          )}
          {isManager && (
            <button
              onClick={createWorkflow}
              className="w-full mt-2 p-2.5 border-2 border-dashed border-gray-300 rounded-lg text-teal-700 font-semibold text-xs hover:bg-gray-50"
            >
              ➕ Quy trình mới
            </button>
          )}
          {!loading && list.length === 0 && !isManager && (
            <p className="text-xs text-gray-400 px-1 mt-2">Chưa có quy trình nào.</p>
          )}
        </aside>

        {/* Bảng ma trận */}
        <section className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {!wf ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              {loading ? "" : "Chọn một quy trình ở bên trái, hoặc tạo quy trình mới."}
            </div>
          ) : (
            <Board
              wf={wf}
              editMode={editMode && canEdit}
              canDelete={isManager}
              selStep={selStep}
              onSelect={(id) => {
                setSelStep(id);
                setTab("note");
              }}
              onRename={(name) => {
                setWf((w) => (w ? { ...w, name } : w));
                setDirty(true);
              }}
              onDelete={deleteWorkflow}
              mutate={mutate}
              newStep={emptyStep}
            />
          )}
        </section>

        {/* Panel chi tiết bước */}
        {wf && selected && (
          <StepPanel
            step={selected}
            lane={laneOf(selected.laneId)}
            canEdit={editMode && canEdit}
            tab={tab}
            setTab={setTab}
            onClose={() => setSelStep(null)}
            onChange={(patch) => patchStep(selected.id, patch)}
            onToast={showToast}
          />
        )}
      </div>

      {showEditors && wf && (
        <EditorsModal
          editors={wf.editors}
          users={users}
          onClose={() => setShowEditors(false)}
          onToggle={(uname) => {
            setWf((w) =>
              w
                ? { ...w, editors: w.editors.includes(uname) ? w.editors.filter((x) => x !== uname) : [...w.editors, uname] }
                : w
            );
            setDirty(true);
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

// ─── Bảng swimlane + mũi tên ─────────────────────────────────────────────────
function Board({
  wf,
  editMode,
  canDelete,
  selStep,
  onSelect,
  onRename,
  onDelete,
  mutate,
  newStep,
}: {
  wf: Workflow;
  editMode: boolean;
  canDelete: boolean;
  selStep: string | null;
  onSelect: (id: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  mutate: (fn: (d: WorkflowData) => void) => void;
  newStep: (laneId: string) => Step;
}) {
  const { lanes, steps } = wf.data;
  const boardRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [dim, setDim] = useState({ w: 0, h: 0 });

  // Vẽ mũi tên bước N → N+1 dựa trên vị trí thẻ thật.
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const compute = () => {
      const b = board.getBoundingClientRect();
      const pt = (id: string, edge: "top" | "bottom") => {
        const el = board.querySelector<HTMLElement>(`[data-step="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: r.left - b.left + board.scrollLeft + r.width / 2,
          y: r.top - b.top + board.scrollTop + (edge === "top" ? 0 : r.height),
        };
      };
      const ps: string[] = [];
      for (let i = 0; i < steps.length - 1; i++) {
        const a = pt(steps[i].id, "bottom");
        const c = pt(steps[i + 1].id, "top");
        if (!a || !c) continue;
        const my = (a.y + c.y) / 2;
        ps.push(`M ${a.x} ${a.y} C ${a.x} ${my}, ${c.x} ${my}, ${c.x} ${c.y}`);
      }
      setPaths(ps);
      setDim({ w: board.scrollWidth, h: board.scrollHeight });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(board);
    return () => ro.disconnect();
  }, [steps, lanes]);

  const laneIndex = useMemo(() => new Map(lanes.map((l, i) => [l.id, i])), [lanes]);
  const colW = 232;
  const gap = 26;

  return (
    <div ref={boardRef} className="flex-1 overflow-auto p-5 relative">
      <div className="flex items-center gap-2 mb-3">
        {editMode ? (
          <input
            value={wf.name}
            onChange={(e) => onRename(e.target.value)}
            className="text-base font-bold text-gray-800 border-b border-dashed border-gray-300 focus:outline-none focus:border-emerald-500 bg-transparent"
          />
        ) : (
          <h2 className="text-base font-bold text-gray-800">{wf.name}</h2>
        )}
        {wf.updatedBy && (
          <span className="text-[11px] text-gray-400">· sửa bởi {wf.updatedBy}</span>
        )}
        {editMode && canDelete && (
          <button
            onClick={onDelete}
            className="ml-auto text-xs text-red-600 border border-red-200 rounded-md px-2 py-1 hover:bg-red-50"
          >
            🗑 Xóa quy trình
          </button>
        )}
      </div>

      {lanes.length === 0 ? (
        <div className="text-sm text-gray-400 py-10 text-center">
          Chưa có cột (bên liên quan).
          {editMode && " Bấm ➕ Thêm bên bên dưới để bắt đầu."}
          {editMode && (
            <div className="mt-3">
              <AddLaneButton mutate={mutate} count={lanes.length} />
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Header các cột */}
          <div className="grid gap-[26px]" style={{ gridTemplateColumns: `repeat(${lanes.length}, ${colW}px)` }}>
            {lanes.map((l) => (
              <LaneHead key={l.id} lane={l} editMode={editMode} mutate={mutate} />
            ))}
          </div>

          {/* Mũi tên */}
          <svg
            className="absolute left-5 pointer-events-none"
            style={{ top: 0, width: dim.w, height: dim.h, zIndex: 1 }}
          >
            <defs>
              <marker id="wf-ah" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
              </marker>
            </defs>
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#94a3b8" strokeWidth={2} markerEnd="url(#wf-ah)" />
            ))}
          </svg>

          {/* Các bước theo hàng */}
          <div className="relative mt-2" style={{ zIndex: 2 }}>
            {steps.map((s, i) => {
              const li = laneIndex.get(s.laneId) ?? 0;
              const lane = lanes[li];
              return (
                <div key={s.id} className="relative" style={{ height: 104 }}>
                  <div
                    data-step={s.id}
                    onClick={() => onSelect(s.id)}
                    style={{ left: li * (colW + gap), width: colW }}
                    className={`absolute top-3 cursor-pointer rounded-xl bg-white border p-2.5 shadow-sm ${
                      selStep === s.id ? "border-amber-400 ring-2 ring-amber-300" : "border-gray-200 hover:border-teal-300"
                    }`}
                  >
                    <div
                      className="absolute -top-2.5 -left-2.5 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center shadow"
                      style={{ background: lane?.color ?? "#64748b" }}
                    >
                      {i + 1}
                    </div>
                    <div className="text-[12.5px] font-semibold text-gray-800 leading-tight">{s.title}</div>
                    <div className="text-[10.5px] text-gray-500 mt-0.5">{lane?.name}</div>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {s.note && <Badge>📝</Badge>}
                      {(s.mailSubject || s.mailBody) && <Badge on>✉️</Badge>}
                      {s.notify && <Badge on>🔔</Badge>}
                      {s.rule && <Badge on>⚖️</Badge>}
                      {s.docs.length > 0 && <Badge on>📎 {s.docs.length}</Badge>}
                      {s.sla && <Badge sla>SLA {s.sla}</Badge>}
                    </div>
                    {editMode && (
                      <div className="flex gap-1 mt-1.5" onClick={(e) => e.stopPropagation()}>
                        <MiniBtn title="Lên" onClick={() => mutate((d) => moveStep(d, i, -1))}>▲</MiniBtn>
                        <MiniBtn title="Xuống" onClick={() => mutate((d) => moveStep(d, i, 1))}>▼</MiniBtn>
                        <select
                          value={s.laneId}
                          onChange={(e) =>
                            mutate((d) => {
                              const st = d.steps.find((x) => x.id === s.id);
                              if (st) st.laneId = e.target.value;
                            })
                          }
                          className="text-[10px] border border-gray-200 rounded px-1 py-0.5"
                        >
                          {lanes.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                        <MiniBtn
                          title="Xóa bước"
                          onClick={() => mutate((d) => (d.steps = d.steps.filter((x) => x.id !== s.id)))}
                        >
                          🗑
                        </MiniBtn>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {editMode && (
            <div className="flex gap-2 mt-4 flex-wrap">
              <select
                id="wf-add-lane-sel"
                className="text-xs border border-gray-300 rounded-lg px-2 py-1.5"
                defaultValue={lanes[0]?.id}
              >
                {lanes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const sel = document.getElementById("wf-add-lane-sel") as HTMLSelectElement;
                  mutate((d) => d.steps.push(newStep(sel?.value ?? lanes[0].id)));
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              >
                ➕ Thêm bước
              </button>
              <AddLaneButton mutate={mutate} count={lanes.length} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function moveStep(d: WorkflowData, i: number, dir: number) {
  const j = i + dir;
  if (j < 0 || j >= d.steps.length) return;
  [d.steps[i], d.steps[j]] = [d.steps[j], d.steps[i]];
}

function AddLaneButton({ mutate, count }: { mutate: (fn: (d: WorkflowData) => void) => void; count: number }) {
  return (
    <button
      onClick={() => {
        const name = prompt("Tên bên liên quan (vd. CSKH, Đối tác, QLCL):");
        if (!name?.trim()) return;
        mutate((d) =>
          d.lanes.push({ id: uid("l"), name: name.trim(), color: LANE_COLORS[count % LANE_COLORS.length] })
        );
      }}
      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
    >
      ➕ Thêm bên
    </button>
  );
}

function LaneHead({
  lane,
  editMode,
  mutate,
}: {
  lane: Lane;
  editMode: boolean;
  mutate: (fn: (d: WorkflowData) => void) => void;
}) {
  return (
    <div>
      <div className="rounded-lg px-2 py-2 text-center text-white font-bold text-[13px]" style={{ background: lane.color }}>
        {editMode ? (
          <input
            value={lane.name}
            onChange={(e) =>
              mutate((d) => {
                const l = d.lanes.find((x) => x.id === lane.id);
                if (l) l.name = e.target.value;
              })
            }
            className="bg-transparent text-center w-full focus:outline-none placeholder-white/70"
          />
        ) : (
          lane.name
        )}
      </div>
      {editMode && (
        <div className="flex items-center justify-center gap-1 mt-1">
          {LANE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() =>
                mutate((d) => {
                  const l = d.lanes.find((x) => x.id === lane.id);
                  if (l) l.color = c;
                })
              }
              className={`w-3.5 h-3.5 rounded-full ${lane.color === c ? "ring-2 ring-offset-1 ring-gray-400" : ""}`}
              style={{ background: c }}
            />
          ))}
          <button
            onClick={() => {
              if (!confirm(`Xóa cột "${lane.name}"? Các bước thuộc cột sẽ chuyển sang cột đầu tiên.`)) return;
              mutate((d) => {
                d.lanes = d.lanes.filter((x) => x.id !== lane.id);
                const fallback = d.lanes[0]?.id ?? "";
                d.steps.forEach((s) => s.laneId === lane.id && (s.laneId = fallback));
              });
            }}
            className="text-[11px] text-red-500 ml-1"
            title="Xóa cột"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function Badge({ children, on, sla }: { children: React.ReactNode; on?: boolean; sla?: boolean }) {
  const cls = sla
    ? "bg-orange-50 text-orange-700 border-orange-200"
    : on
      ? "bg-cyan-50 text-cyan-700 border-cyan-200"
      : "bg-gray-100 text-gray-500 border-gray-200";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${cls}`}>{children}</span>;
}

function MiniBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="text-[11px] w-6 h-6 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 flex items-center justify-center"
    >
      {children}
    </button>
  );
}

// ─── Panel chi tiết bước ─────────────────────────────────────────────────────
function StepPanel({
  step,
  lane,
  canEdit,
  tab,
  setTab,
  onClose,
  onChange,
  onToast,
}: {
  step: Step;
  lane: Lane | undefined;
  canEdit: boolean;
  tab: Tab;
  setTab: (t: Tab) => void;
  onClose: () => void;
  onChange: (patch: Partial<Step>) => void;
  onToast: (m: string) => void;
}) {
  const ta = "w-full text-sm px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-emerald-500";

  return (
    <aside className="w-[360px] bg-white border-l border-gray-200 flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold" style={{ color: lane?.color ?? "#0e7490" }}>
            {lane?.name ?? "—"}
          </div>
          {canEdit ? (
            <input
              value={step.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="text-[15px] font-bold text-gray-800 w-full border-b border-dashed focus:outline-none focus:border-emerald-500"
            />
          ) : (
            <div className="text-[15px] font-bold text-gray-800">{step.title}</div>
          )}
          <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
            SLA:
            {canEdit ? (
              <input
                value={step.sla}
                onChange={(e) => onChange({ sla: e.target.value })}
                placeholder="vd. 4h"
                className="w-16 border border-gray-200 rounded px-1 py-0.5 text-[11px]"
              />
            ) : (
              <b>{step.sla || "—"}</b>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
          ×
        </button>
      </div>

      <div className="flex gap-1 px-3 pt-2 border-b border-gray-100 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-[12px] px-2.5 py-1.5 rounded-t-lg font-medium ${
              tab === t.key ? "bg-cyan-50 text-cyan-700" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 overflow-auto text-sm flex-1">
        {tab === "note" && (
          <Field
            canEdit={canEdit}
            value={step.note}
            onChange={(v) => onChange({ note: v })}
            placeholder="Hướng dẫn, lưu ý cho bước này..."
            rows={10}
          />
        )}
        {tab === "mail" && (
          <div className="space-y-3">
            <div>
              <Label>Tiêu đề mail</Label>
              {canEdit ? (
                <input
                  value={step.mailSubject}
                  onChange={(e) => onChange({ mailSubject: e.target.value })}
                  placeholder="[Xác minh] Khiếu nại {{mã_đơn}} – {{đối_tác}}"
                  className={ta}
                />
              ) : (
                <div className="text-sm text-gray-800">{step.mailSubject || "—"}</div>
              )}
            </div>
            <div>
              <Label>Nội dung mail</Label>
              <Field
                canEdit={canEdit}
                value={step.mailBody}
                onChange={(v) => onChange({ mailBody: v })}
                placeholder="Soạn mẫu mail. Dùng {{mã_đơn}}, {{đối_tác}}, {{PIC}}... để nhắc chỗ cần điền."
                rows={10}
                mono
              />
            </div>
            {(step.mailSubject || step.mailBody) && (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(`${step.mailSubject}\n\n${step.mailBody}`);
                  onToast("✔ Đã copy mẫu mail");
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                📋 Copy mẫu mail
              </button>
            )}
          </div>
        )}
        {tab === "notify" && (
          <Field
            canEdit={canEdit}
            value={step.notify}
            onChange={(v) => onChange({ notify: v })}
            placeholder="Khi nào gửi thông báo, cho ai (vd. nhắc PIC nếu quá SLA)..."
            rows={10}
          />
        )}
        {tab === "rule" && (
          <Field
            canEdit={canEdit}
            value={step.rule}
            onChange={(v) => onChange({ rule: v })}
            placeholder="Điều kiện chuyển bước (vd. nếu 'Phạt đối tác' → qua bước BLĐ phê duyệt)..."
            rows={10}
          />
        )}
        {tab === "docs" && (
          <DocsTab step={step} canEdit={canEdit} onChange={onChange} onToast={onToast} />
        )}
      </div>
    </aside>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">{children}</div>;
}

function Field({
  canEdit,
  value,
  onChange,
  placeholder,
  rows,
  mono,
}: {
  canEdit: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
}) {
  if (canEdit) {
    return (
      <textarea
        value={value}
        rows={rows ?? 6}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full text-sm px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-emerald-500 resize-y ${
          mono ? "font-mono" : ""
        }`}
      />
    );
  }
  return value ? (
    <pre className={`whitespace-pre-wrap text-sm text-gray-800 ${mono ? "font-mono" : "font-sans"}`}>{value}</pre>
  ) : (
    <p className="text-sm text-gray-400">(trống)</p>
  );
}

// ─── Tab Tài liệu: ảnh (upload) + link gsheet/gdoc ───────────────────────────
function DocsTab({
  step,
  canEdit,
  onChange,
  onToast,
}: {
  step: Step;
  canEdit: boolean;
  onChange: (patch: Partial<Step>) => void;
  onToast: (m: string) => void;
}) {
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [uploading, setUploading] = useState(false);

  const addDoc = (doc: WorkflowDoc) => onChange({ docs: [...step.docs, doc] });
  const removeDoc = (i: number) => onChange({ docs: step.docs.filter((_, k) => k !== i) });

  const addLink = () => {
    const url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) return onToast("✖ Link phải bắt đầu http(s)://");
    addDoc({ kind: docKindFromUrl(url), url, name: linkName.trim() || url });
    setLinkUrl("");
    setLinkName("");
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const { upload } = await import("@vercel/blob/client");
      const res = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/workflow-upload",
      });
      addDoc({ kind: "image", url: res.url, name: file.name });
      onToast("✔ Đã tải ảnh lên");
    } catch (e) {
      onToast(`✖ ${e instanceof Error ? e.message : "Tải ảnh lỗi"}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {step.docs.length === 0 && <p className="text-sm text-gray-400">Chưa có tài liệu.</p>}
      <div className="space-y-2">
        {step.docs.map((d, i) => (
          <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
            {d.kind === "image" ? (
              <a href={d.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.url} alt={d.name} className="w-full max-h-52 object-contain bg-gray-50" />
              </a>
            ) : null}
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <span>{DOC_ICON[d.kind]}</span>
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-xs text-teal-700 hover:underline truncate"
                title={d.url}
              >
                {d.name}
              </a>
              <span className="text-[10px] text-gray-400">{DOC_LABEL[d.kind]}</span>
              {canEdit && (
                <button onClick={() => removeDoc(i)} className="text-red-500 text-xs">
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="space-y-3 pt-2 border-t border-gray-100">
          <div>
            <Label>Tải ảnh (chụp màn hình, ảnh bằng chứng...)</Label>
            <label className="inline-block text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 cursor-pointer">
              {uploading ? "Đang tải..." : "🖼️ Chọn ảnh"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) uploadImage(f);
                }}
              />
            </label>
          </div>
          <div>
            <Label>Dán link Google Sheet / Doc / Excel / Word</Label>
            <div className="space-y-2">
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://docs.google.com/..."
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <div className="flex gap-2">
                <input
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  placeholder="Tên hiển thị (tùy chọn)"
                  className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={addLink}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  + Thêm link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Phân quyền sửa cho user ─────────────────────────────────────────────────
function EditorsModal({
  editors,
  users,
  onClose,
  onToggle,
}: {
  editors: string[];
  users: { username: string; displayName: string }[];
  onClose: () => void;
  onToggle: (username: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = users.filter(
    (u) => !q.trim() || `${u.username} ${u.displayName}`.toLowerCase().includes(q.trim().toLowerCase())
  );
  return (
    <div className="fixed inset-0 z-[55] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-3 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-base font-bold text-gray-800">👥 Phân quyền sửa quy trình</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Các user được chọn sẽ sửa được <b>riêng quy trình này</b>, không ảnh hưởng quy trình khác. Manager/Admin
            luôn sửa được mọi quy trình. Nhớ bấm <b>💾 Lưu</b> sau khi chỉnh.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm user..."
          className="text-sm px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-emerald-500"
        />
        <div className="overflow-auto border border-gray-200 rounded-lg flex-1">
          {list.length === 0 && <p className="text-xs text-gray-400 p-3 text-center">Không có user.</p>}
          {list.map((u) => (
            <label key={u.username} className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={editors.includes(u.username)} onChange={() => onToggle(u.username)} className="w-4 h-4 accent-teal-600" />
              <span className="text-sm text-gray-800">{u.displayName || u.username}</span>
              <span className="text-[11px] text-gray-400 ml-auto font-mono">{u.username}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}
