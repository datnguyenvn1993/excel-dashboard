"use client";

import { useState, useEffect, useCallback } from "react";
import { ParsedData, DatasetMeta } from "@/types/data";
import Dashboard from "@/components/Dashboard";
import FileUpload from "@/components/FileUpload";

export default function Home() {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [activeData, setActiveData] = useState<ParsedData | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadDatasets = useCallback(async () => {
    try {
      const res = await fetch("/api/data");
      const json = await res.json();
      const list: DatasetMeta[] = json.datasets || [];
      setDatasets(list);
      if (list.length > 0 && !activeData) {
        await loadDataset(list[0]);
      } else if (list.length === 0) {
        setActiveData(null);
        setShowUpload(true);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDataset = async (meta: DatasetMeta) => {
    const res = await fetch(`/api/data/${meta.id}`);
    const json = await res.json();
    setActiveData(json);
    setShowUpload(false);
  };

  const deleteDataset = async (id: string) => {
    await fetch(`/api/data/${id}`, { method: "DELETE" });
    if (activeData?.id === id) setActiveData(null);
    await loadDatasets();
  };

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="font-semibold text-white">Excel Dashboard</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : showUpload || !activeData ? (
          <FileUpload onUploadSuccess={loadDatasets} />
        ) : (
          <Dashboard
            data={activeData}
            datasets={datasets}
            onSelectDataset={loadDataset}
            onDeleteDataset={deleteDataset}
            onImportNew={() => setShowUpload(true)}
          />
        )}
      </main>
    </div>
  );
}
