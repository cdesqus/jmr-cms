"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PaymentInstructions } from "@/components/payment-instructions";
import { PaymentMethodSelector } from "@/components/payment-method-selector";
import type { CustomerMembership } from "@/lib/membership-customer-api";
import { membershipDashboard } from "@/lib/membership-customer-policy.cjs";
import type {
  CustomerPaymentSnapshot,
  PaymentMethod,
} from "@/lib/payment-customer-policy.cjs";
import { paymentPreparationRequest } from "@/lib/payment-customer-view.cjs";

const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value))
    : "Pending";

export function MembershipDashboard({ memberships }: { memberships: CustomerMembership[] }) {
  const router = useRouter();
  const renewalKey = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [payment, setPayment] = useState<CustomerPaymentSnapshot>();
  const views = memberships.map(membershipDashboard);
  const current = views[0];

  async function renew() {
    if (!current || payment) return;
    setBusy(true);
    setError("");
    renewalKey.current ??= `renew:${crypto.randomUUID()}`;
    try {
      const response = await fetch("/api/jamora/membership/renew", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planDocumentId: current.planDocumentId,
          membershipDocumentId: current.documentId,
          idempotencyKey: renewalKey.current,
        }),
      });
      const prepared = await response.json().catch(() => ({})) as {
        membership?: { documentId?: string };
      };
      if (!response.ok || !prepared.membership?.documentId) {
        throw new Error("Renewal could not be prepared. Please retry.");
      }
      const request = paymentPreparationRequest(paymentMethod, {
        idempotencyKey: `payment:${renewalKey.current}:${paymentMethod}`,
        subjectType: "membership",
        subjectId: prepared.membership.documentId,
        purpose: "membership_renewal",
        currency: "RON",
      });
      const paymentResponse = await fetch(request.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const snapshot = await paymentResponse.json().catch(() => ({}));
      if (!paymentResponse.ok) {
        throw new Error(
          "Renewal payment instructions could not be prepared. Please retry.",
        );
      }
      setPayment(snapshot as CustomerPaymentSnapshot);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Renewal could not be prepared. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!current) return <p>You do not have a membership yet.</p>;

  return (
    <div className="space-y-6">
      <section className={`rounded-2xl border p-6 ${current.state === "pending" ? "border-amber-300 bg-amber-50" : "border-clay bg-white/80"}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-terracotta">Current membership</p>
            <h2 className="mt-2 font-display text-3xl font-semibold">
              {current.planSnapshot.name}
            </h2>
            <p className="mt-2 capitalize text-stone">Status: {current.state}</p>
            <p className="mt-1 text-sm text-stone">
              {date(current.startsAt)} – {date(current.endsAt)}
            </p>
          </div>
          <a href="/account/membership/plans" className="rounded-full border border-bark px-5 py-2 text-sm font-semibold">
            View plans
          </a>
        </div>
        {current.state === "pending" ? (
          <p className="mt-5 font-semibold text-amber-900">
            Payment confirmation is pending. Credits are not available yet.
          </p>
        ) : null}
        {current.state === "expired" ? (
          <p className="mt-5 font-semibold text-red-800">
            This membership has expired and cannot redeem credits.
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        {Object.entries(current.totals).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-clay bg-white/70 p-5">
            <p className="text-sm capitalize text-stone">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-bark">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-clay bg-white/80 p-6">
        <h2 className="font-display text-2xl font-semibold">Eligible packages</h2>
        <p className="mt-3 capitalize text-stone">
          {current.planSnapshot.eligibleProductSlugs.join(", ").replaceAll("-", " ")}
        </p>
        <p className="mt-3 font-semibold text-terracotta">
          Shipping is paid at each redemption checkout.
        </p>
      </section>

      <section className="rounded-2xl border border-clay bg-white/80 p-6">
        <h2 className="font-display text-2xl font-semibold">Credit history</h2>
        <ul className="mt-4 divide-y divide-clay">
          {current.creditEntries.map((entry, index) => (
            <li key={entry.entryId ?? `${entry.kind}-${index}`} className="flex justify-between gap-4 py-3 text-sm">
              <span className="capitalize">{entry.kind.replaceAll("_", " ")}</span>
              <span>
                {entry.creditDelta ?? entry.credits ?? 0} credits · {date(entry.occurredAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {payment ? (
        <PaymentInstructions
          key={payment.paymentReference}
          reference={payment.paymentReference}
          initialSnapshot={payment}
        />
      ) : null}
      <PaymentMethodSelector
        value={paymentMethod}
        onChange={setPaymentMethod}
        disabled={busy || Boolean(payment)}
      />
      <button
        type="button"
        disabled={busy || Boolean(payment)}
        onClick={() => void renew()}
        className="rounded-full bg-bark px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Preparing payment…" : "Renew this plan"}
      </button>
    </div>
  );
}
