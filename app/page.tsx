"use client";

import { useState, useEffect } from "react";
import { ParsedData } from "@/types/data";
import Dashboard from "@/components/Dashboard";
import FileUpload from "@/components/FileUpload";

const STORAGE_KEY = "excel-dashboard-data";

export default function Home() {
  const [activeData, setActiveData] = useState<ParsedData | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load persisted data from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setActiveData(JSON.parse(stored));
      } else {
        setShowUpload(true);
      }
    } catch {
      setShowUpload(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUploadSuccess = (data: ParsedData) => {
    setActiveData(data);
    setShowUpload(false);
  };

  const handleClearData = (_id: string = "") => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setActiveData(null);
    setShowUpload(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <span className="font-semibold text-white">Excel Dashboard</span>
          </div>
          {activeData && !showUpload && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Import mới
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : showUpload || !activeData ? (
          <FileUpload onUploadSuccess={handleUploadSuccess} />
        ) : (
          <Dashboard
            data={activeData}
            datasets={[]}
            onSelectDataset={() => {}}
            onDeleteDataset={handleClearData}
            onImportNew={() => setShowUpload(true)}
          />
        )}
      </main>
    </div>
  );
}
