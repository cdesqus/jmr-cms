"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PaymentInstructions } from "@/components/payment-instructions";
import { PaymentMethodSelector } from "@/components/payment-method-selector";
import type { CustomerMembershipPlan } from "@/lib/membership-customer-api";
import type {
  CustomerPaymentSnapshot,
  PaymentMethod,
} from "@/lib/payment-customer-policy.cjs";
import { paymentPreparationRequest } from "@/lib/payment-customer-view.cjs";

const money = (minor: number, currency: "EUR" | "RON") =>
  new Intl.NumberFormat("en", { style: "currency", currency }).format(minor / 100);

export function MembershipPlanPicker({ plans }: { plans: CustomerMembershipPlan[] }) {
  const router = useRouter();
  const requestKeys = useRef(new Map<string, string>());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [payment, setPayment] = useState<CustomerPaymentSnapshot>();

  async function purchase(planDocumentId: string) {
    if (payment) return;
    setBusy(planDocumentId);
    setError("");
    const idempotencyKey =
      requestKeys.current.get(planDocumentId) ?? `purchase:${crypto.randomUUID()}`;
    requestKeys.current.set(planDocumentId, idempotencyKey);
    try {
      const response = await fetch("/api/jamora/membership/purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planDocumentId, idempotencyKey }),
      });
      const prepared = await response.json().catch(() => ({})) as {
        membership?: { documentId?: string };
      };
      if (!response.ok || !prepared.membership?.documentId) {
        throw new Error("Your membership could not be prepared. Please retry.");
      }
      const request = paymentPreparationRequest(paymentMethod, {
        idempotencyKey: `payment:${idempotencyKey}:${paymentMethod}`,
        subjectType: "membership",
        subjectId: prepared.membership.documentId,
        purpose: "membership_purchase",
        currency: "RON",
      });
      const paymentResponse = await fetch(request.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const snapshot = await paymentResponse.json().catch(() => ({}));
      if (!paymentResponse.ok) {
        throw new Error("Payment instructions could not be prepared. Please retry.");
      }
      setPayment(snapshot as CustomerPaymentSnapshot);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your membership could not be prepared. Please retry.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {payment ? (
        <div className="mb-8">
          <PaymentInstructions
            key={payment.paymentReference}
            reference={payment.paymentReference}
            initialSnapshot={payment}
          />
        </div>
      ) : null}
      <PaymentMethodSelector
        value={paymentMethod}
        onChange={setPaymentMethod}
        currency="RON"
        disabled={busy !== null || Boolean(payment)}
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.documentId}
            className="flex flex-col rounded-2xl border border-clay bg-white/80 p-6"
          >
            <p className="eyebrow text-terracotta">{plan.durationMonths} months</p>
            <h2 className="mt-2 font-display text-2xl font-semibold">{plan.name}</h2>
            <p className="mt-5 text-2xl font-semibold text-bark">
              {money(plan.priceRonMinor, "RON")}
            </p>
            <p className="text-sm text-stone">
              Reference {money(plan.priceEurMinor, "EUR")}
            </p>
            <p className="mt-5 font-semibold">
              {plan.packageCredits} package credits included
            </p>
            <p className="mt-3 text-sm text-stone">
              Eligible packages:{" "}
              {plan.eligibleProductSlugs.join(", ").replaceAll("-", " ")}
            </p>
            <p className="mt-4 text-sm font-semibold text-terracotta">
              Shipping is paid at each redemption checkout.
            </p>
            <button
              type="button"
              disabled={busy !== null || Boolean(payment)}
              onClick={() => void purchase(plan.documentId)}
              className="mt-7 rounded-full bg-bark px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === plan.documentId ? "Preparing payment…" : "Buy membership"}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
