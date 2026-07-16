import { AdminCustomersTable } from "@/components/admin-customers-table";
import { formatAdminMoney, getAdminCustomers } from "@/lib/admin-api";

export default async function AdminCustomersPage() {
  const customers = await getAdminCustomers().catch(() => []);
  const repeatCustomers = customers.filter((customer) => customer.orderCount > 1).length;
  const totalLifetimeValue = customers.reduce(
    (sum, customer) => sum + customer.lifetimeValueCents,
    0,
  );
  const averageValue = customers.length > 0
    ? Math.round(totalLifetimeValue / customers.length)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">CRM</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Customers</h1>
        <p className="mt-2 text-sm text-slate-500">
          Lightweight customer profiles generated from storefront order history.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Customers" value={customers.length.toLocaleString()} />
        <Metric label="Repeat customers" value={repeatCustomers.toLocaleString()} />
        <Metric label="Customer revenue" value={formatAdminMoney(totalLifetimeValue)} />
        <Metric label="Avg. customer value" value={formatAdminMoney(averageValue)} />
      </section>

      <AdminCustomersTable customers={customers} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
