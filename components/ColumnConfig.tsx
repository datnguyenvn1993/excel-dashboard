"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2 } from "lucide-react";

interface ColumnConfigProps {
  onClose: () => void;
}

export default function ColumnConfig({ onClose }: ColumnConfigProps) {
  const [columns, setColumns] = useState<string[]>([]);
  const [createDateColumn, setCreateDateColumn] = useState("Create Date");
  const [newColumn, setNewColumn] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => {
        setColumns(cfg.columns || []);
        setCreateDateColumn(cfg.createDateColumn || "Create Date");
        setLoading(false);
      });
  }, []);

  const addColumn = () => {
    const t = newColumn.trim();
    if (t && !columns.includes(t)) {
      setColumns([...columns, t]);
      setNewColumn("");
    }
  };

  const save = async () => {
    setSaving(true);
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columns, createDateColumn }),
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Cấu hình cột dữ liệu</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2">
                Tên cột &quot;Create Date&quot;
              </label>
              <input
                value={createDateColumn}
                onChange={(e) => setCreateDateColumn(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                placeholder="ví dụ: Create Date"
              />
              <p className="text-slate-500 text-xs mt-1">Dùng để tính TTL 10 ngày — cột này phải có trong file Excel</p>
            </div>

            <div>
              <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1">
                Các cột cần giữ khi import
              </label>
              <p className="text-slate-500 text-xs mb-3">
                Để trống = giữ tất cả cột. Khi có danh sách, chỉ những cột này được import (tìm theo tên, không phụ thuộc vị trí cột).
              </p>
              <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                {columns.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-3">Chưa có cột nào — sẽ import tất cả</p>
                )}
                {columns.map((col) => (
                  <div key={col} className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                    <span className="text-white text-sm">{col}</span>
                    <button onClick={() => setColumns(columns.filter((c) => c !== col))} className="text-slate-400 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newColumn}
                  onChange={(e) => setNewColumn(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addColumn()}
                  className="flex-1 bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Tên cột..."
                />
                <button onClick={addColumn} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm transition-colors">Hủy</button>
          <button onClick={save} disabled={saving || loading}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm transition-colors">
            {saving ? "Đang lưu..." : "Lưu cấu hình"}
          </button>
        </div>
      </div>
    </div>
  );
}
