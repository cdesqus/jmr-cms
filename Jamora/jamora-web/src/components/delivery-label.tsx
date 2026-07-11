"use client";

import { useEffect, useState } from "react";
import { fetchTrackedOrder } from "@/lib/order-tracking";
import type { MockOrder } from "@/lib/mock-orders";

export function DeliveryLabel({ orderNumber }: { orderNumber: string }) {
  const [order, setOrder] = useState<MockOrder | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const found = await fetchTrackedOrder(orderNumber);
        if (!ignore) setOrder(found);
      } finally {
        if (!ignore) setLoaded(true);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [orderNumber]);

  if (!loaded) return <p className="text-stone">Loading label...</p>;
  if (!order) {
    return (
      <div className="rounded-xl border border-clay/70 bg-white/40 p-8">
        <h1 className="font-display text-3xl text-ink">Label unavailable</h1>
        <p className="mt-2 text-stone">Order {orderNumber} was not found.</p>
      </div>
    );
  }
  const trackingUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/track?order=${encodeURIComponent(order.orderNumber)}`
      : `/track?order=${encodeURIComponent(order.orderNumber)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=132x132&margin=8&data=${encodeURIComponent(trackingUrl)}`;

  return (
    <div>
      <div className="mb-5 flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-cream hover:bg-terracotta-deep"
        >
          Print delivery label
        </button>
      </div>

      <section className="bg-white p-8 text-ink shadow-sm print:shadow-none">
        <div className="border-4 border-ink p-6">
          <div className="flex items-start justify-between gap-6 border-b-2 border-ink pb-5">
            <div>
              <p className="font-display text-4xl font-semibold">Jamora</p>
              <p className="mt-1 text-sm">Romania fulfilment centre</p>
              <p className="text-sm">EU botanical wellness goods</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.2em]">Order</p>
              <p className="text-2xl font-bold">{order.orderNumber}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.2em]">Tracking</p>
              <p className="text-xl font-bold">{order.trackingNumber}</p>
            </div>
          </div>

          <div className="grid gap-6 border-b-2 border-ink py-6 md:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em]">Ship to</p>
              <p className="mt-3 text-2xl font-bold">{order.customer.name}</p>
              <p className="mt-2 whitespace-pre-line text-lg">
                {order.customer.address}
              </p>
              <p className="mt-2 text-sm">{order.customer.email}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em]">Carrier</p>
              <p className="mt-3 text-2xl font-bold">{order.carrier}</p>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em]">
                Service
              </p>
              <p className="mt-2 text-lg">EU parcel delivery</p>
            </div>
          </div>

          <div className="py-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em]">Contents</p>
            <ul className="mt-3 space-y-2">
              {order.items.map((item) => (
                <li key={item.productId} className="flex justify-between text-lg">
                  <span>{item.name}</span>
                  <span>Qty {item.qty}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 grid gap-5 border-2 border-dashed border-ink p-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em]">Scan tracking</p>
              <p className="mt-3 break-all text-3xl font-bold tracking-[0.25em]">
                {order.trackingNumber}
              </p>
              <p className="mt-2 break-all text-xs text-stone">{trackingUrl}</p>
            </div>
            <img
              src={qrUrl}
              alt={`QR tracking code for ${order.orderNumber}`}
              className="h-32 w-32 border border-ink bg-white p-1"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
