"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AdminLogoutButton } from "@/components/admin-logout-button";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/orders", label: "Orders", icon: "orders" },
  { href: "/admin/products", label: "Products", icon: "products" },
  { href: "/admin/inventory", label: "Inventory", icon: "inventory" },
  { href: "/admin/content", label: "Content", icon: "content" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);

  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <aside
        className={[
          "fixed inset-y-0 left-0 hidden border-r border-slate-200 bg-white py-6 transition-[width] duration-200 lg:block",
          expanded ? "w-64 px-5" : "w-20 px-3",
        ].join(" ")}
      >
        <div
          className={[
            "flex items-center gap-3",
            expanded ? "justify-between" : "justify-center",
          ].join(" ")}
        >
          <Link
            href="/admin"
            className={[
              "flex items-center gap-3 font-bold tracking-tight",
              expanded ? "text-2xl" : "text-lg",
            ].join(" ")}
            title="Jamora Admin"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white">
              J
            </span>
            {expanded ? <span>Jamora Admin</span> : null}
          </Link>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:border-blue-300 hover:text-blue-700"
            title={expanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {expanded ? "<" : ">"}
          </button>
        </div>
        {expanded ? (
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
            Commerce operations
          </p>
        ) : null}
        <nav className="mt-8 space-y-1">
          {NAV.map((item) => {
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
            "absolute bottom-6 space-y-2",
            expanded ? "left-5 right-5" : "left-3 right-3",
          ].join(" ")}
        >
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
      <div className={expanded ? "lg:pl-64" : "lg:pl-20"}>
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
