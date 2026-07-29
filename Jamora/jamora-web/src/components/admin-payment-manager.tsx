"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPayment, PaymentCurrency } from "@/lib/payment-api";

const mismatchStatuses = new Set(["underpaid", "overpaid", "currency_mismatch"]);
const terminalStatuses = new Set(["paid", "expired", "cancelled", "failed", "refunded"]);

export function AdminPaymentManager({ payments }: { payments: AdminPayment[] }) {
  const router = useRouter();
  const [receiptFor, setReceiptFor] = useState<string>();
  const [resolutionFor, setResolutionFor] = useState<string>();
  const [amountMinor, setAmountMinor] = useState("");
  const [currency, setCurrency] = useState<PaymentCurrency>("RON");
  const [bankReference, setBankReference] = useState("");
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState<"accept" | "cancel">("accept");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedReceipt = payments.find((payment) => payment.documentId === receiptFor);
  const selectedResolution = payments.find((payment) => payment.documentId === resolutionFor);
  const validAmount = Number.isSafeInteger(Number(amountMinor)) && Number(amountMinor) >= 0;

  async function mutate(path: string, body: unknown, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "Payment request failed.");
      setNotice(success);
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function recordReceipt(event: FormEvent) {
    event.preventDefault();
    if (!selectedReceipt) return;
    const saved = await mutate(
      `/admin/api/payments/${encodeURIComponent(selectedReceipt.documentId)}/receipt`,
      { amountMinor: Number(amountMinor), currency, bankReference },
      "Bank receipt recorded.",
    );
    if (saved) {
      setReceiptFor(undefined);
      setAmountMinor("");
      setBankReference("");
    }
  }

  async function resolveMismatch(event: FormEvent) {
    event.preventDefault();
    if (!selectedResolution) return;
    const saved = await mutate(
      `/admin/api/payments/${encodeURIComponent(selectedResolution.documentId)}/resolve`,
      { reason, resolution },
      "Mismatch resolution recorded.",
    );
    if (saved) {
      setResolutionFor(undefined);
      setReason("");
      setResolution("accept");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Showing the latest {payments.length} payment attempts and their immutable event histories.</p>
        <button type="button" disabled={busy} onClick={() => void mutate("/admin/api/payments/expire", {}, "Due payment attempts expired.")} className={secondaryButtonClass}>
          Expire due payments
        </button>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1250px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500"><tr>
              <th className="p-3">Reference / purpose</th><th className="p-3">Expected / received</th><th className="p-3">Status / expiry</th><th className="p-3">Binding</th><th className="p-3">Immutable events</th><th className="p-3">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{payments.map((payment) => <tr key={payment.documentId} className="align-top">
              <td className="p-3"><p className="font-semibold text-slate-950">{payment.paymentReference}</p><p className="mt-1 text-xs text-slate-500">{label(payment.purpose)} · {label(payment.method)}</p></td>
              <td className="p-3"><p className="font-semibold">{formatMoney(payment.expected.amountMinor, payment.expected.currency)}</p>{payment.received ? <p className="mt-1 text-xs text-slate-600">Received {formatMoney(payment.received.amountMinor, payment.received.currency)}<br />{formatDate(payment.received.receivedAt)}</p> : <p className="mt-1 text-xs text-slate-400">No receipt</p>}</td>
              <td className="p-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{label(payment.status)}</span><p className="mt-2 text-xs text-slate-500">Expires {formatDate(payment.expiresAt)}</p></td>
              <td className="p-3 text-xs text-slate-600"><p>Customer: {payment.customerDocumentId ?? "Guest"}</p><p className="mt-1">Order: {payment.orderDocumentId ?? "—"}</p><p className="mt-1">Membership: {payment.membershipDocumentId ?? "—"}</p></td>
              <td className="max-w-xs p-3">{payment.events.length ? <div className="space-y-2">{payment.events.map((entry) => <div key={entry.eventId} className="text-xs"><p className="font-semibold text-slate-700">{entry.transition}</p><p className="text-slate-500">{entry.actor} · {formatDate(entry.occurredAt)}</p>{entry.reason ? <p className="text-slate-600">{entry.reason}</p> : null}</div>)}</div> : <span className="text-xs text-slate-400">No events</span>}</td>
              <td className="p-3"><div className="flex flex-col items-start gap-2">{payment.method === "bank_transfer" && !terminalStatuses.has(payment.status) ? <button type="button" onClick={() => { setReceiptFor(payment.documentId); setCurrency(payment.expected.currency); }} className={secondaryButtonClass}>Record receipt</button> : null}{mismatchStatuses.has(payment.status) ? <button type="button" onClick={() => setResolutionFor(payment.documentId)} className={buttonClass}>Resolve mismatch</button> : null}</div></td>
            </tr>)}</tbody>
          </table>
        </div>
        {payments.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No payment attempts to reconcile.</p> : null}
      </section>

      {selectedReceipt ? <Modal title={`Record receipt · ${selectedReceipt.paymentReference}`} onClose={() => setReceiptFor(undefined)}>
        <form onSubmit={(event) => void recordReceipt(event)} className="space-y-4">
          <p className="text-sm text-slate-500">Expected {formatMoney(selectedReceipt.expected.amountMinor, selectedReceipt.expected.currency)}. Record the bank-confirmed minor amount exactly.</p>
          <Field label="Received minor amount"><input required min={0} step={1} inputMode="numeric" type="number" value={amountMinor} onChange={(event) => setAmountMinor(event.target.value)} className={inputClass} /></Field>
          <Field label="Currency"><select value={currency} onChange={(event) => setCurrency(event.target.value as PaymentCurrency)} className={inputClass}><option value="RON">RON</option><option value="EUR">EUR</option></select></Field>
          <Field label="Bank reference"><input required value={bankReference} onChange={(event) => setBankReference(event.target.value)} className={inputClass} /></Field>
          <div className="flex gap-2"><button disabled={busy || !validAmount || !bankReference.trim()} className={buttonClass}>Record receipt</button><button type="button" onClick={() => setReceiptFor(undefined)} className={secondaryButtonClass}>Cancel</button></div>
        </form>
      </Modal> : null}

      {selectedResolution ? <Modal title={`Resolve mismatch · ${selectedResolution.paymentReference}`} onClose={() => setResolutionFor(undefined)}>
        <form onSubmit={(event) => void resolveMismatch(event)} className="space-y-4">
          <p className="text-sm text-slate-500">A reason is required and is preserved in the immutable event history.</p>
          <Field label="Resolution"><select value={resolution} onChange={(event) => setResolution(event.target.value as "accept" | "cancel")} className={inputClass}><option value="accept">Accept and settle</option><option value="cancel">Cancel payment</option></select></Field>
          <Field label="Reason"><textarea required rows={4} value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass} /></Field>
          <div className="flex gap-2"><button disabled={busy || !reason.trim()} className={buttonClass}>Record resolution</button><button type="button" onClick={() => setResolutionFor(undefined)} className={secondaryButtonClass}>Cancel</button></div>
        </form>
      </Modal> : null}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><div className="mb-4 flex items-start justify-between gap-3"><h2 className="text-xl font-bold">{title}</h2><button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500">Close</button></div>{children}</div></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-semibold">{label}<span className="mt-1 block">{children}</span></label>; }
function label(value: string) { return value.replaceAll("_", " "); }
function formatMoney(amountMinor: number, currency: PaymentCurrency) { return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(amountMinor / 100); }
function formatDate(value?: string) { return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 font-normal";
const buttonClass = "rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass = "rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50";
