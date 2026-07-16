"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatAdminMoney, type AdminCustomer } from "@/lib/admin-api";

export function AdminCustomersTable({ customers }: { customers: AdminCustomer[] }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () => customers.filter((customer) => {
      const haystack = [
        customer.customerName,
        customer.email,
        customer.shippingAddressText,
        customer.lastOrderNumber,
      ].filter(Boolean).join(" ").toLowerCase();
      return !normalizedQuery || haystack.includes(normalizedQuery);
    }),
    [customers, normalizedQuery],
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="relative min-w-[260px] flex-1 md:max-w-md">
            <span className="sr-only">Search customers</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, address, order..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white"
            />
          </label>
          <p className="text-xs font-semibold text-slate-400">
            Showing {filtered.length} of {customers.length}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[minmax(190px,1.2fr)_minmax(150px,1fr)_90px_120px_minmax(140px,0.8fr)] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 lg:grid">
          <span>Customer</span>
          <span>Last order</span>
          <span>Orders</span>
          <span>Lifetime value</span>
          <span>Action</span>
        </div>
        <div className="divide-y divide-slate-100">
          {filtered.map((customer) => (
            <article
              key={customer.email.toLowerCase()}
              className="grid gap-4 px-5 py-4 hover:bg-slate-50/60 sm:grid-cols-2 lg:grid-cols-[minmax(190px,1.2fr)_minmax(150px,1fr)_90px_120px_minmax(140px,0.8fr)] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-black text-blue-700">
                    {initials(customer.customerName)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">{customer.customerName || "Customer"}</p>
                    <p className="truncate text-xs text-slate-500">{customer.email}</p>
                  </div>
                </div>
                {customer.shippingAddressText ? (
                  <p className="mt-2 truncate text-xs text-slate-400 lg:pl-12">{customer.shippingAddressText}</p>
                ) : null}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400 lg:hidden">Last order</p>
                <p className="font-semibold text-slate-800">{customer.lastOrderNumber || "No order"}</p>
                <p className="mt-1 text-xs capitalize text-slate-500">
                  {formatDate(customer.lastOrderAt)}{customer.lastOrderStatus ? ` · ${customer.lastOrderStatus}` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400 lg:hidden">Orders</p>
                <p className="font-bold text-slate-950">{customer.orderCount}</p>
                <p className="text-xs text-slate-500">{customer.paidOrderCount} paid</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400 lg:hidden">Lifetime value</p>
                <p className="font-bold text-slate-950">{formatAdminMoney(customer.lifetimeValueCents)}</p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {customer.lastOrderDocumentId ? (
                  <Link
                    href={`/admin/orders/${customer.lastOrderDocumentId}`}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700"
                  >
                    Last order
                  </Link>
                ) : null}
                <Link
                  href={`/admin/orders?search=${encodeURIComponent(customer.email)}`}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                >
                  All orders
                </Link>
              </div>
            </article>
          ))}
          {filtered.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">No customers match this search.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function initials(name: string) {
  const value = name.trim();
  if (!value) return "CU";
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function formatDate(value?: string) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}
