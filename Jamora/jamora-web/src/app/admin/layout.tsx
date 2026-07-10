import Link from "next/link";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/shipping", label: "Shipping" },
  { href: "/admin/analytics", label: "Analytics" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f7f4] text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-clay bg-cream px-5 py-6 lg:block">
        <Link href="/admin" className="font-display text-3xl font-semibold">
          Jamora
        </Link>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-stone">
          Shop Admin
        </p>
        <nav className="mt-8 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm font-semibold text-bark hover:bg-sand"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/"
          className="absolute bottom-6 left-5 right-5 rounded-lg border border-clay px-3 py-2 text-center text-sm font-semibold text-bark hover:border-terracotta hover:text-terracotta"
        >
          Open storefront
        </Link>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-clay bg-cream/90 px-5 py-4 backdrop-blur lg:hidden">
          <div className="font-display text-2xl font-semibold">Jamora Admin</div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-full border border-clay px-3 py-1.5 text-xs font-semibold text-bark"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="px-5 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

