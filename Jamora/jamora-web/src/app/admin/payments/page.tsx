import { notFound, redirect } from "next/navigation";
import { AdminPaymentManager } from "@/components/admin-payment-manager";
import { getAdminIdentity } from "@/lib/admin-session";
import { getAdminPayments } from "@/lib/payment-api";
import { isPaymentsEnabled } from "@/lib/payment-admin-policy.cjs";

export default async function AdminPaymentsPage() {
  if (!isPaymentsEnabled(process.env)) notFound();
  const identity = await getAdminIdentity();
  if (identity?.role !== "owner") redirect("/admin");
  const payments = await getAdminPayments();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Finance operations</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Payment reconciliation</h1>
        <p className="mt-2 text-sm text-slate-500">
          Record bank receipts, resolve mismatches with an audited reason, and expire overdue payment attempts.
        </p>
      </div>
      <AdminPaymentManager payments={payments} />
    </div>
  );
}
