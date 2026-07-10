import Link from "next/link";
import { getAdminProducts } from "@/lib/admin-api";

export default async function AdminInventoryPage() {
  const products = await getAdminProducts();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
          Stock control
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Inventory</h1>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
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
                          ? "bg-blue-50 text-blue-800"
                          : stock <= 10
                          ? "bg-amber/20 text-slate-700"
                          : "bg-herb/10 text-herb-deep"
                      }`}
                    >
                      {stock === 0 ? "Out" : stock <= 10 ? "Low" : "Healthy"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/products/${product.documentId}`}
                      className="font-semibold text-blue-600"
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

