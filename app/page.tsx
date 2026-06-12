"use client";
import { useState } from "react";
import FileUpload from "@/components/FileUpload";
import Dashboard from "@/components/Dashboard";
import { ParsedData } from "@/types/data";
export default function Home() {
  const [data, setData] = useState<ParsedData | null>(null);
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <header className="border-b border-slate-700 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-none">Excel Dashboard</h1>
            <p className="text-slate-400 text-xs mt-0.5">Import & Visualize Your Data</p>
          </div>
          {data && <button onClick={() => setData(null)} className="ml-auto text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors">Upload New File</button>}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        {!data ? <FileUpload onDataParsed={setData} /> : <Dashboard data={data} />}
      </main>
      <footer className="text-center py-6 text-slate-500 text-sm">Built with Next.js · Deployed on Vercel</footer>
    </div>
  );
}
