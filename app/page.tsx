"use client";

import { useEffect, useState } from "react";
import { KpiDataset } from "@/types/data";
import { loadData } from "@/lib/storage";
import Dashboard from "@/components/Dashboard";
import FileUpload from "@/components/FileUpload";

export default function Home() {
  const [dataset, setDataset] = useState<KpiDataset | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load any previously-imported data from IndexedDB on mount.
  useEffect(() => {
    let alive = true;
    loadData()
      .then((d) => {
        if (alive) setDataset(d);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleUploaded = (d: KpiDataset) => {
    setDataset(d);
    setShowUpload(false);
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
