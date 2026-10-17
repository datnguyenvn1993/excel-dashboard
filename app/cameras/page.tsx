"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppNav, { useIsAdmin } from "@/components/AppNav";
import { Camera, cameraImgUrl } from "@/lib/cameras";

const REFRESH_MS = 10_000;

const timeStr = (t: number) =>
  new Date(t).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });

/**
 * Copy ảnh vào clipboard bằng cách chọn phần tử <img> rồi "copy" (giống chuột phải → Copy image).
 * Không cần đọc pixel nên chạy được với ảnh khác domain không có CORS.
 */
function copyImage(img: HTMLImageElement | null): boolean {
  if (!img || !img.complete || !img.naturalWidth) return false;
  try {
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNode(img);
    sel.addRange(range);
    const ok = document.execCommand("copy");
    sel.removeAllRanges();
    return ok;
  } catch {
    return false;
  }
}

function CameraCard({
  cam,
  tick,
  isAdmin,
  onZoom,
  onEdit,
  onToast,
}: {
  cam: Camera;
  tick: number;
  isAdmin: boolean;
  onZoom: () => void;
  onEdit: () => void;
  onToast: (msg: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <span className="flex-1 text-sm font-semibold text-gray-800 truncate text-center" title={cam.name}>
          {cam.name}
        </span>
        <button
          onClick={() =>
            onToast(
              copyImage(imgRef.current)
                ? "✔ Đã copy ảnh — Ctrl+V để dán gửi đi"
                : "✖ Chưa copy được — chuột phải vào ảnh → Copy image"
            )
          }
          title="Copy ảnh camera này"
          className="px-2 py-1 text-[11px] font-semibold rounded-md bg-orange-500 hover:bg-orange-600 text-white"
        >
          📸 Copy
        </button>
        {isAdmin && (
          <button
            onClick={onEdit}
            title="Sửa camera"
            className="px-2 py-1 text-[11px] rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            ✏️
          </button>
        )}
      </div>
      <button
        onClick={onZoom}
        title="Bấm để phóng to"
        className="relative w-full aspect-[4/3] bg-black flex items-center justify-center cursor-zoom-in"
      >
        {status !== "ok" && (
          <span className="absolute text-xs text-gray-400 px-2 text-center">
            {status === "loading" ? "Đang tải..." : "⚠️ Không tải được ảnh camera này"}
          </span>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={cameraImgUrl(cam.camId, tick)}
          alt={cam.name}
          referrerPolicy="no-referrer"
          onLoad={() => {
            setStatus("ok");
            setLoadedAt(Date.now());
          }}
          onError={() => setStatus("error")}
          className={`w-full h-full object-contain ${status === "error" ? "invisible" : ""}`}
        />
      </button>
      <div className="px-3 py-1 text-[10px] text-gray-400 text-right">
        {loadedAt ? `Cập nhật ${timeStr(loadedAt)}` : " "}
      </div>
    </div>
  );
}

type EditState = { oldCamId: string | null; name: string; camId: string };

export default function CamerasPage() {
  const isAdmin = useIsAdmin() === true;
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  // 0 cho tới khi mount (tránh lệch giờ giữa server render và client).
  const [tick, setTick] = useState(0);
  useEffect(() => setTick(Date.now()), []);
  const [zoom, setZoom] = useState<Camera | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cameras", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setCameras(json.cameras);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách camera");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Tự làm mới mỗi 10 giây; tạm dừng khi tab bị ẩn (đỡ tải ảnh thừa).
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setTick(Date.now());
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") setTick(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [auto]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setZoom(null);
        setEdit(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      const res = await fetch("/api/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          camId: edit.camId.trim(),
          name: edit.name.trim(),
          oldCamId: edit.oldCamId ?? undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showToast(`✔ Đã lưu camera: ${edit.name.trim()}`);
      setEdit(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!edit?.oldCamId) return;
    if (!confirm(`Xoá camera "${edit.name}" khỏi danh sách?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cameras?id=${encodeURIComponent(edit.oldCamId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast("🗑️ Đã xoá camera");
      setEdit(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Xoá thất bại");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full text-sm px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-emerald-500";

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="sticky top-0 z-30 border-b shadow-sm px-4 sm:px-6 py-3"
        style={{ background: "#27BDBE", borderColor: "#22a7a8" }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-sm sm:text-base font-bold uppercase tracking-wide text-white">
              🚦 Camera giao thông TP.HCM
            </h1>
            <p className="text-xs text-cyan-50 mt-0.5">
              {cameras.length} camera · {auto ? "tự làm mới mỗi 10 giây" : "đã tắt tự làm mới"}
              {tick > 0 && ` · lần cuối ${timeStr(tick)}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-white">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Tự làm mới
            </label>
            <button
              onClick={() => setTick(Date.now())}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/15 hover:bg-white/25 text-white border border-white/30"
            >
              🔄 Làm mới
            </button>
            {isAdmin && (
              <button
                onClick={() => setEdit({ oldCamId: null, name: "", camId: "" })}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-teal-700 hover:bg-cyan-50 shadow-sm"
              >
                ➕ Thêm camera
              </button>
            )}
            <AppNav active="/cameras" />
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            ⚠️ {error}
          </div>
        )}
        {loading ? (
          <p className="text-center text-gray-400 py-16">Đang tải danh sách camera...</p>
        ) : tick === 0 ? null : cameras.length === 0 ? (
          <p className="text-center text-gray-400 py-16">Chưa có camera nào.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {cameras.map((c) => (
              <CameraCard
                key={c.camId}
                cam={c}
                tick={tick}
                isAdmin={isAdmin}
                onZoom={() => setZoom(c)}
                onEdit={() => setEdit({ oldCamId: c.camId, name: c.name, camId: c.camId })}
                onToast={showToast}
              />
            ))}
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-4 text-center">
          Nguồn ảnh: giaothong.hochiminhcity.gov.vn · Bấm vào ảnh để phóng to · 📸 Copy rồi Ctrl+V để dán
          gửi đi
        </p>
      </main>

      {/* Phóng to */}
      {zoom && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setZoom(null)}
        >
          <div className="text-white text-sm font-semibold mb-2">
            {zoom.name} · cập nhật {timeStr(tick)}{" "}
            <span className="text-white/50 font-normal">(bấm ra ngoài hoặc Esc để đóng)</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cameraImgUrl(zoom.camId, tick)}
            alt={zoom.name}
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Thêm / sửa camera (admin) */}
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-gray-800">
              {edit.oldCamId ? "✏️ Sửa camera" : "➕ Thêm camera"}
            </h2>
            <label className="block text-xs text-gray-500">
              Tên hiển thị
              <input
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                placeholder="VD: Ngã tư Hàng Xanh"
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className="block text-xs text-gray-500">
              ID camera (lấy từ web Sở GTVT)
              <input
                value={edit.camId}
                onChange={(e) => setEdit({ ...edit, camId: e.target.value })}
                placeholder="VD: 56f8d743025e9511002786c5"
                className={`${inputCls} mt-1 font-mono`}
              />
            </label>
            {edit.camId.trim().length >= 6 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cameraImgUrl(edit.camId.trim(), tick)}
                alt="Xem trước"
                referrerPolicy="no-referrer"
                className="w-full aspect-[4/3] object-contain bg-black rounded-lg"
              />
            )}
            <div className="flex items-center gap-2 pt-2">
              <button
                disabled={busy || !edit.name.trim() || !edit.camId.trim()}
                onClick={save}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-semibold disabled:opacity-50"
              >
                💾 Lưu
              </button>
              {edit.oldCamId && (
                <button
                  disabled={busy}
                  onClick={remove}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold disabled:opacity-50"
                >
                  🗑️ Xoá
                </button>
              )}
              <button
                onClick={() => setEdit(null)}
                className="ml-auto px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-lg bg-gray-900 text-white text-sm px-4 py-2 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
