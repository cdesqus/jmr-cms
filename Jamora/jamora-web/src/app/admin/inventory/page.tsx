import Link from "next/link";
import { getAdminProducts } from "@/lib/admin-api";

export default async function AdminInventoryPage() {
  const products = await getAdminProducts();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta">
          Stock control
        </p>
        <h1 className="mt-2 font-display text-4xl text-ink">Inventory</h1>
      </div>

      <div className="overflow-hidden rounded-xl border border-clay bg-cream">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-clay bg-sand/40 text-xs uppercase tracking-[0.12em] text-stone">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-clay/70">
            {products.map((product) => {
              const stock = product.stock ?? 0;
              return (
                <tr key={product.documentId} className="bg-white/60">
                  <td className="px-4 py-3 font-semibold">{product.name}</td>
                  <td className="px-4 py-3">{product.category}</td>
                  <td className="px-4 py-3">{stock}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        stock === 0
                          ? "bg-terracotta/10 text-terracotta-deep"
                          : stock <= 10
                          ? "bg-amber/20 text-bark"
                          : "bg-herb/10 text-herb-deep"
                      }`}
                    >
                      {stock === 0 ? "Out" : stock <= 10 ? "Low" : "Healthy"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/products/${product.documentId}`}
                      className="font-semibold text-terracotta"
                    >
                      Edit stock
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

