"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Thanh chuyển trang dùng chung trên header.
// "Danh mục partner" chỉ dành cho admin: tài khoản khác thấy nút nhưng bị disable.
const TABS = [
  { href: "/", label: "📊 Báo cáo KPI", adminOnly: false },
  { href: "/partners", label: "🗂 Danh mục partner", adminOnly: true },
] as const;

export default function AppNav({ active }: { active: "/" | "/partners" }) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRole(j?.user?.role ?? ""))
      .catch(() => setRole(""));
  }, []);

  const isAdmin = role === "admin";
  const base = "px-3 py-1.5 text-xs font-semibold rounded-lg";

  return (
    <nav className="flex items-center gap-1">
      {TABS.map((t) => {
        if (t.adminOnly && !isAdmin) {
          return (
            <span
              key={t.href}
              aria-disabled="true"
              title={role === null ? "Đang kiểm tra quyền..." : "Chỉ admin mới truy cập được"}
              className={`${base} text-white/50 cursor-not-allowed select-none`}
            >
              {t.label} 🔒
            </span>
          );
        }
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`${base} ${
              active === t.href ? "bg-white text-teal-700 shadow-sm" : "text-white hover:bg-white/15"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
