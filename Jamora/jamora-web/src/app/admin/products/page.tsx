import Link from "next/link";
import {
  adminProductToProduct,
  formatAdminMoney,
  getAdminProducts,
} from "@/lib/admin-api";
import { ProductVisual } from "@/components/product-visual";

export default async function AdminProductsPage() {
  const products = await getAdminProducts();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta">
          Catalogue
        </p>
        <h1 className="mt-2 font-display text-4xl text-ink">Products</h1>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {products.map((product) => (
          <Link
            key={product.documentId}
            href={`/admin/products/${product.documentId}`}
            className="grid grid-cols-[96px_1fr_auto] gap-4 rounded-xl border border-clay bg-cream p-4 hover:border-terracotta"
          >
            <ProductVisual product={adminProductToProduct(product)} className="h-28 w-24" />
            <div>
              <p className="font-display text-xl text-ink">{product.name}</p>
              <p className="mt-1 text-sm text-stone">{product.tagline}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-bark">
                {product.category}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatAdminMoney(product.priceCents)}</p>
              <p className="mt-2 text-sm text-stone">{product.stock ?? 0} stock</p>
              {product.featured && (
                <p className="mt-2 rounded-full bg-sand px-3 py-1 text-xs font-semibold">
                  Featured
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
