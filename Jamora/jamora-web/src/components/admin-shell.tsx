"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AdminLogoutButton } from "@/components/admin-logout-button";
import type { AdminIdentity, AdminRole } from "@/lib/admin-auth";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", roles: ["owner", "warehouse", "content", "support"] },
  { href: "/admin/orders", label: "Orders", icon: "orders", roles: ["owner", "warehouse", "support"] },
  { href: "/admin/customers", label: "Customers", icon: "customers", roles: ["owner", "support"] },
  { href: "/admin/products", label: "Products", icon: "products", roles: ["owner", "content"] },
  { href: "/admin/inventory", label: "Inventory", icon: "inventory", roles: ["owner", "warehouse"] },
  { href: "/admin/suppliers", label: "Suppliers", icon: "suppliers", roles: ["owner", "warehouse"] },
  { href: "/admin/purchase-orders", label: "Purchase orders", icon: "purchase-orders", roles: ["owner", "warehouse"] },
  { href: "/admin/promotions", label: "Promotions", icon: "promotions", roles: ["owner", "content"] },
  { href: "/admin/returns", label: "Returns", icon: "returns", roles: ["owner", "support"] },
  { href: "/admin/content", label: "Content", icon: "content", roles: ["owner", "content"] },
  { href: "/admin/audit", label: "Audit log", icon: "audit", roles: ["owner"] },
  { href: "/admin/settings", label: "Settings", icon: "settings", roles: ["owner"] },
];

export function AdminShell({ children, identity }: { children: React.ReactNode; identity: AdminIdentity | null }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);
  const role: AdminRole = identity?.role ?? "owner";
  const visibleNav = NAV.filter((item) => (item.roles as AdminRole[]).includes(role));

  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <aside
        className={[
          "fixed inset-y-0 left-0 hidden h-screen flex-col overflow-hidden border-r border-slate-200 bg-white py-4 transition-[width] duration-200 lg:flex",
          expanded ? "w-64 px-5" : "w-20 px-3",
        ].join(" ")}
      >
        <div className="shrink-0">
          <Link
            href="/admin"
            className={[
              "flex items-center justify-center gap-3 font-bold tracking-tight",
              expanded ? "text-2xl" : "text-lg",
            ].join(" ")}
            title="Jamora Admin"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white">
              J
            </span>
            {expanded ? <span>Jamora Admin</span> : null}
          </Link>
        </div>
        {expanded ? (
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
            Commerce operations
          </p>
        ) : null}
        <div className={expanded ? "mt-6 flex justify-end" : "mt-6 flex justify-center"}>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:border-blue-300 hover:text-blue-700"
            title={expanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {expanded ? "<" : ">"}
          </button>
        </div>
        <nav className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1">
          {visibleNav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/admin" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={[
                  "flex items-center rounded-lg text-sm font-semibold",
                  expanded ? "gap-3 px-3 py-2" : "justify-center px-0 py-3",
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700 hover:bg-blue-50 hover:text-blue-700",
                ].join(" ")}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <FlatIcon name={item.icon} />
                </span>
                {expanded ? <span>{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>
        <div
          className={[
            "mt-4 shrink-0 space-y-2 border-t border-slate-100 pt-4",
          ].join(" ")}
        >
          {expanded && identity ? (
            <div className="mb-3 min-w-0">
              <p className="truncate text-xs font-semibold text-slate-700">{identity.email}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-600">{identity.label}</p>
            </div>
          ) : null}
          <Link
            href="/"
            title="Open storefront"
            className={[
              "flex items-center justify-center rounded-lg border border-slate-200 text-center text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700",
              expanded ? "px-3 py-2" : "h-11 w-full",
            ].join(" ")}
          >
            {expanded ? "Open storefront" : "↗"}
          </Link>
          {expanded ? <AdminLogoutButton /> : null}
        </div>
      </aside>
      <div className={[expanded ? "lg:pl-64" : "lg:pl-20", "min-w-0 transition-[padding] duration-200"].join(" ")}>
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur lg:hidden">
          <div className="text-xl font-bold">Jamora Admin</div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {visibleNav.map((item) => (
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
        <main className="min-w-0 max-w-full overflow-x-hidden px-4 py-6 sm:px-5 lg:px-6 xl:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function FlatIcon({ name }: { name: string }) {
  const common = {
    className: "h-4 w-4",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "dashboard") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="8" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="15" width="7" height="6" rx="1.5" />
      </svg>
    );
  }
  if (name === "orders") {
    return (
      <svg {...common}>
        <path d="M7 3h10l2 3v15H5V6l2-3Z" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
        <path d="M8 16h5" />
      </svg>
    );
  }
  if (name === "products") {
    return (
      <svg {...common}>
        <path d="M6 8.5 12 5l6 3.5v7L12 19l-6-3.5v-7Z" />
        <path d="m6.5 9 5.5 3 5.5-3" />
        <path d="M12 12v6.5" />
      </svg>
    );
  }
  if (name === "customers") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19" />
        <path d="M16 5.5a3 3 0 0 1 0 5.8" />
        <path d="M17 14a4 4 0 0 1 3.5 4v1" />
      </svg>
    );
  }
  if (name === "inventory") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
        <path d="M8 16h4" />
      </svg>
    );
  }
  if (name === "suppliers") {
    return <svg {...common}><path d="M4 20V8l8-4 8 4v12" /><path d="M8 20v-6h8v6" /><path d="M9 9h6" /></svg>;
  }
  if (name === "purchase-orders") {
    return <svg {...common}><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
  }
  if (name === "audit") {
    return <svg {...common}><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
  }
  if (name === "promotions") {
    return (
      <svg {...common}>
        <path d="M4 7.5V5h2.5a2.5 2.5 0 0 0 5 0H20v5.5a2.5 2.5 0 0 0 0 5V19h-8.5a2.5 2.5 0 0 0-5 0H4v-5.5a2.5 2.5 0 0 0 0-5Z" />
        <path d="m9 15 6-6" />
        <circle cx="9" cy="9" r=".75" fill="currentColor" stroke="none" />
        <circle cx="15" cy="15" r=".75" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === "returns") {
    return (
      <svg {...common}>
        <path d="M9 7H5v-4" />
        <path d="M5 7a8 8 0 1 1-1 8" />
        <path d="m5 7 4-4" />
      </svg>
    );
  }
  if (name === "content") {
    return (
      <svg {...common}>
        <path d="M5 4h10l4 4v12H5V4Z" />
        <path d="M15 4v4h4" />
        <path d="M8 13h8" />
        <path d="M8 17h6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.05.05-2.12 2.12-.05-.05a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.66V20.5h-3v-.08A1.8 1.8 0 0 0 10.4 18.8a1.8 1.8 0 0 0-2 .36l-.05.05-2.12-2.12.05-.05a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 5 13.9H4.5v-3H5a1.8 1.8 0 0 0 1.66-1.1 1.8 1.8 0 0 0-.36-2l-.05-.05 2.12-2.12.05.05a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 11.5 4.5V4.5h3v.08a1.8 1.8 0 0 0 1.1 1.62 1.8 1.8 0 0 0 2-.36l.05-.05 2.12 2.12-.05.05a1.8 1.8 0 0 0-.36 2A1.8 1.8 0 0 0 21 11.1h.5v3H21a1.8 1.8 0 0 0-1.6.9Z" />
    </svg>
  );
}
