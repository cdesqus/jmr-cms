import Link from "next/link";
import { notFound } from "next/navigation";
import { adminProductToProduct, getAdminProducts } from "@/lib/admin-api";
import { ProductVisual } from "@/components/product-visual";
import { AdminProductForm } from "@/components/admin-product-form";

export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const products = await getAdminProducts();
  const product = products.find((item) => item.documentId === documentId);
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="text-sm font-semibold text-terracotta">
        Back to products
      </Link>
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <div className="rounded-xl border border-clay bg-cream p-5">
          <ProductVisual
            product={adminProductToProduct(product)}
            className="aspect-[4/5] w-full"
          />
          <h1 className="mt-5 font-display text-3xl text-ink">{product.name}</h1>
          <p className="mt-1 text-sm text-stone">{product.slug}</p>
        </div>
        <AdminProductForm product={product} />
      </div>
    </div>
  );
}
