"use client";

import { useState, useEffect, useCallback } from "react";
import FileUpload from "@/components/FileUpload";
import Dashboard from "@/components/Dashboard";
import ColumnConfig from "@/components/ColumnConfig";
import { ParsedData, DatasetMeta } from "@/types/data";
import { Settings } from "lucide-react";

export default function Home() {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [activeData, setActiveData] = useState<ParsedData | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data");
      const { datasets: ds } = await res.json();
      const list: DatasetMeta[] = ds || [];
      setDatasets(list);
      if (list.length > 0) {
        await loadDataset(list[list.length - 1]);
      } else {
        setActiveData(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDataset = async (meta: DatasetMeta) => {
    try {
      const res = await fetch("/api/data/" + meta.id);
      const data = await res.json();
      setActiveData(data);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteDataset = async (id: string) => {
    await fetch("/api/data/" + id, { method: "DELETE" });
    await loadDatasets();
  };

  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="bg-gradient-to-r from-blue-900 to-indigo-900 px-6 py-5 flex items-center justify-between shadow-lg">
        <div>
          <h1 className="text-2xl font-bold text-white">Excel Dashboard</h1>
          <p className="text-blue-300 text-sm mt-0.5">Data visualization &amp; reporting</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowConfig(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition-colors"
          >
            <Settings className="w-4 h-4" />
            Cấu hình cột
          </button>
          {activeData && (
            <button
              onClick={() => setActiveData(null)}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition-colors"
            >
              + Import file mới
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {showConfig && <ColumnConfig onClose={() => setShowConfig(false)} />}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeData ? (
          <Dashboard
            data={activeData}
            datasets={datasets}
            onSelectDataset={loadDataset}
            onDeleteDataset={deleteDataset}
            onImportNew={() => setActiveData(null)}
          />
        ) : (
          <FileUpload onUploadSuccess={loadDatasets} />
        )}
      </main>
    </div>
  );
}
