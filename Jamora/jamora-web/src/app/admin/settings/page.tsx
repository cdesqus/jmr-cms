import Link from "next/link";

export const metadata = {
  title: "Admin Settings",
};

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">
          Admin settings
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Pengaturan operasional Jamora Admin. Raw Strapi tetap tersedia untuk
          superadmin/developer saat butuh akses field yang belum dibuatkan UI.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Developer console</h2>
        <p className="mt-2 text-sm text-slate-500">
          Buka Strapi Admin untuk konfigurasi CMS low-level, permission, dan
          schema. Untuk kerja harian toko, gunakan menu Jamora Admin di sidebar.
        </p>
        <Link
          href="/strapi-admin"
          className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
        >
          Open Strapi Console
        </Link>
      </section>
    </div>
  );
}
