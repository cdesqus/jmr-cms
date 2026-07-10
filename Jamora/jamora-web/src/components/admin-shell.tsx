"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminLogoutButton } from "@/components/admin-logout-button";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/shipping", label: "Shipping" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white px-5 py-6 lg:block">
        <Link href="/admin" className="text-2xl font-bold tracking-tight">
          Jamora Admin
        </Link>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
          Commerce operations
        </p>
        <nav className="mt-8 space-y-1">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/admin" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "block rounded-lg px-3 py-2 text-sm font-semibold",
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700 hover:bg-blue-50 hover:text-blue-700",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-6 left-5 right-5 space-y-2">
          <Link
            href="/"
            className="block rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
          >
            Open storefront
          </Link>
          <AdminLogoutButton />
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur lg:hidden">
          <div className="text-xl font-bold">Jamora Admin</div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3">
            <AdminLogoutButton />
          </div>
        </header>
        <main className="px-5 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
