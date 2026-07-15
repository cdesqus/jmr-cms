import { AdminPromotionsManager } from "@/components/admin-promotions-manager";
import { getAdminProducts, getAdminPromotions } from "@/lib/admin-api";

export default async function AdminPromotionsPage() {
  const [promotions, products] = await Promise.all([
    getAdminPromotions().catch(() => []),
    getAdminProducts().catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
          Commerce
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Promotions</h1>
        <p className="mt-2 text-sm text-slate-500">
          Create coupons, schedule campaigns, and control product eligibility.
        </p>
      </div>
      <AdminPromotionsManager promotions={promotions} products={products} />
    </div>
  );
}
