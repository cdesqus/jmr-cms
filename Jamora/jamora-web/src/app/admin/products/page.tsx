import Link from "next/link";
import {
  adminProductToProduct,
  formatAdminMoney,
  getAdminProducts,
} from "@/lib/admin-api";
import { ProductVisual } from "@/components/product-visual";
import { AdminStockForm } from "@/components/admin-stock-form";

export default async function AdminProductsPage() {
  const products = await getAdminProducts();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            Catalogue
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Products</h1>
        </div>
        <Link
          href="/admin/products/new"
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
        >
          Create product
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {products.map((product) => (
          <article
            key={product.documentId}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <Link
              href={`/admin/products/${product.documentId}`}
              className="grid grid-cols-[96px_1fr_auto] gap-4 hover:text-blue-700"
            >
              <ProductVisual product={adminProductToProduct(product)} className="h-28 w-24" />
              <div>
                <p className="text-lg font-bold text-slate-950">{product.name}</p>
                <p className="mt-1 text-sm text-slate-500">{product.tagline}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                  {product.category}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatAdminMoney(product.priceCents)}</p>
                <p className="mt-2 text-sm text-slate-500">{product.stock ?? 0} stock</p>
                <p className="mt-1 text-xs text-slate-400">
                  min {product.minStock ?? 10} · max {product.maxStock ?? 100}
                </p>
                {(product.stock ?? 0) <= (product.minStock ?? 10) ? (
                  <p className="mt-2 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                    Low stock
                  </p>
                ) : product.featured ? (
                  <p className="mt-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                    Featured
                  </p>
                ) : null}
              </div>
            </Link>
            <AdminStockForm product={product} />
          </article>
        ))}
      </div>
    </div>
  );
}
