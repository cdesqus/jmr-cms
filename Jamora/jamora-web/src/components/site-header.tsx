"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart-context";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LOCALE_COOKIE, UI_TEXT, asLocale, type Locale } from "@/lib/i18n";

const NAV = [
  { href: "/", label: "home" },
  { href: "/shop", label: "shop" },
  { href: "/about", label: "story" },
  { href: "/contact", label: "contact" },
];

export function SiteHeader() {
  const { count, openCart } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");
  const text = UI_TEXT[locale];

  useEffect(() => {
    const cookieLocale = document.cookie
      .split("; ")
      .find((item) => item.startsWith(`${LOCALE_COOKIE}=`))
      ?.split("=")[1];
    setLocale(asLocale(cookieLocale ?? (navigator.language.toLowerCase().startsWith("ro") ? "ro" : "en")));
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-clay/60 bg-cream/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">
            Jamora
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm font-medium text-bark transition-colors hover:text-terracotta"
            >
              {text[item.label]}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link
            href="/track"
            className="hidden rounded-full border border-clay bg-white/60 px-4 py-2 text-sm font-medium text-bark transition-colors hover:border-terracotta hover:text-terracotta sm:inline-flex"
          >
            {text.track}
          </Link>
          <button
            type="button"
            onClick={openCart}
            className="relative rounded-full border border-clay bg-white/60 px-4 py-2 text-sm font-medium text-bark transition-colors hover:border-terracotta hover:text-terracotta"
          >
            {text.cart}
            {count > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-terracotta px-1 text-[0.65rem] font-bold text-cream">
                {count}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-md p-2 text-bark md:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="border-t border-clay/60 bg-cream px-5 py-3 md:hidden">
          <Link
            href="/track"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm font-medium text-bark hover:text-terracotta sm:hidden"
          >
            {text.trackOrder}
          </Link>
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm font-medium text-bark hover:text-terracotta"
            >
              {text[item.label]}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
