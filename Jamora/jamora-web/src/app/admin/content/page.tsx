import { getStoreContent } from "@/lib/admin-api";
import { AdminContentForm } from "@/components/admin-content-form";

export const metadata = {
  title: "Content Admin",
};

export default async function AdminContentPage() {
  const content = await getStoreContent();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">
          Storefront CMS
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Content</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Edit copy utama website. Perubahan ini dipakai storefront setelah
          halaman refresh atau cache revalidate.
        </p>
      </div>

      <AdminContentForm content={content} />
    </div>
  );
}
