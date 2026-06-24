"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [form, setForm] = useState({ id: 0, username: "", password: "", role: "user", display_name: "" });
    const [isEditing, setIsEditing] = useState(false);

    // DB Size Status
    const [dbStats, setDbStats] = useState<any>(null);
    const [showDbModal, setShowDbModal] = useState(false);

    // Compression State
    const [logs, setLogs] = useState<any[]>([]);
    const [compressingDate, setCompressingDate] = useState<string | null>(null);

    const checkDbSize = async () => {
        try {
            const res = await fetch("/api/db-size");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setDbStats(data);
            setShowDbModal(true);
        } catch (e: any) {
            alert(e.message);
        }
    };

    const fetchLogs = async () => {
        try {
            const res = await fetch("/api/compress");
            if (!res.ok) throw new Error("Failed to fetch logs");
            const data = await res.json();
            setLogs(data.logs);
        } catch (e: any) {
            console.error(e);
        }
    };

    const handleCompress = async (date: string) => {
        if (!confirm(`Nén dữ liệu ngày ${date}? Dữ liệu thô sẽ bị xóa không thể phục hồi và chuyển lên bảng summary.`)) return;
        setCompressingDate(date);
        try {
            const res = await fetch("/api/compress", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            alert(`Nén thành công! Giảm từ ${data.rawDeleted} dòng thô xuống ${data.summaryAdded} dòng summary.`);
            fetchLogs();
            if (showDbModal) checkDbSize(); // refresh db size if open
        } catch (e: any) {
            alert("Lỗi nén: " + e.message);
        } finally {
            setCompressingDate(null);
        }
    };

    const handleReCompress = async (date: string) => {
        if (!confirm(`Bạn vừa import lại dữ liệu thô cho ngày ${date}? Nén lại sẽ xóa summary cũ và nén lại từ dữ liệu thô mới.`)) return;
        setCompressingDate(date);
        try {
            const res = await fetch("/api/compress", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date, forceRefill: true })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            alert(`Nén lại thành công! Giảm từ ${data.rawDeleted} dòng thô xuống ${data.summaryAdded} dòng summary.`);
            fetchLogs();
            if (showDbModal) checkDbSize();
        } catch (e: any) {
            alert("Lỗi nén lại: " + e.message);
        } finally {
            setCompressingDate(null);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchLogs();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await fetch("/api/users");
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();
            setUsers(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const method = isEditing ? "PATCH" : "POST";
            const res = await fetch("/api/users", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setForm({ id: 0, username: "", password: "", role: "user", display_name: "" });
            setIsEditing(false);
            fetchUsers();
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Xóa tài khoản này?")) return;
        try {
            const res = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            fetchUsers();
        } catch (e: any) {
            alert(e.message);
        }
    };

    return (
        <>
            {showDbModal && dbStats && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto shadow-xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Storage Usage</h3>
                            <button onClick={() => setShowDbModal(false)} className="text-slate-400 hover:text-white">✕</button>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-3xl font-mono text-cyan-400">{dbStats.database.pretty}</span>
                            <span className="text-slate-400">/ 256 MB (Vercel Hobby Tier)</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-3 mb-6 overflow-hidden">
                            <div className="bg-cyan-500 h-3" style={{ width: `${Math.min(100, Math.max(0.5, (dbStats.database.raw / dbStats.database.limit) * 100))}%` }}></div>
                        </div>
                        <h4 className="font-semibold text-slate-300 mb-3">Table Sizes</h4>
                        <table className="w-full text-sm text-left border border-slate-800 rounded overflow-hidden">
                            <thead className="bg-slate-800 text-slate-400">
                                <tr><th className="px-3 py-2">Table Name</th><th className="px-3 py-2 text-right">Bytes</th><th className="px-3 py-2 text-right">Rows</th></tr>
                            </thead>
                            <tbody>
                                {dbStats.tables.map((tbl: any) => (
                                    <tr key={tbl.name} className="border-t border-slate-800">
                                        <td className="px-3 py-2 font-mono text-cyan-200">{tbl.name}</td>
                                        <td className="px-3 py-2 text-right text-slate-300">{tbl.prettySize}</td>
                                        <td className="px-3 py-2 text-right text-slate-300">{tbl.rows.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            <div className="min-h-screen bg-slate-950 p-8 text-white">
                <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

                    <div className="lg:col-span-2">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <h1 className="text-2xl font-bold">Admin - Quản lý</h1>
                                <button onClick={checkDbSize} className="text-sm bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg flex items-center gap-2">
                                    <span>💾</span> Check DB Storage
                                </button>
                            </div>
                            <button onClick={() => router.push("/")} className="text-sm bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg">
                                Quay lại Dashboard
                            </button>
                        </div>

                        {error && <div className="bg-red-500/20 text-red-400 p-4 rounded-lg mb-6">{error}</div>}

                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
                            <h2 className="text-lg font-semibold mb-4">{isEditing ? "Sửa tài khoản" : "Tạo tài khoản mới"}</h2>
                            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Username</label>
                                    <input type="text" disabled={isEditing} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 disabled:opacity-50" required />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Mật khẩu {isEditing && "(để trống nếu không đổi)"}</label>
                                    <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2" required={!isEditing} />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Tên hiển thị</label>
                                    <input type="text" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2" required />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Role</label>
                                    <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2">
                                        <option value="user">User</option>
                                        <option value="manager">Manager</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2 flex justify-end gap-3 mt-4">
                                    {isEditing && <button type="button" onClick={() => { setIsEditing(false); setForm({ id: 0, username: "", password: "", role: "user", display_name: "" }); }} className="px-4 py-2 border border-slate-600 rounded">Hủy</button>}
                                    <button type="submit" className="px-4 py-2 text-white rounded bg-blue-600 hover:bg-blue-500">
                                        {isEditing ? "Cập nhật" : "Tạo mới"}
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                            {loading ? (
                                <div className="p-8 text-center text-slate-400">Loading...</div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead className="bg-slate-800 text-slate-300 text-sm">
                                        <tr>
                                            <th className="px-6 py-3">Username</th>
                                            <th className="px-6 py-3">Name</th>
                                            <th className="px-6 py-3">Role</th>
                                            <th className="px-6 py-3">Created</th>
                                            <th className="px-6 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {users.map(u => (
                                            <tr key={u.id} className="hover:bg-slate-800/50">
                                                <td className="px-6 py-4 font-mono text-sm">{u.username}</td>
                                                <td className="px-6 py-4">{u.display_name}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded text-xs ${u.role === 'admin' ? 'bg-red-500/20 text-red-300' : u.role === 'manager' ? 'bg-orange-500/20 text-orange-300' : 'bg-slate-800 text-slate-300'}`}>
                                                        {u.role}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-400">{new Date(u.created_at).toLocaleDateString()}</td>
                                                <td className="px-6 py-4 text-right space-x-3">
                                                    <button onClick={() => { setIsEditing(true); setForm({ ...u, password: "" }); }} className="text-blue-400 hover:text-blue-300 text-sm">Sửa</button>
                                                    <button onClick={() => handleDelete(u.id)} className="text-red-400 hover:text-red-300 text-sm">Xóa</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {users.length === 0 && (
                                            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Chưa có tài khoản nào.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-1">
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                            <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
                                🗜️ Nén dữ liệu (Storage Optimize)
                            </h2>
                            <p className="text-sm text-slate-400 mb-4">
                                Giảm kích thước database bằng cách tổng hợp dữ liệu cũ thành summary và xóa dòng thô.
                            </p>

                            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                                {logs.map(log => (
                                    <div key={log.create_date} className={`p-4 rounded-lg flex flex-col gap-2 ${log.status === 'compressed' ? 'bg-slate-800 border-l-4 border-cyan-500' : 'bg-slate-800/50 border border-slate-700'}`}>
                                        <div className="flex justify-between items-center">
                                            <span className="font-mono font-bold text-lg">{new Date(log.create_date).toLocaleDateString('vi-VN')}</span>
                                            {log.status === 'compressed' ? (
                                                <span className="text-xs bg-cyan-900/50 text-cyan-300 px-2 py-1 rounded">Đã nén</span>
                                            ) : (
                                                <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded">Chưa nén</span>
                                            )}
                                        </div>

                                        {log.status === 'raw' && (
                                            <button
                                                onClick={() => handleCompress(log.create_date)}
                                                disabled={compressingDate === log.create_date}
                                                className="mt-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white py-1.5 rounded"
                                            >
                                                {compressingDate === log.create_date ? "Đang nén..." : "Nén dữ liệu ngày này"}
                                            </button>
                                        )}

                                        {log.status === 'compressed' && (
                                            <button
                                                onClick={() => handleReCompress(log.create_date)}
                                                disabled={compressingDate === log.create_date}
                                                className="mt-2 text-xs bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-slate-300 py-1.5 rounded"
                                            >
                                                {compressingDate === log.create_date ? "Đang nén lại..." : "Nén lại (nếu vừa import bù)"}
                                            </button>
                                        )}

                                        {log.status === 'compressed' && (
                                            <div className="text-xs text-slate-400 flex justify-between mt-1">
                                                <span>Raw: {log.raw_row_count}</span>
                                                <span className="text-cyan-400">→ Summary: {log.summary_rows}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {logs.length === 0 && <p className="text-slate-500 text-sm text-center py-4">Chưa có lịch sử data</p>}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
}
