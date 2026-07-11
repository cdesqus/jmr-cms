import Link from "next/link";
import { AdminProductCreateForm } from "@/components/admin-product-create-form";

export const metadata = {
  title: "Create Product",
};

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="text-sm font-semibold text-blue-600">
        Back to products
      </Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
          Catalogue
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          Create product
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Add catalogue details, stock thresholds, and product photo.
        </p>
      </div>
      <AdminProductCreateForm />
    </div>
  );
}
