"use client";
import { useState, useEffect } from "react";
import Dashboard from "@/components/Dashboard";
import FileUpload from "@/components/FileUpload";
import { Upload } from "lucide-react";

export default function Home() {
  const [showModal, setShowModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [user, setUser] = useState<{ username: string, role: string, display_name: string } | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Đang kiểm tra phiên làm việc...");

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(data => {
        if (data.user) setUser(data.user);
        else window.location.href = "/login";
      })
      .catch(() => window.location.href = "/login");
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const handleUploadSuccess = () => {
    setShowModal(false);
    setRefreshKey(k => k + 1);
  };

  if (!user) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">{loadingMsg}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b backdrop-blur sticky top-0 z-40" style={{ background: "#27BDBE", borderColor: "#22a7a8" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2V5a2 2 0 00-2 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="font-semibold text-white">Excel Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            {user.role === "admin" && (
              <a href="/admin" className="text-sm border border-cyan-500/30 hover:bg-cyan-500/10 text-cyan-100 px-3 py-1.5 rounded-lg transition-colors mr-2">
                Quản lý User
              </a>
            )}
            <div className="text-sm text-cyan-50 flex flex-col items-end mr-2">
              <span className="font-medium text-white">{user.display_name || user.username}</span>
              <span className="text-xs opacity-70 capitalize text-cyan-200">{user.role}</span>
            </div>
            <button onClick={handleLogout}
              className="text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg transition-colors mr-3 font-medium">
              Đăng xuất
            </button>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 text-sm bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg transition-colors font-medium">
              <Upload className="w-4 h-4" /> Import file
            </button>
          </div>
        </div>
      </header>

      <main className="w-full">
        <Dashboard onImportNew={() => setShowModal(true)} refreshKey={refreshKey} currentUser={user} />
      </main>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl">
            <div className="flex items-center justify-between px-6 pt-5 pb-2">
              <h3 className="text-white font-semibold text-lg">Import dữ liệu</h3>
              <button onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 pb-6">
              <FileUpload onUploadSuccess={handleUploadSuccess} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
