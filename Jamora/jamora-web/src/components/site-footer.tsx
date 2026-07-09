import Link from "next/link";
import { SocialLinks } from "@/components/social-links";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-clay/60 bg-sand/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <span className="font-display text-2xl font-semibold text-ink">Jamora</span>
          <p className="mt-3 max-w-xs text-sm text-stone">
            100% Made in Indonesia, standardised for Europe. Energi · Digestie ·
            Echlibru.
          </p>
          <SocialLinks className="mt-5" />
        </div>
        <div>
          <h3 className="eyebrow text-stone">Shop</h3>
          <ul className="mt-4 space-y-2 text-sm text-bark">
            <li><Link href="/shop?c=energy" className="hover:text-terracotta">Energy</Link></li>
            <li><Link href="/shop?c=digestion" className="hover:text-terracotta">Digestion</Link></li>
            <li><Link href="/shop?c=balance" className="hover:text-terracotta">Balance</Link></li>
            <li><Link href="/shop" className="hover:text-terracotta">All products</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="eyebrow text-stone">Company</h3>
          <ul className="mt-4 space-y-2 text-sm text-bark">
            <li><Link href="/about" className="hover:text-terracotta">Our Story</Link></li>
            <li><Link href="/about#sourcing" className="hover:text-terracotta">Sourcing</Link></li>
            <li><Link href="/contact" className="hover:text-terracotta">Contact</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-clay/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-stone sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Jamora. All rights reserved.</p>
          <p>Prices in EUR (€), inclusive of applicable VAT.</p>
        </div>
      </div>
    </footer>
  );
}
