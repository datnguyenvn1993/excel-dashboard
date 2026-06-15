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

    useEffect(() => {
        fetchUsers();
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
        <div className="min-h-screen bg-slate-950 p-8 text-white">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-2xl font-bold">Admin - Quản lý tài khoản</h1>
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
        </div>
    );
}
