import Link from "next/link";

// Thanh chuyển trang dùng chung trên header.
const TABS = [
  { href: "/", label: "📊 Báo cáo KPI" },
  { href: "/partners", label: "🗂 Danh mục partner" },
];

export default function AppNav({ active }: { active: "/" | "/partners" }) {
  return (
    <nav className="flex items-center gap-1">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
            active === t.href
              ? "bg-white text-teal-700 shadow-sm"
              : "text-white hover:bg-white/15"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
