"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEUR } from "@/lib/products";
import {
  getLastMockOrder,
  getMockOrder,
  type MockOrder,
  type MockOrderStatus,
} from "@/lib/mock-orders";
import { fetchTrackedOrder } from "@/lib/order-tracking";

const STEPS: { status: MockOrderStatus; label: string; description: string }[] = [
  {
    status: "pending",
    label: "Pending",
    description: "Order was created and is waiting for payment confirmation.",
  },
  {
    status: "paid",
    label: "Paid",
    description: "Payment accepted in test mode and confirmation prepared.",
  },
  {
    status: "processing",
    label: "Processing",
    description: "Warehouse team reviews, picks, and packs the order.",
  },
  {
    status: "shipped",
    label: "Shipped",
    description: "Parcel is handed to the carrier with tracking attached.",
  },
  {
    status: "fulfilled",
    label: "Delivered",
    description: "Order is completed after delivery.",
  },
];

const TERMINAL_STATUS_LABELS: Partial<Record<MockOrderStatus, string>> = {
  failed: "Payment failed",
  refunded: "Refunded",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusIndex(status: MockOrderStatus) {
  return STEPS.findIndex((step) => step.status === status);
}

function humanStatus(status: MockOrderStatus) {
  return (
    TERMINAL_STATUS_LABELS[status] ??
    status.charAt(0).toUpperCase() + status.slice(1)
  );
}

export function OrderDetail({
  orderId,
  mode = "success",
}: {
  orderId?: string | null;
  mode?: "success" | "tracking";
}) {
  const [order, setOrder] = useState<MockOrder | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const remote = orderId ? await fetchTrackedOrder(orderId) : null;
        if (!ignore) setOrder(remote ?? (orderId ? getMockOrder(orderId) : getLastMockOrder()));
      } catch {
        if (!ignore) setOrder(orderId ? getMockOrder(orderId) : getLastMockOrder());
      } finally {
        if (!ignore) setLoaded(true);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [orderId]);

  if (!loaded) {
    return <p className="text-stone">Loading order...</p>;
  }

  if (!order) {
    return (
      <div className="rounded-xl border border-clay/70 bg-white/40 p-8">
        <h2 className="font-display text-2xl text-ink">Order not found</h2>
        <p className="mt-2 text-stone">
          We could not find that order number or tracking number in the
          fulfilment dashboard. Check the code and try again.
        </p>
        <Link
          href="/cart"
          className="mt-5 inline-flex rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-cream hover:bg-terracotta-deep"
        >
          Back to cart
        </Link>
      </div>
    );
  }

  const active = Math.max(0, statusIndex(order.status));
  const isTerminalException = order.status === "failed" || order.status === "refunded";

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-clay/70 bg-sand/30 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-terracotta">
          {mode === "success" ? "Order confirmed" : "Tracking"}
        </p>
        <div className="mt-3 grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <h1 className="font-display text-4xl text-ink">{order.orderNumber}</h1>
            <p className="mt-2 text-stone">
              Confirmation email simulated for {order.customer.email}.
            </p>
            <p className="mt-3 inline-flex rounded-full border border-clay bg-cream px-3 py-1 text-sm font-semibold text-bark">
              Current status: {humanStatus(order.status)}
            </p>
          </div>
          <div className="rounded-lg border border-clay bg-cream px-4 py-3 text-sm">
            <p className="font-semibold text-ink">{order.carrier}</p>
            <p className="text-stone">{order.trackingNumber}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {STEPS.map((step, index) => {
          const done = !isTerminalException && index <= active;
          const current = !isTerminalException && step.status === order.status;
          return (
            <div
              key={step.status}
              className={`rounded-xl border p-4 ${
                current
                  ? "border-terracotta bg-terracotta/15"
                  : done
                  ? "border-terracotta/50 bg-terracotta/10"
                  : "border-clay/70 bg-white/40"
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  done ? "bg-terracotta text-cream" : "bg-clay/40 text-stone"
                }`}
              >
                {index + 1}
              </span>
              <h2 className="mt-3 font-semibold text-ink">{step.label}</h2>
              <p className="mt-1 text-sm text-stone">{step.description}</p>
            </div>
          );
        })}
      </section>

      {isTerminalException && (
        <section className="rounded-xl border border-terracotta/40 bg-terracotta/10 p-5">
          <h2 className="font-semibold text-ink">{humanStatus(order.status)}</h2>
          <p className="mt-1 text-sm text-bark">
            This order is not moving through fulfilment. Contact Jamora support
            if this status looks wrong.
          </p>
        </section>
      )}

      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-clay/70 bg-white/40 p-6">
          <h2 className="font-display text-2xl text-ink">Items</h2>
          <ul className="mt-4 divide-y divide-clay/50">
            {order.items.map((item) => (
              <li key={item.productId} className="flex justify-between gap-4 py-3">
                <div>
                  <p className="font-medium text-ink">{item.name}</p>
                  <p className="text-sm text-stone">Qty {item.qty}</p>
                </div>
                <p className="font-semibold text-ink">
                  {formatEUR(item.lineTotalCents)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-clay/70 bg-sand/30 p-6">
          <h2 className="font-display text-2xl text-ink">Summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-bark">Created</dt>
              <dd className="text-right text-ink">{formatDate(order.createdAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-bark">Estimated delivery</dt>
              <dd className="text-right text-ink">
                {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
                  new Date(order.estimatedDelivery),
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-bark">Shipping</dt>
              <dd className="text-ink">
                {order.shippingCents === 0 ? "Free" : formatEUR(order.shippingCents)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-clay/60 pt-2 font-semibold">
              <dt className="text-ink">Total paid</dt>
              <dd className="text-ink">{formatEUR(order.totalCents)}</dd>
            </div>
          </dl>

          <div className="mt-5 rounded-lg bg-cream px-4 py-3 text-sm text-bark">
            <p className="font-semibold text-ink">Email confirmation</p>
            <p className="mt-1">
              Simulated confirmation sent to {order.customer.email}. Real email
              delivery can be wired later via Resend or Postmark.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
