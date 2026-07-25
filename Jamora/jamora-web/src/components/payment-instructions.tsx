"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CustomerPaymentSnapshot } from "@/lib/payment-customer-policy.cjs";
import {
  mergePaymentSnapshot,
  paymentStatusView,
  shouldPollPayment,
  snapshotInstructionRows,
} from "@/lib/payment-customer-view.cjs";

const capabilityKey = (reference: string) =>
  `jamora.payment-capability:${reference}`;

function formatMoney(amountMinor: number, currency: "RON" | "EUR") {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

export function PaymentInstructions({
  reference,
  initialSnapshot,
  guestCheckoutCapability,
}: {
  reference: string;
  initialSnapshot?: CustomerPaymentSnapshot;
  guestCheckoutCapability?: string;
}) {
  const [snapshot, setSnapshot] = useState(() =>
    initialSnapshot
      ? mergePaymentSnapshot(undefined, initialSnapshot)
      : undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const capability = guestCheckoutCapability ||
      sessionStorage.getItem(capabilityKey(reference)) ||
      "";
    if (guestCheckoutCapability) {
      sessionStorage.setItem(capabilityKey(reference), guestCheckoutCapability);
    }

    async function refresh() {
      try {
        const response = await fetch(
          `/api/jamora/payments/status/${encodeURIComponent(reference)}`,
          {
            cache: "no-store",
            headers: capability
              ? { "x-jamora-checkout-capability": capability }
              : {},
          },
        );
        if (!response.ok) throw new Error("Payment status is unavailable.");
        const next = await response.json() as CustomerPaymentSnapshot;
        if (!active) return;
        setSnapshot((current) => mergePaymentSnapshot(current, next));
        setError("");
        if (shouldPollPayment(next.status)) {
          timer = setTimeout(refresh, 3_000);
        }
      } catch {
        if (!active) return;
        setError("Payment status is temporarily unavailable. We will retry.");
        timer = setTimeout(refresh, 5_000);
      }
    }

    if (!initialSnapshot || shouldPollPayment(initialSnapshot.status)) {
      void refresh();
    }
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [guestCheckoutCapability, initialSnapshot, reference]);

  if (!snapshot) {
    return (
      <section className="rounded-2xl border border-clay bg-white/80 p-6">
        <h1 className="font-display text-2xl text-ink">Payment status</h1>
        <p className="mt-3 text-stone">
          {error || "Loading the verified payment status…"}
        </p>
      </section>
    );
  }

  const view = paymentStatusView(snapshot.status);
  const tone = view.tone === "paid"
    ? "border-herb bg-green-50 text-herb-deep"
    : view.tone === "failed"
      ? "border-red-300 bg-red-50 text-red-900"
      : view.tone === "attention"
        ? "border-amber-300 bg-amber-50 text-amber-950"
        : "border-clay bg-sand/40 text-bark";

  return (
    <section className={`rounded-2xl border p-6 ${tone}`} aria-live="polite">
      <p className="eyebrow">{view.label}</p>
      <h1 className="mt-2 font-display text-2xl text-ink">
        {snapshot.method === "bank_transfer"
          ? "Bank transfer instructions"
          : "RoPay payment"}
      </h1>

      {snapshot.method === "bank_transfer" ? (
        <dl className="mt-5 grid gap-3 text-sm">
          {snapshotInstructionRows(snapshot).map(([label, value]) => (
            <div key={label} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
              <dt className="font-semibold">{label}</dt>
              <dd className="break-all text-ink">
                {typeof value === "string"
                  ? value
                  : formatMoney(value.amountMinor, value.currency)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="mt-5">
          {snapshot.qrUrl ? (
            <Image
              src={snapshot.qrUrl}
              alt={`RoPay QR for ${snapshot.paymentReference}`}
              width={240}
              height={240}
              unoptimized
              className="rounded-xl border border-clay bg-white"
            />
          ) : null}
          {snapshot.deepLink ? (
            <a
              href={snapshot.deepLink}
              className="mt-4 inline-flex rounded-full bg-bark px-5 py-3 text-sm font-semibold text-white"
            >
              Open RoPay
            </a>
          ) : null}
          <p className="mt-4 text-sm">
            Reference: <span className="font-semibold">{snapshot.paymentReference}</span>
          </p>
          <p className="mt-1 text-sm">
            Amount: {formatMoney(snapshot.amountMinor, snapshot.currency)}
          </p>
          <p className="mt-1 text-sm">Expires: {snapshot.expiresAt}</p>
        </div>
      )}

      <p className="mt-5 rounded-lg bg-white/70 p-3 text-sm font-semibold">
        Fulfillment and membership benefits begin only after the server confirms
        payment. A browser or provider redirect is not payment confirmation.
      </p>
      {!view.paid ? (
        <p className="mt-3 text-sm">
          We are checking the read-only server status. Do not submit a second
          payment with the same reference.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm">{error}</p> : null}
      <Link
        href={`/payment/status/${encodeURIComponent(snapshot.paymentReference)}`}
        className="mt-5 inline-flex text-sm font-semibold underline underline-offset-4"
      >
        Open payment status
      </Link>
    </section>
  );
}
