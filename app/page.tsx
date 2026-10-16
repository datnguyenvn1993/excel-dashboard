"use client";

import { useEffect, useState } from "react";
import { KpiDataset } from "@/types/data";
import { fetchServerData, loadData, saveData } from "@/lib/storage";
import Dashboard from "@/components/Dashboard";
import FileUpload from "@/components/FileUpload";

export default function Home() {
  const [dataset, setDataset] = useState<KpiDataset | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load data from the server (shared for all users). Show the IndexedDB cache
  // first for a fast paint, then replace it with the server copy.
  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await loadData().catch(() => null);
      if (alive && cached) {
        setDataset(cached);
        setLoading(false);
      }
      try {
        const server = await fetchServerData();
        if (!alive) return;
        setDataset(server);
        if (server) saveData(server).catch(() => {});
      } catch (e) {
        console.error("Không tải được dữ liệu từ server, dùng bản cache:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const [notice, setNotice] = useState<string | null>(null);

  const handleUploaded = (
    d: KpiDataset,
    r: { inserted: number; updated: number }
  ) => {
    setDataset(d);
    setShowUpload(false);
    setNotice(
      `Đã lưu lên server: ${r.inserted.toLocaleString("vi-VN")} dòng mới, ${r.updated.toLocaleString("vi-VN")} dòng ghi đè.`
    );
    setTimeout(() => setNotice(null), 6000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Dashboard is always the main page (empty state when no data). */}
      <Dashboard dataset={dataset} onImportNew={() => setShowUpload(true)} />

      {notice && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-emerald-600 text-white text-sm px-4 py-3 shadow-lg">
          ✅ {notice}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <FileUpload onUploaded={handleUploaded} onClose={() => setShowUpload(false)} />
          </div>
        </div>
      )}
    </>
  );
}
