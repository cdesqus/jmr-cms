import Link from "next/link";

const CONTENT_AREAS = [
  {
    title: "Homepage",
    description: "Hero copy, featured product order, and storefront highlights.",
    status: "Next CMS module",
  },
  {
    title: "Story pages",
    description: "Our Story, contact text, certifications, and FAQ blocks.",
    status: "Next CMS module",
  },
  {
    title: "Raw content console",
    description: "Use Strapi when a field is not yet exposed in Jamora Admin.",
    status: "Available now",
    href: "/strapi-admin",
  },
];

export const metadata = {
  title: "Content Admin",
};

export default function AdminContentPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">
          Storefront CMS
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Content</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Area ini disiapkan supaya konten website bisa diedit dari satu admin
          URL. Product, inventory, shipping, dan analytics sudah punya menu
          khusus.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {CONTENT_AREAS.map((area) => (
          <section
            key={area.title}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold">{area.title}</h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {area.status}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {area.description}
            </p>
            {area.href ? (
              <Link
                href={area.href}
                className="mt-5 inline-flex rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
              >
                Open Strapi Console
              </Link>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
